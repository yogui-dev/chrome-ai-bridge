import test from 'node:test';
import assert from 'node:assert/strict';
import { MockTransport } from '../../../src/infrastructure/transport/MockTransport.js';
import { ActionRegistry } from '../../../src/application/actions/ActionRegistry.js';
import { GenericActionHandler } from '../../../src/application/actions/GenericActionHandler.js';
import { ActionEnvelope } from '../../../src/domain/entities/ActionEnvelope.js';

test('ActionRegistry dispatches to registered handler or falls back to GenericActionHandler', async () => {
  const transport = new MockTransport();
  transport.setResponse('click', { clicked: true });

  const registry = new ActionRegistry();
  const genericHandler = new GenericActionHandler(transport);
  registry.setDefaultHandler(genericHandler);

  const envelope = new ActionEnvelope({ action: 'click', params: { tabId: 101 } });
  const handler = registry.getHandler(envelope.action);

  assert.equal(handler, genericHandler);

  const result = await handler.handle(envelope, { targetClientId: 'client_1' });
  assert.equal(result.clicked, true);
});
