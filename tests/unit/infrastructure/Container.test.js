import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../../../src/infrastructure/container/Container.js';
import { MockTransport } from '../../../src/infrastructure/transport/MockTransport.js';

test('Container wires dependencies and supports dependency overrides for testing', () => {
  const mockTransport = new MockTransport();
  const container = new Container({ transport: mockTransport });

  assert.ok(container.profileRegistry);
  assert.ok(container.logRepository);
  assert.ok(container.actionRegistry);
  assert.ok(container.executeActionUseCase);
  assert.ok(container.registerProfileUseCase);
  assert.ok(container.listProfilesUseCase);
  assert.equal(container.transport, mockTransport);
});
