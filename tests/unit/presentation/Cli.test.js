import test from 'node:test';
import assert from 'node:assert/strict';
import { FlagParser } from '../../../src/presentation/cli/FlagParser.js';
import { CommandRegistry } from '../../../src/presentation/cli/CommandRegistry.js';

test('FlagParser parses commands and flags with boolean and string values', () => {
  const parsed = FlagParser.parse(['click', '--tab', '101', '--incognito', '--selector', '#btn']);
  assert.equal(parsed.command, 'click');
  assert.equal(parsed.flags.tab, '101');
  assert.equal(parsed.flags.incognito, true);
  assert.equal(parsed.flags.selector, '#btn');
});

test('FlagParser handles empty argv gracefully', () => {
  const parsed = FlagParser.parse([]);
  assert.equal(parsed.command, null);
  assert.deepEqual(parsed.flags, {});
});

test('CommandRegistry registers and resolves commands and aliases', () => {
  const registry = new CommandRegistry();
  const dummyCmd = { name: 'status', aliases: ['health'], execute: () => 'ok' };
  registry.register(dummyCmd);

  assert.equal(registry.resolve('status'), dummyCmd);
  assert.equal(registry.resolve('health'), dummyCmd);
  assert.equal(registry.resolve('unknown'), null);
});
