import test from 'node:test';
import assert from 'node:assert/strict';
import { MockTransport } from '../../../src/infrastructure/transport/MockTransport.js';
import { InMemoryProfileRegistry } from '../../../src/infrastructure/persistence/InMemoryProfileRegistry.js';
import { CreateTabActionHandler } from '../../../src/application/actions/CreateTabActionHandler.js';
import { ScreenshotActionHandler } from '../../../src/application/actions/ScreenshotActionHandler.js';
import { ActionEnvelope } from '../../../src/domain/entities/ActionEnvelope.js';

test('CreateTabActionHandler delegates to transport and maps tabId to profile', async () => {
  const transport = new MockTransport();
  transport.setResponse('create_tab', { tabId: 555, url: 'https://test.com' });

  const profileRegistry = new InMemoryProfileRegistry();
  const handler = new CreateTabActionHandler(profileRegistry, transport);

  assert.equal(handler.canHandle('create_tab'), true);
  assert.equal(handler.canHandle('click'), false);

  const envelope = new ActionEnvelope({ action: 'create_tab', params: { url: 'https://test.com' } });
  const result = await handler.handle(envelope, { targetClientId: 'prof_123', targetProfileId: 'prof_123' });

  assert.equal(result.tabId, 555);
  assert.equal(profileRegistry.getProfileIdByTab(555), 'prof_123');
});

test('ScreenshotActionHandler saves base64 image and injects savedFilePath', async () => {
  const transport = new MockTransport();
  const fakeBase64 = Buffer.from('png data').toString('base64');
  transport.setResponse('take_screenshot', { tabId: 101, dataUrl: `data:image/png;base64,${fakeBase64}` });

  const fakeStorage = {
    saveScreenshot: (tabId, base64) => ({ filename: 'screenshot.png', filepath: '/fake/path/screenshot.png' })
  };

  const handler = new ScreenshotActionHandler(fakeStorage, transport);
  assert.equal(handler.canHandle('take_screenshot'), true);
  assert.equal(handler.canHandle('click'), false);

  const envelope = new ActionEnvelope({ action: 'take_screenshot', params: { tabId: 101 } });
  const result = await handler.handle(envelope, { targetClientId: 'prof_1' });

  assert.equal(result.savedFilePath, '/fake/path/screenshot.png');
  assert.equal(result.filename, 'screenshot.png');
});
