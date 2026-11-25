export class IActionHandler {
  canHandle(actionName) { throw new Error('Not implemented: canHandle'); }
  handle(envelope, context) { throw new Error('Not implemented: handle'); }
}
