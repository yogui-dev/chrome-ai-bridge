import test from 'node:test';
import assert from 'node:assert/strict';
import { Tab } from '../../../src/domain/entities/Tab.js';
import { Profile } from '../../../src/domain/entities/Profile.js';
import { ActionEnvelope } from '../../../src/domain/entities/ActionEnvelope.js';

test('Tab entity correctly stores tab metadata and defaults', () => {
  const tab = new Tab({ tabId: 101, url: 'https://example.com', title: 'Example' });
  assert.equal(tab.tabId, 101);
  assert.equal(tab.url, 'https://example.com');
  assert.equal(tab.title, 'Example');
  assert.equal(tab.isManaged, false);
  assert.equal(tab.incognito, false);
});

test('Profile entity manages tabs and updates lastSeen', () => {
  const profile = new Profile({ id: 'prof_1', name: 'Personal' });
  assert.equal(profile.id, 'prof_1');
  assert.equal(profile.name, 'Personal');
  assert.equal(profile.tabs.length, 0);

  const initialLastSeen = profile.lastSeen;
  profile.updateLastSeen(initialLastSeen + 100);
  assert.equal(profile.lastSeen, initialLastSeen + 100);

  profile.setTabs([{ tabId: 101, url: 'https://test.com' }]);
  assert.equal(profile.tabs.length, 1);
  assert.equal(profile.tabs[0].tabId, 101);
});

test('ActionEnvelope normalizes action requests and provides default timeout', () => {
  const env = new ActionEnvelope({ action: 'click', params: { tabId: 101 } });
  assert.equal(env.action, 'click');
  assert.equal(env.params.tabId, 101);
  assert.equal(env.timeout, 15000);
  assert.ok(env.id.startsWith('req_'));
});
