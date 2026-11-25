import { IActionHandler } from '../../domain/contracts/IActionHandler.js';

export class CreateTabActionHandler extends IActionHandler {
  constructor(profileRegistry, transport) {
    super();
    this.profileRegistry = profileRegistry;
    this.transport = transport;
  }

  canHandle(actionName) {
    return actionName === 'create_tab';
  }

  async handle(envelope, context = {}) {
    const { targetClientId, targetProfileId } = context;
    const message = {
      id: envelope.id,
      action: envelope.action,
      params: envelope.params
    };
    const result = await this.transport.send(targetClientId, message, envelope.timeout);
    if (result && result.tabId && targetProfileId) {
      this.profileRegistry.mapTabToProfile(result.tabId, targetProfileId);
    }
    return result;
  }
}
