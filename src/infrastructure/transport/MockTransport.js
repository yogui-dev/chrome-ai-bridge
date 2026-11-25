import { ITransport } from '../../domain/contracts/ITransport.js';

export class MockTransport extends ITransport {
  constructor() {
    super();
    this.responses = new Map();
    this.sentMessages = [];
    this.listeners = new Map();
  }

  setResponse(action, result) {
    this.responses.set(action, result);
  }

  async send(clientId, message, timeoutMs = 15000) {
    this.sentMessages.push({ clientId, message, timeoutMs });
    if (this.responses.has(message.action)) {
      const res = this.responses.get(message.action);
      if (res instanceof Error) throw res;
      return res;
    }
    return { ok: true, echo: message };
  }

  broadcast(message) {
    this.sentMessages.push({ broadcast: true, message });
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
    return true;
  }

  getClient(clientId) {
    return { id: clientId };
  }
}
