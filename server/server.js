import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'screenshots');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9224;

// Asegurar que exista la carpeta de capturas
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let clientCounter = 0;
let requestCounter = 0;
const pendingRequests = new Map(); // id -> { resolve, reject, timer }

// Gestión Multi-Perfil
// connectedProfiles: Map<string, { id: string, name: string, ws: WebSocket, tabs: Array, connectedAt: number, lastSeen: number }>
const connectedProfiles = new Map();
// tabToProfile: Map<number, string> (tabId -> profileId)
const tabToProfile = new Map();

// Logs en memoria de las pestañas activas
const tabLogs = new Map(); // tabId -> Array<{ type, level, text, timestamp, profileId, profileName }>
const tabNetworkErrors = new Map(); // tabId -> Array<{ type, status, url, errorText, timestamp, profileId, profileName }>

/**
 * Busca el WebSocket del perfil destino según profileId/nombre o tabId
 */
function findTargetSocket(targetProfile = null, tabId = null) {
  // 1. Si se especificó un perfil objetivo (por ID o por nombre)
  if (targetProfile) {
    const query = String(targetProfile).trim().toLowerCase();
    if (connectedProfiles.has(targetProfile)) {
      return connectedProfiles.get(targetProfile).ws;
    }
    for (const prof of connectedProfiles.values()) {
      if (prof.id.toLowerCase() === query || prof.name.toLowerCase() === query) {
        return prof.ws;
      }
    }
    for (const prof of connectedProfiles.values()) {
      if (prof.id.toLowerCase().includes(query) || prof.name.toLowerCase().includes(query)) {
        return prof.ws;
      }
    }
    const available = Array.from(connectedProfiles.values()).map(p => `"${p.name}" (ID: ${p.id})`).join(', ');
    throw new Error(`Perfil "${targetProfile}" no encontrado. Perfiles activos: ${available || 'ninguno'}`);
  }

  // 2. Si se especificó un tabId y sabemos a qué perfil pertenece
  if (tabId !== null && tabId !== undefined) {
    const numTabId = parseInt(tabId, 10);
    if (tabToProfile.has(numTabId)) {
      const profId = tabToProfile.get(numTabId);
      if (connectedProfiles.has(profId)) {
        return connectedProfiles.get(profId).ws;
      }
      for (const prof of connectedProfiles.values()) {
        if (prof.id === profId || prof.name === profId || prof.id.toLowerCase() === String(profId).toLowerCase() || prof.name.toLowerCase() === String(profId).toLowerCase()) {
          return prof.ws;
        }
      }
    }
  }

  // 3. Si solo hay un perfil conectado, usarlo directamente
  if (connectedProfiles.size === 1) {
    return Array.from(connectedProfiles.values())[0].ws;
  }

  // 4. Si hay múltiples perfiles, buscar el más recientemente activo o conectado
  const sorted = Array.from(connectedProfiles.values()).sort((a, b) => (b.lastSeen - a.lastSeen) || (b.connectedAt - a.connectedAt));
  for (const prof of sorted) {
    if (prof.ws && prof.ws.readyState === WebSocket.OPEN) {
      return prof.ws;
    }
  }

  // Fallback: cualquier cliente WebSocket activo en el servidor
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      return client;
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  // Configurar CORS para permitir llamadas locales
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Endpoint: Health / Status
  if (url.pathname === '/health' || url.pathname === '/status') {
    const isConnected = wss.clients.size > 0;
    const profilesList = [];
    let allTabs = [];

    for (const [profId, prof] of connectedProfiles.entries()) {
      if (prof.ws && prof.ws.readyState === WebSocket.OPEN) {
        let tabs = prof.tabs || [];
        try {
          // Refrescar tabs del perfil en vivo
          tabs = await sendToExtension('list_tabs', {}, 2000, profId);
          prof.tabs = tabs;
          tabs.forEach(t => tabToProfile.set(t.tabId, profId));
        } catch (_) {}

        profilesList.push({
          id: prof.id,
          name: prof.name,
          tabsCount: tabs.length,
          tabs: tabs.map(t => ({ ...t, profileId: prof.id, profileName: prof.name }))
        });
        allTabs.push(...tabs.map(t => ({ ...t, profileId: prof.id, profileName: prof.name })));
      }
    }

    // Compatibilidad con pruebas unitarias o clientes anónimos
    if (profilesList.length === 0 && isConnected) {
      try {
        const tabs = await sendToExtension('list_tabs', {}, 2000);
        allTabs = tabs;
      } catch (_) {}
    }

    sendJson(res, 200, {
      ok: true,
      port: PORT,
      extensionConnected: isConnected,
      profilesCount: profilesList.length,
      profiles: profilesList,
      tabsCount: allTabs.length,
      tabs: allTabs
    });
    return;
  }

  // Endpoint: Lista de perfiles
  if (url.pathname === '/profiles') {
    const profiles = Array.from(connectedProfiles.values()).map(p => ({
      id: p.id,
      name: p.name,
      tabsCount: p.tabs ? p.tabs.length : 0,
      connectedAt: p.connectedAt,
      lastSeen: p.lastSeen
    }));
    sendJson(res, 200, { ok: true, count: profiles.length, profiles });
    return;
  }

  // Endpoint: Ejecutar acción
  if (url.pathname === '/action' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { action, params = {}, profile = null, timeout = 15000 } = body;

      if (!action) {
        sendJson(res, 400, { error: 'Falta campo "action"' });
        return;
      }

      const result = await sendToExtension(action, params, timeout, profile);

      // Si fue crear pestaña, mapearla al perfil correspondiente
      if (action === 'create_tab' && result?.tabId) {
        const profId = profile || findProfileIdByTabOrSocket(result.tabId);
        if (profId) tabToProfile.set(result.tabId, profId);
      }

      // Si fue captura de pantalla, guardarla automáticamente a disco
      if (action === 'take_screenshot' && result?.dataUrl) {
        const base64Data = result.dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const filename = `screenshot-tab${result.tabId}-${Date.now()}.png`;
        const filepath = path.join(SCREENSHOTS_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
        result.savedFilePath = filepath;
        result.filename = filename;
      }

      sendJson(res, 200, { ok: true, action, result });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
    return;
  }

  // Endpoint: Obtener logs de una pestaña
  if (url.pathname.startsWith('/logs/')) {
    const tabId = parseInt(url.pathname.replace('/logs/', ''), 10);
    const logs = tabLogs.get(tabId) || [];
    sendJson(res, 200, { ok: true, tabId, count: logs.length, logs });
    return;
  }

  // Endpoint: Obtener errores de red de una pestaña
  if (url.pathname.startsWith('/network/')) {
    const tabId = parseInt(url.pathname.replace('/network/', ''), 10);
    const errors = tabNetworkErrors.get(tabId) || [];
    sendJson(res, 200, { ok: true, tabId, count: errors.length, networkErrors: errors });
    return;
  }

  sendJson(res, 404, { error: 'Endpoint no encontrado' });
});

