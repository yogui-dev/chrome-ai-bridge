import { IActionHandler } from '../../domain/contracts/IActionHandler.js';

export class ScreenshotActionHandler extends IActionHandler {
  constructor(fileStorage, transport) {
    super();
    this.fileStorage = fileStorage;
    this.transport = transport;
  }

  canHandle(actionName) {
    return actionName === 'take_screenshot';
  }

  async handle(envelope, context = {}) {
    const { targetClientId } = context;
    const message = {
      id: envelope.id,
      action: envelope.action,
      params: envelope.params
    };
    const result = await this.transport.send(targetClientId, message, envelope.timeout);
    if (result && result.dataUrl) {
      const saved = this.fileStorage.saveScreenshot(result.tabId || envelope.params.tabId || 0, result.dataUrl);
      result.savedFilePath = saved.filepath;
      result.filename = saved.filename;
    }
    return result;
  }
}
