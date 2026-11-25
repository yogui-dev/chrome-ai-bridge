import { IActionHandler } from '../../domain/contracts/IActionHandler.js';

export class GenericActionHandler extends IActionHandler {
  constructor(transport) {
    super();
    this.transport = transport;
  }

  canHandle(_actionName) {
    return true;
  }

  async handle(envelope, context = {}) {
    const { targetClientId } = context;
    if (!targetClientId) {
      throw new Error('No target client available for action dispatch');
    }
    const message = {
      id: envelope.id,
      action: envelope.action,
      params: envelope.params
    };
    return await this.transport.send(targetClientId, message, envelope.timeout);
  }
}
