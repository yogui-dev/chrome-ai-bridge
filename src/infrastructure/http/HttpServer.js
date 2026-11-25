import http from 'node:http';
import { ActionEnvelope } from '../../domain/entities/ActionEnvelope.js';
import { WebSocket } from 'ws';

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(new Error(`JSON malformado: ${err.message}`)); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export class HttpServer {
  constructor(container, port = 9224) {
    this.container = container;
    this.port = port;
    this.server = http.createServer(this._handleRequest.bind(this));
    this.container.transport.attachToHttpServer(this.server);
    this._wireTransportEvents();
  }

  _wireTransportEvents() {
    const { transport, profileRegistry, logRepository, registerProfileUseCase } = this.container;

    transport.on('connection', (ws, tempId) => {
      registerProfileUseCase.execute({
        profileId: tempId,
        profileName: `Cliente #${transport.clientCounter}`,
        tabs: []
      }, ws);
    });

    transport.on('message', (ws, msg) => {
      if (msg.type === 'register_profile') {
        registerProfileUseCase.execute(msg, ws);

      } else if (msg.type === 'tab_logs') {
        const profileId = msg.profileId || profileRegistry.getProfileIdByTab(msg.tabId);
        const profile = profileId ? profileRegistry.getById(profileId) : null;
        if (Array.isArray(msg.logs)) {
          msg.logs.forEach(log => {
            logRepository.addLog(msg.tabId, { ...log, profileId, profileName: profile?.name || null });
          });
        }

      } else if (msg.type === 'tab_network_error') {
        const profileId = msg.profileId || profileRegistry.getProfileIdByTab(msg.tabId);
        const profile = profileId ? profileRegistry.getById(profileId) : null;
        if (msg.networkError) {
          logRepository.addNetworkError(msg.tabId, {
            ...msg.networkError,
            profileId,
            profileName: profile?.name || null
          });
        }

      } else if (msg.type === 'tab_closed') {
        logRepository.clearTab(msg.tabId);
        for (const prof of profileRegistry.listProfiles()) {
          prof.removeTab(msg.tabId);
        }
      }
    });

    transport.on('close', (ws) => {
      for (const prof of profileRegistry.listProfiles()) {
        if (prof.ws === ws) prof.ws = null;
      }
    });
  }

  async _handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // --- /health or /status ---
    if (url.pathname === '/health' || url.pathname === '/status') {
      const isConnected = this.container.transport.hasClients();
      const allProfiles = this.container.profileRegistry.listProfiles();
      const profilesList = [];
      let allTabs = [];

      for (const prof of allProfiles) {
        if (prof.ws && prof.ws.readyState === WebSocket.OPEN) {
          // Try to refresh tabs via extension
          try {
            const tabs = await this.container.transport.send(
              prof.ws,
              { id: `list_${Date.now()}`, action: 'list_tabs', params: {} },
              2000
            );
            if (Array.isArray(tabs)) {
              prof.setTabs(tabs);
              tabs.forEach(t => this.container.profileRegistry.mapTabToProfile(t.tabId, prof.id));
            }
          } catch (_) {}

          const tabs = prof.tabs || [];
          profilesList.push({
            id: prof.id,
            name: prof.name,
            tabsCount: tabs.length,
            tabs: tabs.map(t => ({ ...t, profileId: prof.id, profileName: prof.name }))
          });
          allTabs.push(...tabs.map(t => ({ ...t, profileId: prof.id, profileName: prof.name })));
        }
      }

      // Compatibility: anonymous clients (no register_profile sent)
      if (profilesList.length === 0 && isConnected) {
        try {
          // Try any open client
          for (const client of this.container.transport.wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
              const tabs = await this.container.transport.send(
                client,
                { id: `list_anon_${Date.now()}`, action: 'list_tabs', params: {} },
                2000
              );
              allTabs = tabs || [];
              break;
            }
          }
        } catch (_) {}
      }

      sendJson(res, 200, {
        ok: true,
        port: this.port,
        extensionConnected: isConnected,
        profilesCount: profilesList.length,
        profiles: profilesList,
        tabsCount: allTabs.length,
        tabs: allTabs
      });
      return;
    }

    // --- /profiles ---
    if (url.pathname === '/profiles') {
      const profiles = this.container.profileRegistry.listProfiles().map(p => ({
        id: p.id,
        name: p.name,
        tabsCount: p.tabs ? p.tabs.length : 0,
        connectedAt: p.connectedAt,
        lastSeen: p.lastSeen
      }));
      sendJson(res, 200, { ok: true, count: profiles.length, profiles });
      return;
    }

    // --- POST /action ---
    if (url.pathname === '/action' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (!body.action) {
          sendJson(res, 400, { error: 'Falta campo "action"' });
          return;
        }
        const envelope = new ActionEnvelope({
          action: body.action,
          params: body.params || {},
          profile: body.profile || null,
          timeout: body.timeout || 15000
        });
        const result = await this.container.executeActionUseCase.execute(envelope);
        sendJson(res, 200, { ok: true, action: body.action, result });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message || String(err) });
      }
      return;
    }

    // --- /logs/:tabId ---
    if (url.pathname.startsWith('/logs/')) {
      const tabId = parseInt(url.pathname.replace('/logs/', ''), 10);
      const logs = this.container.logRepository.getLogs(tabId);
      sendJson(res, 200, { ok: true, tabId, count: logs.length, logs });
      return;
    }

    // --- /network/:tabId ---
    if (url.pathname.startsWith('/network/')) {
      const tabId = parseInt(url.pathname.replace('/network/', ''), 10);
      const errors = this.container.logRepository.getNetworkErrors(tabId);
      sendJson(res, 200, { ok: true, tabId, count: errors.length, networkErrors: errors });
      return;
    }

    sendJson(res, 404, { error: 'Endpoint no encontrado' });
  }

  listen() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => resolve(this.server));
    });
  }

  close() {
    return new Promise((resolve) => this.server.close(resolve));
  }
}
