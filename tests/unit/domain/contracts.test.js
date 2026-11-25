import test from 'node:test';
import assert from 'node:assert/strict';
import { ITransport } from '../../../src/domain/contracts/ITransport.js';
import { IProfileRegistry } from '../../../src/domain/contracts/IProfileRegistry.js';
import { ILogRepository } from '../../../src/domain/contracts/ILogRepository.js';
import { IActionHandler } from '../../../src/domain/contracts/IActionHandler.js';

test('Contracts enforce method implementation in derived classes', () => {
  const transport = new ITransport();
  assert.throws(() => transport.send('id', {}), /Not implemented: send/);

  const registry = new IProfileRegistry();
  assert.throws(() => registry.getById('id'), /Not implemented: getById/);

  const logRepo = new ILogRepository();
  assert.throws(() => logRepo.getLogs(101), /Not implemented: getLogs/);

  const handler = new IActionHandler();
  assert.throws(() => handler.handle({}), /Not implemented: handle/);
});