function findProfileIdByTabOrSocket(tabId) {
  if (tabToProfile.has(tabId)) return tabToProfile.get(tabId);
  if (connectedProfiles.size === 1) return Array.from(connectedProfiles.keys())[0];
  return null;
}

// Configurar WebSocket Server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (wsClient) => {
      wss.emit('connection', wsClient, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const tempId = `conn_${++clientCounter}`;
  ws.tempId = tempId;
  let currentProfileId = tempId;

  // Registro temporal inicial (compatible con tests y clientes sin saludo inicial)
  connectedProfiles.set(tempId, {
    id: tempId,
    name: `Cliente #${clientCounter}`,
    ws,
    tabs: [],
    connectedAt: Date.now(),
    lastSeen: Date.now()
  });

  console.log(`[Server] 🔌 Nueva conexión WebSocket (${tempId})`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Saludo o Registro de Perfil desde la extensión
      if (msg.type === 'register_profile' || msg.type === 'bridge_connected') {
        const profileId = msg.profileId || currentProfileId;
        const profileName = msg.profileName || profileId;

        // Limpiar registro temporal anterior si cambia el ID
        if (currentProfileId !== profileId) {
          connectedProfiles.delete(currentProfileId);
        }

        currentProfileId = profileId;
        ws.profileId = profileId;

        const tabs = msg.tabs || [];
        connectedProfiles.set(profileId, {
          id: profileId,
          name: profileName,
          ws,
          tabs,
          connectedAt: Date.now(),
          lastSeen: Date.now()
        });

        tabs.forEach(t => tabToProfile.set(t.tabId, profileId));
        console.log(`[Server] 👤 Perfil de Chrome activo: "${profileName}" (ID: ${profileId}) con ${tabs.length} pestaña(s)`);
        return;
      }

      // Heartbeat de keepalive
      if (msg.type === 'heartbeat') {
        if (connectedProfiles.has(currentProfileId)) {
          connectedProfiles.get(currentProfileId).lastSeen = Date.now();
        }
        return;
      }

      // Manejar respuesta de una petición pendiente
      if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve, reject, timer } = pendingRequests.get(msg.id);
        clearTimeout(timer);
        pendingRequests.delete(msg.id);

        if (msg.success) {
          resolve(msg.result);
        } else {
          reject(new Error(msg.error || 'Error desconocido reportado por la extensión'));
        }
        return;
      }

      // Manejar eventos en vivo de la pestaña
      if (msg.type === 'tab_log' || msg.type === 'tab_error') {
        const tabId = msg.tabId;
        if (!tabLogs.has(tabId)) tabLogs.set(tabId, []);
        const entry = msg.log || msg.error;
        entry.profileId = msg.profileId || currentProfileId;
        entry.profileName = msg.profileName || connectedProfiles.get(currentProfileId)?.name || 'default';
        tabLogs.get(tabId).push(entry);

        const prefix = entry.level === 'error' ? '❌' : (entry.level === 'warning' ? '⚠️' : '📝');
        const profLabel = entry.profileName ? `[${entry.profileName}]` : '';
        console.log(`[Tab #${tabId}]${profLabel}[${msg.sessionName || 'unknown'}] ${prefix} ${entry.level.toUpperCase()}: ${entry.text}`);
      }

      if (msg.type === 'tab_network_error') {
        const tabId = msg.tabId;
        if (!tabNetworkErrors.has(tabId)) tabNetworkErrors.set(tabId, []);
        const entry = msg.networkError;
        entry.profileId = msg.profileId || currentProfileId;
        entry.profileName = msg.profileName || connectedProfiles.get(currentProfileId)?.name || 'default';
        tabNetworkErrors.get(tabId).push(entry);

        const profLabel = entry.profileName ? `[${entry.profileName}]` : '';
        if (entry.status) {
          console.log(`[Tab #${tabId}]${profLabel}[${msg.sessionName || 'unknown'}] 🌐 HTTP ERROR ${entry.status} ${entry.statusText}: ${entry.url}`);
        } else {
          console.log(`[Tab #${tabId}]${profLabel}[${msg.sessionName || 'unknown'}] 🌐 NETWORK FAILED: ${entry.errorText}`);
        }
      }

      if (msg.type === 'tab_closed') {
        tabLogs.delete(msg.tabId);
        tabNetworkErrors.delete(msg.tabId);
        tabToProfile.delete(msg.tabId);
        if (connectedProfiles.has(currentProfileId)) {
          const prof = connectedProfiles.get(currentProfileId);
          prof.tabs = (prof.tabs || []).filter(t => t.tabId !== msg.tabId);
        }
        console.log(`[Server] Tab #${msg.tabId} cerrada.`);
      }
    } catch (err) {
      console.error('[Server] Error procesando mensaje de WebSocket:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[Server] ⚠️ Desconectado perfil/cliente: ${currentProfileId}`);
    if (connectedProfiles.has(currentProfileId) && connectedProfiles.get(currentProfileId).ws === ws) {
      const prof = connectedProfiles.get(currentProfileId);
      if (prof.tabs) {
        prof.tabs.forEach(t => tabToProfile.delete(t.tabId));
      }
      connectedProfiles.delete(currentProfileId);
    }
  });

  ws.on('error', (err) => {
    console.error('[Server] WebSocket error:', err.message);
  });
});

/**
 * Envía un comando a la extensión adecuada y espera respuesta con timeout
 */
export function sendToExtension(action, params = {}, timeoutMs = 15000, targetProfile = null) {
  const profileParam = targetProfile || params.profile;
  const tabIdParam = params.tabId;
  const socket = findTargetSocket(profileParam, tabIdParam);

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('La extensión de Chrome no está conectada. Abre Chrome y verifica el icono de la extensión.'));
  }

  const id = ++requestCounter;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout (${timeoutMs}ms) esperando respuesta de acción: "${action}"`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer });

    socket.send(JSON.stringify({ id, action, params }));
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('JSON inválido en el cuerpo de la petición'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Antigravity Chrome Bridge Server escuchando en:`);
  console.log(`   HTTP API:      http://localhost:${PORT}`);
  console.log(`   WebSocket:     ws://localhost:${PORT}/ws`);
  console.log(`   Screenshots:   ${SCREENSHOTS_DIR}`);
  console.log(`=======================================================`);
});
