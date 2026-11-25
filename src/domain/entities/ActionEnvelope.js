let reqCounter = 0;

export class ActionEnvelope {
  constructor({
    action,
    params = {},
    profile = null,
    timeout = 15000,
    id = null
  }) {
    if (!action) throw new Error('Action is required');
    this.action = action;
    this.params = params;
    this.profile = profile;
    this.timeout = timeout;
    this.id = id || `req_${Date.now()}_${++reqCounter}`;
  }
}
