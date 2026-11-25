import { ILogRepository } from '../../domain/contracts/ILogRepository.js';

export class InMemoryLogRepository extends ILogRepository {
  constructor(maxEntriesPerTab = 500) {
    super();
    this.maxEntries = maxEntriesPerTab;
    this.tabLogs = new Map();
    this.tabNetworkErrors = new Map();
  }

  addLog(tabId, logEntry) {
    const numId = parseInt(tabId, 10);
    if (!this.tabLogs.has(numId)) this.tabLogs.set(numId, []);
    const list = this.tabLogs.get(numId);
    list.push(logEntry);
    if (list.length > this.maxEntries) list.shift();
  }

  getLogs(tabId) {
    return this.tabLogs.get(parseInt(tabId, 10)) || [];
  }

  addNetworkError(tabId, errorEntry) {
    const numId = parseInt(tabId, 10);
    if (!this.tabNetworkErrors.has(numId)) this.tabNetworkErrors.set(numId, []);
    const list = this.tabNetworkErrors.get(numId);
    list.push(errorEntry);
    if (list.length > this.maxEntries) list.shift();
  }

  getNetworkErrors(tabId) {
    return this.tabNetworkErrors.get(parseInt(tabId, 10)) || [];
  }

  clearTab(tabId) {
    const numId = parseInt(tabId, 10);
    this.tabLogs.delete(numId);
    this.tabNetworkErrors.delete(numId);
  }
}
