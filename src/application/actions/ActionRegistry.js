export class ActionRegistry {
  constructor() {
    this.handlers = [];
    this.defaultHandler = null;
  }

  register(handler) {
    this.handlers.unshift(handler);
  }

  setDefaultHandler(handler) {
    this.defaultHandler = handler;
  }

  getHandler(actionName) {
    for (const handler of this.handlers) {
      if (handler.canHandle(actionName)) {
        return handler;
      }
    }
    return this.defaultHandler;
  }
}
