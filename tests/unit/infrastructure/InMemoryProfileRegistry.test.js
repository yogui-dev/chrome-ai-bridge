import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryProfileRegistry } from '../../../src/infrastructure/persistence/InMemoryProfileRegistry.js';
import { Profile } from '../../../src/domain/entities/Profile.js';

test('InMemoryProfileRegistry registers, resolves by query/id/fuzzy, and routes by tabId', () => {
  const registry = new InMemoryProfileRegistry();

  const p1 = new Profile({ id: 'prof_personal', name: 'Personal (personal@gmail.com)', lastSeen: 1000 });
  const p2 = new Profile({ id: 'prof_work', name: 'Work (work@company.com)', lastSeen: 2000 });

  registry.register(p1);
  registry.register(p2);

  // Exact ID
  assert.equal(registry.findTargetProfile('prof_personal').id, 'prof_personal');
  // Case-insensitive name match
  assert.equal(registry.findTargetProfile('personal').id, 'prof_personal');
  // Fuzzy partial match
  assert.equal(registry.findTargetProfile('company.com').id, 'prof_work');

  // Resolution by mapped Tab ID
  registry.mapTabToProfile(888, 'prof_personal');
  assert.equal(registry.findTargetProfile(null, 888).id, 'prof_personal');

  // Fallback to most recently active profile when no target is specified
  assert.equal(registry.findTargetProfile(null, null).id, 'prof_work');

  // Non-existent profile throws descriptive error
  assert.throws(
    () => registry.findTargetProfile('non_existent'),
    /Perfil "non_existent" no encontrado\. Perfiles activos:/
  );
});
