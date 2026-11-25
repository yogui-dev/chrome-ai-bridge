import test from 'node:test';
import assert from 'node:assert/strict';
import { MockTransport } from '../../../src/infrastructure/transport/MockTransport.js';
import { InMemoryProfileRegistry } from '../../../src/infrastructure/persistence/InMemoryProfileRegistry.js';
import { ActionRegistry } from '../../../src/application/actions/ActionRegistry.js';
import { GenericActionHandler } from '../../../src/application/actions/GenericActionHandler.js';
import { ExecuteActionUseCase } from '../../../src/application/use-cases/ExecuteActionUseCase.js';
import { RegisterProfileUseCase } from '../../../src/application/use-cases/RegisterProfileUseCase.js';
import { ListProfilesUseCase } from '../../../src/application/use-cases/ListProfilesUseCase.js';
import { ActionEnvelope } from '../../../src/domain/entities/ActionEnvelope.js';

test('Use cases orchestrate profile registration, listing, and action execution', async () => {
  const profileRegistry = new InMemoryProfileRegistry();
  const transport = new MockTransport();
  transport.setResponse('eval_js', { value: 42 });

  const actionRegistry = new ActionRegistry();
  actionRegistry.setDefaultHandler(new GenericActionHandler(transport));

  const registerUseCase = new RegisterProfileUseCase({ profileRegistry });
  const listUseCase = new ListProfilesUseCase({ profileRegistry, transport });
  const executeUseCase = new ExecuteActionUseCase({ profileRegistry, actionRegistry });

  // 1. Register Profile with a fake ws socket reference
  const fakeWs = { id: 'client_sock_1', readyState: 1 };
  registerUseCase.execute({
    profileId: 'p_test',
    profileName: 'Tester',
    tabs: [{ tabId: 111, url: 'https://test.com' }]
  }, fakeWs);

  // 2. List Profiles
  const profiles = await listUseCase.execute();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, 'p_test');

  // 3. Execute Action - targetClientId becomes the ws socket
  const envelope = new ActionEnvelope({
    action: 'eval_js',
    profile: 'p_test',
    params: { code: '21 * 2' }
  });
  const result = await executeUseCase.execute(envelope);
  assert.equal(result.value, 42);
});
