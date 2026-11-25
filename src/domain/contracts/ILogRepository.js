export class ILogRepository {
  addLog(tabId, logEntry) { throw new Error('Not implemented: addLog'); }
  getLogs(tabId) { throw new Error('Not implemented: getLogs'); }
  addNetworkError(tabId, errorEntry) { throw new Error('Not implemented: addNetworkError'); }
  getNetworkErrors(tabId) { throw new Error('Not implemented: getNetworkErrors'); }
  clearTab(tabId) { throw new Error('Not implemented: clearTab'); }
}
