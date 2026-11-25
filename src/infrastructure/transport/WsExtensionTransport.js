import { WebSocketServer, WebSocket } from 'ws';
import { ITransport } from '../../domain/contracts/ITransport.js';

export class WsExtensionTransport extends ITransport {
  constructor(options = {}) {
    super();
    this.wss = options.wss || new WebSocketServer({ noServer: true });
    this.pendingRequests = new Map();
    this.listeners = new Map();
    this.clientCounter = 0;
  }

  attachToHttpServer(server) {
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (wsClient) => {
          this.wss.emit('connection', wsClient, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      const tempId = `conn_${++this.clientCounter}`;
      ws.tempId = tempId;

      this.emit('connection', ws, tempId);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.emit('message', ws, msg);

          // Route response back to pending request
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject, timer } = this.pendingRequests.get(msg.id);
            clearTimeout(timer);
            this.pendingRequests.delete(msg.id);
            if (msg.success) {
              resolve(msg.result);
            } else {
              reject(new Error(msg.error || 'Error desconocido reportado por la extensión de Chrome'));
            }
          }
        } catch (err) {
          console.error('[WsExtensionTransport] Error procesando mensaje:', err);
        }
      });

      ws.on('close', () => {
        // Reject pending requests assigned to this socket
        for (const [id, req] of this.pendingRequests.entries()) {
          if (req.targetSocket === ws) {
            clearTimeout(req.timer);
            req.reject(new Error('Conexión con la extensión cerrada mientras se esperaba respuesta'));
            this.pendingRequests.delete(id);
          }
        }
        this.emit('close', ws);
      });
    });
  }

  send(target, message, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      // Target can be a ws socket directly, or an object with a .ws property
      let socket = target;
      if (target && typeof target === 'object' && target.ws !== undefined) {
        socket = target.ws;
      }

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return reject(new Error('No hay conexión activa con la extensión de Chrome para el perfil seleccionado'));
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(message.id)) {
          this.pendingRequests.delete(message.id);
          reject(new Error(`Timeout (${timeoutMs}ms) esperando respuesta de acción: "${message.action}"`));
        }
      }, timeoutMs);

      this.pendingRequests.set(message.id, { resolve, reject, timer, targetSocket: socket });

      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(message.id);
        reject(err);
      }
    });
  }

  broadcast(message) {
    const raw = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  emit(event, ...args) {
    const list = this.listeners.get(event) || [];
    list.forEach(fn => fn(...args));
  }

  hasClients() {
    return this.wss.clients.size > 0;
  }

  getClient(clientId) {
    for (const client of this.wss.clients) {
      if (client.tempId === clientId) return client;
    }
    return null;
  }
}
