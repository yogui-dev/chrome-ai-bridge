import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryLogRepository } from '../../../src/infrastructure/persistence/InMemoryLogRepository.js';

test('InMemoryLogRepository records and retrieves logs and network errors, and cleans on tab close', () => {
  const repo = new InMemoryLogRepository();

  repo.addLog(101, { type: 'console', text: 'Hello world' });
  repo.addNetworkError(101, { status: 500, url: 'http://test.com/fail' });

  assert.equal(repo.getLogs(101).length, 1);
  assert.equal(repo.getLogs(101)[0].text, 'Hello world');

  assert.equal(repo.getNetworkErrors(101).length, 1);
  assert.equal(repo.getNetworkErrors(101)[0].status, 500);

  repo.clearTab(101);
  assert.equal(repo.getLogs(101).length, 0);
  assert.equal(repo.getNetworkErrors(101).length, 0);
});
