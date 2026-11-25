export class ITransport {
  send(clientId, message, timeoutMs) { throw new Error('Not implemented: send'); }
  broadcast(message) { throw new Error('Not implemented: broadcast'); }
  on(event, handler) { throw new Error('Not implemented: on'); }
  getClient(clientId) { throw new Error('Not implemented: getClient'); }
  hasClients() { throw new Error('Not implemented: hasClients'); }
}
