export class Profile {
  constructor({
    id,
    name = '',
    ws = null,
    tabs = [],
    connectedAt = Date.now(),
    lastSeen = Date.now()
  }) {
    if (!id) throw new Error('Profile id is required');
    this.id = String(id);
    this.name = name || `Cliente #${id}`;
    this.ws = ws;
    this.tabs = tabs;
    this.connectedAt = connectedAt;
    this.lastSeen = lastSeen;
  }

  updateLastSeen(timestamp = Date.now()) {
    this.lastSeen = timestamp;
  }

  setTabs(tabs = []) {
    this.tabs = tabs;
  }

  addTab(tab) {
    this.tabs = this.tabs.filter(t => t.tabId !== tab.tabId);
    this.tabs.push(tab);
  }

  removeTab(tabId) {
    this.tabs = this.tabs.filter(t => t.tabId !== tabId);
  }
}
