# Chrome AI Bridge SOLID & TDD Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `chrome-ai-bridge` server and CLI from monolithic scripts into a modular, test-driven Clean Architecture adhering strictly to SOLID, DIP, and OCP, with zero regressions on existing functionality.

**Architecture:** Clean/Hexagonal Architecture implemented in Native Node.js ESM. Decouples Domain Entities and Contracts from Application Use Cases, Infrastructure Adapters (HTTP, WebSockets, File System, Memory), and Presentation (CLI), wired together via an Inversion of Control (IoC) Container.

**Tech Stack:** Node.js 20+ Native ESM, `node:test`, `node:assert/strict`, `ws` (WebSocket), `node:http`, `node:fs`.

**Spec:** [docs/superpowers/specs/2026-11-25-chrome-ai-bridge-solid-refactor-design.md](file:///C:/Proyectos/yoguidev/chrome-ai-bridge/docs/superpowers/specs/2026-11-25-chrome-ai-bridge-solid-refactor-design.md)

## Global Constraints

- Runtime: Native Node.js ESM (`type: "module"` in `package.json`). Zero Babel, zero TypeScript compiler step.
- Package Manager: Strictly `pnpm`.
- Test Framework: Native Node.js test runner (`node:test` and `node:assert/strict`).
- Backward Compatibility: The existing Chrome extension protocol (`extension/background.js`) and HTTP API contract (`/status`, `/action`, `/profiles`, `/logs/:id`, `/network/:id`) must not change.
- All 9 integration tests in `tests/bridge.test.js` must pass without modifications.
- Entry points: `server/server.js` and `server/cli.js` remain as thin delegates so external callers never break.

## Review Focus

1. **Unregistered profile targeted by action:** When an action targets a non-existent profile name or ID, system must reject with `Perfil "<name>" no encontrado` listing available profiles.
2. **WebSocket connection dropped during pending action:** If the extension disconnects while awaiting action response, pending requests must reject cleanly with a connection error instead of leaking memory or hanging.
3. **Disambiguation of Tab ID across profiles:** When multiple profiles are connected, mapping from `tabId` to `profileId` must accurately route actions without cross-profile collisions.
4. **Invalid base64 in `take_screenshot`:** Malformed image data must reject with an informative error and not write corrupt files to disk.
5. **Unknown CLI command or missing required flags:** CLI must print a descriptive error and exit with code 1 instead of crashing with unhandled exceptions.

---

### Task 1: Domain Entities & Value Objects (`Profile`, `Tab`, `ActionEnvelope`)

**Files:**
- Create: `src/domain/entities/Tab.js`
- Create: `src/domain/entities/Profile.js`
- Create: `src/domain/entities/ActionEnvelope.js`
- Test: `tests/unit/domain/entities.test.js`

**Interfaces:**
- Consumes: None (Pure Domain)
- Produces:
  - `Tab`: `new Tab({ tabId, url, title, isManaged, active, groupTitle, sessionName, task, incognito })`
  - `Profile`: `new Profile({ id, name, ws, tabs, connectedAt, lastSeen })`, `updateLastSeen()`, `setTabs(tabs)`, `addTab(tab)`
  - `ActionEnvelope`: `new ActionEnvelope({ action, params, profile, timeout, id })`

- [ ] **Step 1: Write the failing unit tests for domain entities**

Create `tests/unit/domain/entities.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/domain/entities.test.js`  
Expected: FAIL ("Cannot find module .../Tab.js")

- [ ] **Step 3: Implement `Tab.js`, `Profile.js`, and `ActionEnvelope.js`**

Create `src/domain/entities/Tab.js`:
```javascript
export class Tab {
  constructor({
    tabId,
    url = '',
    title = '',
    isManaged = false,
    active = false,
    groupTitle = null,
    sessionName = 'user_active',
    task = null,
    incognito = false,
    profileId = null,
    profileName = null
  }) {
    this.tabId = parseInt(tabId, 10);
    this.url = url;
    this.title = title;
    this.isManaged = Boolean(isManaged);
    this.active = Boolean(active);
    this.groupTitle = groupTitle;
    this.sessionName = sessionName;
    this.task = task;
    this.incognito = Boolean(incognito);
    this.profileId = profileId;
    this.profileName = profileName;
  }
}
```

Create `src/domain/entities/Profile.js`:
```javascript
export class Profile {
  constructor({
    id,
    name = '',
    ws = null,
    tabs = [],
    connectedAt = Date.now(),
    lastSeen = Date.now()
  }) {
    if (!id) throw new Error('Profile id is required');
    this.id = String(id);
    this.name = name || `Cliente #${id}`;
    this.ws = ws;
    this.tabs = tabs;
    this.connectedAt = connectedAt;
    this.lastSeen = lastSeen;
  }

  updateLastSeen(timestamp = Date.now()) {
    this.lastSeen = timestamp;
  }

  setTabs(tabs = []) {
    this.tabs = tabs;
  }

  addTab(tab) {
    this.tabs = this.tabs.filter(t => t.tabId !== tab.tabId);
    this.tabs.push(tab);
  }

  removeTab(tabId) {
    this.tabs = this.tabs.filter(t => t.tabId !== tabId);
  }
}
```

Create `src/domain/entities/ActionEnvelope.js`:
```javascript
let reqCounter = 0;

export class ActionEnvelope {
  constructor({
    action,
    params = {},
    profile = null,
    timeout = 15000,
    id = null
  }) {
    if (!action) throw new Error('Action is required');
    this.action = action;
    this.params = params;
    this.profile = profile;
    this.timeout = timeout;
    this.id = id || `req_${Date.now()}_${++reqCounter}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/domain/entities.test.js`  
Expected: PASS (3 tests pass)

- [ ] **Step 5: Commit**

```bash
git add src/domain/entities/ tests/unit/domain/entities.test.js
git commit -m "feat(domain): add Tab, Profile, and ActionEnvelope entities with unit tests"
```

---

### Task 2: Domain Contracts & Interfaces (`ITransport`, `IProfileRegistry`, `ILogRepository`, `IActionHandler`)

**Files:**
- Create: `src/domain/contracts/ITransport.js`
- Create: `src/domain/contracts/IProfileRegistry.js`
- Create: `src/domain/contracts/ILogRepository.js`
- Create: `src/domain/contracts/IActionHandler.js`
- Test: `tests/unit/domain/contracts.test.js`

**Interfaces:**
- Consumes: None
- Produces: Contract base classes throwing "Not implemented" for unimplemented methods.

- [ ] **Step 1: Write the failing unit tests for domain contracts**

Create `tests/unit/domain/contracts.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITransport } from '../../../src/domain/contracts/ITransport.js';
import { IProfileRegistry } from '../../../src/domain/contracts/IProfileRegistry.js';
import { ILogRepository } from '../../../src/domain/contracts/ILogRepository.js';
import { IActionHandler } from '../../../src/domain/contracts/IActionHandler.js';

test('Contracts enforce method implementation in derived classes', () => {
  const transport = new ITransport();
  assert.throws(() => transport.send('id', {}), /Not implemented/);

  const registry = new IProfileRegistry();
  assert.throws(() => registry.getById('id'), /Not implemented/);

  const logRepo = new ILogRepository();
  assert.throws(() => logRepo.getLogs(101), /Not implemented/);

  const handler = new IActionHandler();
  assert.throws(() => handler.handle({}), /Not implemented/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/domain/contracts.test.js`  
Expected: FAIL ("Cannot find module ...")

- [ ] **Step 3: Implement contract base classes**

Create `src/domain/contracts/ITransport.js`:
```javascript
export class ITransport {
  send(clientId, message, timeoutMs) { throw new Error('Not implemented: send'); }
  broadcast(message) { throw new Error('Not implemented: broadcast'); }
  on(event, handler) { throw new Error('Not implemented: on'); }
  getClient(clientId) { throw new Error('Not implemented: getClient'); }
  hasClients() { throw new Error('Not implemented: hasClients'); }
}
```

Create `src/domain/contracts/IProfileRegistry.js`:
```javascript
export class IProfileRegistry {
  register(profile) { throw new Error('Not implemented: register'); }
  unregister(profileId) { throw new Error('Not implemented: unregister'); }
  getById(profileId) { throw new Error('Not implemented: getById'); }
  findTargetProfile(targetQuery, tabId) { throw new Error('Not implemented: findTargetProfile'); }
  listProfiles() { throw new Error('Not implemented: listProfiles'); }
  mapTabToProfile(tabId, profileId) { throw new Error('Not implemented: mapTabToProfile'); }
  getProfileIdByTab(tabId) { throw new Error('Not implemented: getProfileIdByTab'); }
}
```

Create `src/domain/contracts/ILogRepository.js`:
```javascript
export class ILogRepository {
  addLog(tabId, logEntry) { throw new Error('Not implemented: addLog'); }
  getLogs(tabId) { throw new Error('Not implemented: getLogs'); }
  addNetworkError(tabId, errorEntry) { throw new Error('Not implemented: addNetworkError'); }
  getNetworkErrors(tabId) { throw new Error('Not implemented: getNetworkErrors'); }
  clearTab(tabId) { throw new Error('Not implemented: clearTab'); }
}
```

Create `src/domain/contracts/IActionHandler.js`:
```javascript
export class IActionHandler {
  canHandle(actionName) { throw new Error('Not implemented: canHandle'); }
  handle(envelope, context) { throw new Error('Not implemented: handle'); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/domain/contracts.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/contracts/ tests/unit/domain/contracts.test.js
git commit -m "feat(domain): add ITransport, IProfileRegistry, ILogRepository, and IActionHandler contracts"
```

---

### Task 3: In-Memory Profile Registry (`InMemoryProfileRegistry`)

**Files:**
- Create: `src/infrastructure/persistence/InMemoryProfileRegistry.js`
- Test: `tests/unit/infrastructure/InMemoryProfileRegistry.test.js`

**Interfaces:**
- Consumes: `IProfileRegistry`, `Profile`
- Produces: `InMemoryProfileRegistry` implementing all profile resolution and tab mapping methods.

- [ ] **Step 1: Write failing unit test for `InMemoryProfileRegistry`**

Create `tests/unit/infrastructure/InMemoryProfileRegistry.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/infrastructure/InMemoryProfileRegistry.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `InMemoryProfileRegistry`**

Create `src/infrastructure/persistence/InMemoryProfileRegistry.js`:
```javascript
import { IProfileRegistry } from '../../domain/contracts/IProfileRegistry.js';

export class InMemoryProfileRegistry extends IProfileRegistry {
  constructor() {
    super();
    this.profiles = new Map(); // id -> Profile
    this.tabToProfile = new Map(); // tabId (number) -> profileId (string)
  }

  register(profile) {
    this.profiles.set(profile.id, profile);
    if (profile.tabs && Array.isArray(profile.tabs)) {
      profile.tabs.forEach(tab => {
        if (tab && tab.tabId) {
          this.mapTabToProfile(tab.tabId, profile.id);
        }
      });
    }
  }

  unregister(profileId) {
    this.profiles.delete(profileId);
    for (const [tabId, pId] of this.tabToProfile.entries()) {
      if (pId === profileId) {
        this.tabToProfile.delete(tabId);
      }
    }
  }

  getById(profileId) {
    return this.profiles.get(profileId) || null;
  }

  listProfiles() {
    return Array.from(this.profiles.values());
  }

  mapTabToProfile(tabId, profileId) {
    this.tabToProfile.set(parseInt(tabId, 10), String(profileId));
  }

  getProfileIdByTab(tabId) {
    return this.tabToProfile.get(parseInt(tabId, 10)) || null;
  }

  findTargetProfile(targetQuery = null, tabId = null) {
    // 1. Si se especificó un perfil objetivo
    if (targetQuery) {
      const query = String(targetQuery).trim().toLowerCase();
      if (this.profiles.has(targetQuery)) {
        return this.profiles.get(targetQuery);
      }
      for (const prof of this.profiles.values()) {
        if (prof.id.toLowerCase() === query || prof.name.toLowerCase() === query) {
          return prof;
        }
      }
      for (const prof of this.profiles.values()) {
        if (prof.id.toLowerCase().includes(query) || prof.name.toLowerCase().includes(query)) {
          return prof;
        }
      }
      const available = Array.from(this.profiles.values()).map(p => `"${p.name}" (ID: ${p.id})`).join(', ');
      throw new Error(`Perfil "${targetQuery}" no encontrado. Perfiles activos: ${available || 'ninguno'}`);
    }

    // 2. Si se especificó un tabId
    if (tabId !== null && tabId !== undefined) {
      const numTabId = parseInt(tabId, 10);
      if (this.tabToProfile.has(numTabId)) {
        const profId = this.tabToProfile.get(numTabId);
        if (this.profiles.has(profId)) {
          return this.profiles.get(profId);
        }
      }
    }

    // 3. Si solo hay un perfil conectado
    if (this.profiles.size === 1) {
      return Array.from(this.profiles.values())[0];
    }

    // 4. Si hay múltiples perfiles, retornar el más recientemente activo
    if (this.profiles.size > 1) {
      const sorted = Array.from(this.profiles.values()).sort(
        (a, b) => (b.lastSeen - a.lastSeen) || (b.connectedAt - a.connectedAt)
      );
      return sorted[0];
    }

    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/infrastructure/InMemoryProfileRegistry.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/persistence/InMemoryProfileRegistry.js tests/unit/infrastructure/InMemoryProfileRegistry.test.js
git commit -m "feat(infra): implement InMemoryProfileRegistry with full resolution logic"
```

---

### Task 4: In-Memory Log & Network Error Repository (`InMemoryLogRepository`)

**Files:**
- Create: `src/infrastructure/persistence/InMemoryLogRepository.js`
- Test: `tests/unit/infrastructure/InMemoryLogRepository.test.js`

**Interfaces:**
- Consumes: `ILogRepository`
- Produces: `InMemoryLogRepository` managing logs and network error events per tab.

- [ ] **Step 1: Write failing unit test for `InMemoryLogRepository`**

Create `tests/unit/infrastructure/InMemoryLogRepository.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/infrastructure/InMemoryLogRepository.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `InMemoryLogRepository`**

Create `src/infrastructure/persistence/InMemoryLogRepository.js`:
```javascript
import { ILogRepository } from '../../domain/contracts/ILogRepository.js';

export class InMemoryLogRepository extends ILogRepository {
  constructor(maxEntriesPerTab = 500) {
    super();
    this.maxEntries = maxEntriesPerTab;
    this.tabLogs = new Map(); // tabId -> Array<logEntry>
    this.tabNetworkErrors = new Map(); // tabId -> Array<errorEntry>
  }

  addLog(tabId, logEntry) {
    const numId = parseInt(tabId, 10);
    if (!this.tabLogs.has(numId)) {
      this.tabLogs.set(numId, []);
    }
    const list = this.tabLogs.get(numId);
    list.push(logEntry);
    if (list.length > this.maxEntries) list.shift();
  }

  getLogs(tabId) {
    return this.tabLogs.get(parseInt(tabId, 10)) || [];
  }

  addNetworkError(tabId, errorEntry) {
    const numId = parseInt(tabId, 10);
    if (!this.tabNetworkErrors.has(numId)) {
      this.tabNetworkErrors.set(numId, []);
    }
    const list = this.tabNetworkErrors.get(numId);
    list.push(errorEntry);
    if (list.length > this.maxEntries) list.shift();
  }

  getNetworkErrors(tabId) {
    return this.tabNetworkErrors.get(parseInt(tabId, 10)) || [];
  }

  clearTab(tabId) {
    const numId = parseInt(tabId, 10);
    this.tabLogs.delete(numId);
    this.tabNetworkErrors.delete(numId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/infrastructure/InMemoryLogRepository.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/persistence/InMemoryLogRepository.js tests/unit/infrastructure/InMemoryLogRepository.test.js
git commit -m "feat(infra): implement InMemoryLogRepository"
```

---

### Task 5: Mock Transport & OCP Action Registry (`ActionRegistry`, `GenericActionHandler`)

**Files:**
- Create: `src/infrastructure/transport/MockTransport.js`
- Create: `src/application/actions/ActionRegistry.js`
- Create: `src/application/actions/GenericActionHandler.js`
- Test: `tests/unit/application/ActionRegistry.test.js`

**Interfaces:**
- Consumes: `ITransport`, `IActionHandler`, `ActionEnvelope`
- Produces:
  - `MockTransport`: In-memory transport for unit testing without WebSocket overhead.
  - `ActionRegistry`: OCP registry for action handlers.
  - `GenericActionHandler`: Default handler forwarding action envelope directly to transport.

- [ ] **Step 1: Write failing unit test for `ActionRegistry` and `MockTransport`**

Create `tests/unit/application/ActionRegistry.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/application/ActionRegistry.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `MockTransport`, `ActionRegistry`, and `GenericActionHandler`**

Create `src/infrastructure/transport/MockTransport.js`:
```javascript
import { ITransport } from '../../domain/contracts/ITransport.js';

export class MockTransport extends ITransport {
  constructor() {
    super();
    this.responses = new Map(); // action -> result
    this.sentMessages = [];
    this.listeners = new Map();
  }

  setResponse(action, result) {
    this.responses.set(action, result);
  }

  async send(clientId, message, timeoutMs = 15000) {
    this.sentMessages.push({ clientId, message, timeoutMs });
    if (this.responses.has(message.action)) {
      const res = this.responses.get(message.action);
      if (res instanceof Error) throw res;
      return res;
    }
    return { ok: true, echo: message };
  }

  broadcast(message) {
    this.sentMessages.push({ broadcast: true, message });
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  emit(event, ...args) {
    const list = this.listeners.get(event) || [];
    list.forEach(fn => fn(...args));
  }

  hasClients() {
    return true;
  }
}
```

Create `src/application/actions/ActionRegistry.js`:
```javascript
export class ActionRegistry {
  constructor() {
    this.handlers = [];
    this.defaultHandler = null;
  }

  register(handler) {
    this.handlers.unshift(handler); // Prioritize later registrations
  }

  setDefaultHandler(handler) {
    this.defaultHandler = handler;
  }

  getHandler(actionName) {
    for (const handler of this.handlers) {
      if (handler.canHandle(actionName)) {
        return handler;
      }
    }
    return this.defaultHandler;
  }
}
```

Create `src/application/actions/GenericActionHandler.js`:
```javascript
import { IActionHandler } from '../../domain/contracts/IActionHandler.js';

export class GenericActionHandler extends IActionHandler {
  constructor(transport) {
    super();
    this.transport = transport;
  }

  canHandle(_actionName) {
    return true; // Fallback handler handles anything
  }

  async handle(envelope, context = {}) {
    const { targetClientId } = context;
    if (!targetClientId) {
      throw new Error('No target client available for action dispatch');
    }
    const message = {
      id: envelope.id,
      action: envelope.action,
      params: envelope.params
    };
    return await this.transport.send(targetClientId, message, envelope.timeout);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/application/ActionRegistry.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/transport/MockTransport.js src/application/actions/ActionRegistry.js src/application/actions/GenericActionHandler.js tests/unit/application/ActionRegistry.test.js
git commit -m "feat(application): implement MockTransport, ActionRegistry, and GenericActionHandler"
```

---

### Task 6: Specialized Action Handlers (`CreateTabActionHandler` & `ScreenshotActionHandler`) & File Storage

**Files:**
- Create: `src/infrastructure/filesystem/LocalFileStorage.js`
- Create: `src/application/actions/CreateTabActionHandler.js`
- Create: `src/application/actions/ScreenshotActionHandler.js`
- Test: `tests/unit/application/SpecializedActions.test.js`

**Interfaces:**
- Consumes: `IActionHandler`, `ITransport`, `IProfileRegistry`, `LocalFileStorage`
- Produces:
  - `CreateTabActionHandler`: Intercepts `create_tab` and maps created `tabId` to `profileId`.
  - `ScreenshotActionHandler`: Intercepts `take_screenshot`, extracts base64, saves file to disk, and injects `savedFilePath`.

- [ ] **Step 1: Write failing unit test for specialized actions**

Create `tests/unit/application/SpecializedActions.test.js`:
```javascript
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

  const envelope = new ActionEnvelope({ action: 'take_screenshot', params: { tabId: 101 } });
  const result = await handler.handle(envelope, { targetClientId: 'prof_1' });

  assert.equal(result.savedFilePath, '/fake/path/screenshot.png');
  assert.equal(result.filename, 'screenshot.png');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/application/SpecializedActions.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `LocalFileStorage.js`, `CreateTabActionHandler.js`, and `ScreenshotActionHandler.js`**

Create `src/infrastructure/filesystem/LocalFileStorage.js`:
```javascript
import fs from 'node:fs';
import path from 'node:path';

export class LocalFileStorage {
  constructor(screenshotsDir) {
    this.screenshotsDir = screenshotsDir;
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
  }

  saveScreenshot(tabId, base64Data) {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const filename = `screenshot-tab${tabId}-${Date.now()}.png`;
    const filepath = path.join(this.screenshotsDir, filename);
    fs.writeFileSync(filepath, Buffer.from(cleanBase64, 'base64'));
    return { filename, filepath };
  }
}
```

Create `src/application/actions/CreateTabActionHandler.js`:
```javascript
import { IActionHandler } from '../../domain/contracts/IActionHandler.js';

export class CreateTabActionHandler extends IActionHandler {
  constructor(profileRegistry, transport) {
    super();
    this.profileRegistry = profileRegistry;
    this.transport = transport;
  }

  canHandle(actionName) {
    return actionName === 'create_tab';
  }

  async handle(envelope, context = {}) {
    const { targetClientId, targetProfileId } = context;
    const message = {
      id: envelope.id,
      action: envelope.action,
      params: envelope.params
    };
    const result = await this.transport.send(targetClientId, message, envelope.timeout);
    if (result && result.tabId && targetProfileId) {
      this.profileRegistry.mapTabToProfile(result.tabId, targetProfileId);
    }
    return result;
  }
}
```

Create `src/application/actions/ScreenshotActionHandler.js`:
```javascript
import { IActionHandler } from '../../domain/contracts/IActionHandler.js';

export class ScreenshotActionHandler extends IActionHandler {
  constructor(fileStorage, transport) {
    super();
    this.fileStorage = fileStorage;
    this.transport = transport;
  }

  canHandle(actionName) {
    return actionName === 'take_screenshot';
  }

  async handle(envelope, context = {}) {
    const { targetClientId } = context;
    const message = {
      id: envelope.id,
      action: envelope.action,
      params: envelope.params
    };
    const result = await this.transport.send(targetClientId, message, envelope.timeout);
    if (result && result.dataUrl) {
      const saved = this.fileStorage.saveScreenshot(result.tabId || envelope.params.tabId || 0, result.dataUrl);
      result.savedFilePath = saved.filepath;
      result.filename = saved.filename;
    }
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/application/SpecializedActions.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/filesystem/LocalFileStorage.js src/application/actions/CreateTabActionHandler.js src/application/actions/ScreenshotActionHandler.js tests/unit/application/SpecializedActions.test.js
git commit -m "feat(application): implement CreateTabActionHandler, ScreenshotActionHandler, and LocalFileStorage"
```

---

### Task 7: Application Use Cases (`ExecuteActionUseCase`, `RegisterProfileUseCase`, `ListProfilesUseCase`)

**Files:**
- Create: `src/application/use-cases/ExecuteActionUseCase.js`
- Create: `src/application/use-cases/RegisterProfileUseCase.js`
- Create: `src/application/use-cases/ListProfilesUseCase.js`
- Test: `tests/unit/application/UseCases.test.js`

**Interfaces:**
- Consumes: `IProfileRegistry`, `ActionRegistry`, `ITransport`
- Produces:
  - `ExecuteActionUseCase.execute(actionEnvelope)`: Resolves target profile, retrieves handler from registry, executes action.
  - `RegisterProfileUseCase.execute(profilePayload, socketClient)`: Registers/updates profile and maps tabs.
  - `ListProfilesUseCase.execute()`: Lists all connected profiles and tabs, optionally refreshing tabs via transport.

- [ ] **Step 1: Write failing unit test for use cases**

Create `tests/unit/application/UseCases.test.js`:
```javascript
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

  // 1. Register Profile
  registerUseCase.execute({
    profileId: 'p_test',
    profileName: 'Tester',
    tabs: [{ tabId: 111, url: 'https://test.com' }]
  }, { id: 'client_sock_1' });

  // 2. List Profiles
  const profiles = await listUseCase.execute();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, 'p_test');

  // 3. Execute Action
  const envelope = new ActionEnvelope({
    action: 'eval_js',
    profile: 'p_test',
    params: { code: '21 * 2' }
  });
  const result = await executeUseCase.execute(envelope);
  assert.equal(result.value, 42);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/application/UseCases.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement use cases**

Create `src/application/use-cases/RegisterProfileUseCase.js`:
```javascript
import { Profile } from '../../domain/entities/Profile.js';

export class RegisterProfileUseCase {
  constructor({ profileRegistry }) {
    this.profileRegistry = profileRegistry;
  }

  execute(payload, socketClient = null) {
    const profileId = payload.profileId || payload.id;
    if (!profileId) throw new Error('profileId is required');

    let profile = this.profileRegistry.getById(profileId);
    if (!profile) {
      profile = new Profile({
        id: profileId,
        name: payload.profileName || payload.name || `Cliente #${profileId}`,
        ws: socketClient,
        tabs: payload.tabs || []
      });
      this.profileRegistry.register(profile);
    } else {
      if (payload.profileName) profile.name = payload.profileName;
      if (socketClient) profile.ws = socketClient;
      if (payload.tabs) profile.setTabs(payload.tabs);
      profile.updateLastSeen();
      this.profileRegistry.register(profile);
    }
    return profile;
  }
}
```

Create `src/application/use-cases/ListProfilesUseCase.js`:
```javascript
export class ListProfilesUseCase {
  constructor({ profileRegistry, transport }) {
    this.profileRegistry = profileRegistry;
    this.transport = transport;
  }

  async execute(refreshTabs = false) {
    const profiles = this.profileRegistry.listProfiles();
    if (refreshTabs && this.transport) {
      for (const prof of profiles) {
        if (prof.ws) {
          try {
            const tabs = await this.transport.send(prof.ws, { action: 'list_tabs', params: {} }, 2000);
            if (Array.isArray(tabs)) {
              prof.setTabs(tabs);
              tabs.forEach(t => this.profileRegistry.mapTabToProfile(t.tabId, prof.id));
            }
          } catch (_) {}
        }
      }
    }
    return profiles;
  }
}
```

Create `src/application/use-cases/ExecuteActionUseCase.js`:
```javascript
export class ExecuteActionUseCase {
  constructor({ profileRegistry, actionRegistry }) {
    this.profileRegistry = profileRegistry;
    this.actionRegistry = actionRegistry;
  }

  async execute(envelope) {
    const targetProfile = this.profileRegistry.findTargetProfile(
      envelope.profile,
      envelope.params?.tabId
    );

    if (!targetProfile && envelope.profile) {
      throw new Error(`Perfil "${envelope.profile}" no encontrado.`);
    }

    const targetClientId = targetProfile ? (targetProfile.ws || targetProfile.id) : null;
    const targetProfileId = targetProfile ? targetProfile.id : null;

    const handler = this.actionRegistry.getHandler(envelope.action);
    if (!handler) {
      throw new Error(`No handler registered for action "${envelope.action}"`);
    }

    return await handler.handle(envelope, {
      targetProfile,
      targetClientId,
      targetProfileId
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/application/UseCases.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/use-cases/ tests/unit/application/UseCases.test.js
git commit -m "feat(application): implement RegisterProfile, ListProfiles, and ExecuteAction use cases"
```

---

### Task 8: WebSocket Extension Transport & IoC Container

**Files:**
- Create: `src/infrastructure/transport/WsExtensionTransport.js`
- Create: `src/infrastructure/container/Container.js`
- Test: `tests/unit/infrastructure/Container.test.js`

**Interfaces:**
- Consumes: `ITransport`, `WebSocketServer`, `InMemoryProfileRegistry`, `InMemoryLogRepository`, `ActionRegistry`
- Produces: `Container` wired with all dependencies for runtime server execution.

- [ ] **Step 1: Write failing unit test for `Container`**

Create `tests/unit/infrastructure/Container.test.js`:
```javascript
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
  assert.equal(container.transport, mockTransport);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/infrastructure/Container.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `WsExtensionTransport.js` and `Container.js`**

Create `src/infrastructure/transport/WsExtensionTransport.js`:
```javascript
import { WebSocketServer, WebSocket } from 'ws';
import { ITransport } from '../../domain/contracts/ITransport.js';

export class WsExtensionTransport extends ITransport {
  constructor(options = {}) {
    super();
    this.wss = options.wss || new WebSocketServer({ noServer: true });
    this.pendingRequests = new Map(); // reqId -> { resolve, reject, timer }
    this.listeners = new Map();
    this.clientCounter = 0;
  }

  attachToHttpServer(server) {
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (wsClient) => {
          this.wss.emit('connection', wsClient, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      const tempId = `conn_${++this.clientCounter}`;
      ws.tempId = tempId;

      this.emit('connection', ws, tempId);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.emit('message', ws, msg);

          // Si es respuesta a un request pendiente
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject, timer } = this.pendingRequests.get(msg.id);
            clearTimeout(timer);
            this.pendingRequests.delete(msg.id);
            if (msg.success) {
              resolve(msg.result);
            } else {
              reject(new Error(msg.error || 'Error desconocido reportado por la extensión de Chrome'));
            }
          }
        } catch (err) {
          console.error('[WsExtensionTransport] Error procesando mensaje:', err);
        }
      });

      ws.on('close', () => {
        // Rechazar cualquier petición pendiente asignada a este socket
        for (const [id, req] of this.pendingRequests.entries()) {
          if (req.targetSocket === ws) {
            clearTimeout(req.timer);
            req.reject(new Error('Conexión con la extensión cerrada mientras se esperaba respuesta'));
            this.pendingRequests.delete(id);
          }
        }
        this.emit('close', ws);
      });
    });
  }

  send(target, message, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let socket = target;
      if (target && typeof target === 'object' && target.readyState !== undefined) {
        socket = target;
      } else if (target && typeof target.ws === 'object') {
        socket = target.ws;
      }

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return reject(new Error('No hay conexión activa con la extensión de Chrome para el perfil seleccionado'));
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(message.id)) {
          this.pendingRequests.delete(message.id);
          reject(new Error(`Timeout (${timeoutMs}ms) esperando respuesta de acción: "${message.action}"`));
        }
      }, timeoutMs);

      this.pendingRequests.set(message.id, { resolve, reject, timer, targetSocket: socket });

      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(message.id);
        reject(err);
      }
    });
  }

  broadcast(message) {
    const raw = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  emit(event, ...args) {
    const list = this.listeners.get(event) || [];
    list.forEach(fn => fn(...args));
  }

  hasClients() {
    return this.wss.clients.size > 0;
  }
}
```

Create `src/infrastructure/container/Container.js`:
```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryProfileRegistry } from '../persistence/InMemoryProfileRegistry.js';
import { InMemoryLogRepository } from '../persistence/InMemoryLogRepository.js';
import { LocalFileStorage } from '../filesystem/LocalFileStorage.js';
import { WsExtensionTransport } from '../transport/WsExtensionTransport.js';
import { ActionRegistry } from '../../application/actions/ActionRegistry.js';
import { GenericActionHandler } from '../../application/actions/GenericActionHandler.js';
import { CreateTabActionHandler } from '../../application/actions/CreateTabActionHandler.js';
import { ScreenshotActionHandler } from '../../application/actions/ScreenshotActionHandler.js';
import { ExecuteActionUseCase } from '../../application/use-cases/ExecuteActionUseCase.js';
import { RegisterProfileUseCase } from '../../application/use-cases/RegisterProfileUseCase.js';
import { ListProfilesUseCase } from '../../application/use-cases/ListProfilesUseCase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SCREENSHOTS_DIR = path.resolve(__dirname, '../../../screenshots');

export class Container {
  constructor(options = {}) {
    this.screenshotsDir = options.screenshotsDir || DEFAULT_SCREENSHOTS_DIR;
    this.profileRegistry = options.profileRegistry || new InMemoryProfileRegistry();
    this.logRepository = options.logRepository || new InMemoryLogRepository();
    this.fileStorage = options.fileStorage || new LocalFileStorage(this.screenshotsDir);
    this.transport = options.transport || new WsExtensionTransport();

    // Action Registry & Handlers (OCP)
    this.actionRegistry = options.actionRegistry || new ActionRegistry();
    this.actionRegistry.register(new CreateTabActionHandler(this.profileRegistry, this.transport));
    this.actionRegistry.register(new ScreenshotActionHandler(this.fileStorage, this.transport));
    this.actionRegistry.setDefaultHandler(new GenericActionHandler(this.transport));

    // Use cases
    this.executeActionUseCase = new ExecuteActionUseCase({
      profileRegistry: this.profileRegistry,
      actionRegistry: this.actionRegistry
    });
    this.registerProfileUseCase = new RegisterProfileUseCase({
      profileRegistry: this.profileRegistry
    });
    this.listProfilesUseCase = new ListProfilesUseCase({
      profileRegistry: this.profileRegistry,
      transport: this.transport
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/infrastructure/Container.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/transport/WsExtensionTransport.js src/infrastructure/container/Container.js tests/unit/infrastructure/Container.test.js
git commit -m "feat(infra): implement WsExtensionTransport and IoC Container"
```

---

### Task 9: HTTP Server Adapter & Wiring into `server/server.js`

**Files:**
- Create: `src/infrastructure/http/HttpServer.js`
- Modify: `server/server.js`
- Modify: `package.json` (update `"test"` script to run unit + integration tests)
- Test: `tests/bridge.test.js` (integration tests)

**Interfaces:**
- Consumes: `Container`, `node:http`
- Produces: `HttpServer` serving `/status`, `/profiles`, `/action`, `/logs/:id`, `/network/:id` and upgrade to `/ws`.

- [ ] **Step 1: Implement `src/infrastructure/http/HttpServer.js`**

Create `src/infrastructure/http/HttpServer.js`:
```javascript
import http from 'node:http';
import { ActionEnvelope } from '../../domain/entities/ActionEnvelope.js';

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error(`JSON malformado en body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export class HttpServer {
  constructor(container, port = 9224) {
    this.container = container;
    this.port = port;
    this.server = http.createServer(this.handleRequest.bind(this));
    this.container.transport.attachToHttpServer(this.server);
    this.wireTransportEvents();
  }

  wireTransportEvents() {
    this.container.transport.on('connection', (ws, tempId) => {
      // Registrar temporalmente el cliente inicial
      this.container.registerProfileUseCase.execute({
        profileId: tempId,
        profileName: `Cliente #${this.container.transport.clientCounter}`,
        tabs: []
      }, ws);
    });

    this.container.transport.on('message', (ws, msg) => {
      if (msg.type === 'register_profile') {
        this.container.registerProfileUseCase.execute(msg, ws);
      } else if (msg.type === 'tab_logs') {
        const profileId = msg.profileId || this.container.profileRegistry.getProfileIdByTab(msg.tabId);
        const profile = profileId ? this.container.profileRegistry.getById(profileId) : null;
        if (Array.isArray(msg.logs)) {
          msg.logs.forEach(log => {
            this.container.logRepository.addLog(msg.tabId, {
              ...log,
              profileId,
              profileName: profile?.name || null
            });
          });
        }
      } else if (msg.type === 'tab_network_error') {
        const profileId = msg.profileId || this.container.profileRegistry.getProfileIdByTab(msg.tabId);
        const profile = profileId ? this.container.profileRegistry.getById(profileId) : null;
        if (msg.networkError) {
          this.container.logRepository.addNetworkError(msg.tabId, {
            ...msg.networkError,
            profileId,
            profileName: profile?.name || null
          });
        }
      } else if (msg.type === 'tab_closed') {
        this.container.logRepository.clearTab(msg.tabId);
        for (const prof of this.container.profileRegistry.listProfiles()) {
          prof.removeTab(msg.tabId);
        }
      }
    });

    this.container.transport.on('close', (ws) => {
      for (const prof of this.container.profileRegistry.listProfiles()) {
        if (prof.ws === ws) {
          prof.ws = null;
        }
      }
    });
  }

  async handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // Endpoint: Health / Status
    if (url.pathname === '/health' || url.pathname === '/status') {
      const isConnected = this.container.transport.hasClients();
      const profiles = await this.container.listProfilesUseCase.execute(true);
      const profilesList = [];
      let allTabs = [];

      for (const prof of profiles) {
        if (prof.ws && prof.ws.readyState === 1) { // WebSocket.OPEN
          const tabs = prof.tabs || [];
          profilesList.push({
            id: prof.id,
            name: prof.name,
            tabsCount: tabs.length,
            tabs: tabs.map(t => ({ ...t, profileId: prof.id, profileName: prof.name }))
          });
          allTabs.push(...tabs.map(t => ({ ...t, profileId: prof.id, profileName: prof.name })));
        }
      }

      // Compatibilidad cuando no hay profiles explícitos pero sí cliente conectado
      if (profilesList.length === 0 && isConnected) {
        try {
          const tabs = await this.container.transport.send(
            this.container.transport.wss.clients.values().next().value,
            { action: 'list_tabs', params: {} },
            2000
          );
          allTabs = tabs || [];
        } catch (_) {}
      }

      sendJson(res, 200, {
        ok: true,
        port: this.port,
        extensionConnected: isConnected,
        profilesCount: profilesList.length,
        profiles: profilesList,
        tabsCount: allTabs.length,
        tabs: allTabs
      });
      return;
    }

    // Endpoint: Profiles
    if (url.pathname === '/profiles') {
      const profiles = this.container.profileRegistry.listProfiles().map(p => ({
        id: p.id,
        name: p.name,
        tabsCount: p.tabs ? p.tabs.length : 0,
        connectedAt: p.connectedAt,
        lastSeen: p.lastSeen
      }));
      sendJson(res, 200, { ok: true, count: profiles.length, profiles });
      return;
    }

    // Endpoint: Action
    if (url.pathname === '/action' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (!body.action) {
          sendJson(res, 400, { error: 'Falta campo "action"' });
          return;
        }

        const envelope = new ActionEnvelope({
          action: body.action,
          params: body.params || {},
          profile: body.profile || null,
          timeout: body.timeout || 15000
        });

        const result = await this.container.executeActionUseCase.execute(envelope);
        sendJson(res, 200, { ok: true, action: body.action, result });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message || String(err) });
      }
      return;
    }

    // Endpoint: Logs
    if (url.pathname.startsWith('/logs/')) {
      const tabId = parseInt(url.pathname.replace('/logs/', ''), 10);
      const logs = this.container.logRepository.getLogs(tabId);
      sendJson(res, 200, { ok: true, tabId, count: logs.length, logs });
      return;
    }

    // Endpoint: Network Errors
    if (url.pathname.startsWith('/network/')) {
      const tabId = parseInt(url.pathname.replace('/network/', ''), 10);
      const errors = this.container.logRepository.getNetworkErrors(tabId);
      sendJson(res, 200, { ok: true, tabId, count: errors.length, networkErrors: errors });
      return;
    }

    sendJson(res, 404, { error: 'Endpoint no encontrado' });
  }

  listen() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        resolve(this.server);
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.server.close(resolve);
    });
  }
}
```

- [ ] **Step 2: Update `server/server.js` as thin entrypoint**

Refactor `server/server.js`:
```javascript
import { Container } from '../src/infrastructure/container/Container.js';
import { HttpServer } from '../src/infrastructure/http/HttpServer.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9224;

const container = new Container();
const app = new HttpServer(container, PORT);

await app.listen();

console.log(`=======================================================`);
console.log(`🤖 Antigravity Chrome Bridge Server (SOLID Architecture)`);
console.log(`📡 HTTP API:       http://localhost:${PORT}`);
console.log(`🔌 WebSocket:      ws://localhost:${PORT}/ws`);
console.log(`📸 Screenshots:    ${container.screenshotsDir}`);
console.log(`=======================================================`);
```

- [ ] **Step 3: Update `package.json` scripts**

Update lines in `package.json`:
```json
"test": "node --test tests/unit/**/*.test.js tests/*.test.js"
```

- [ ] **Step 4: Run unit and integration tests to verify everything passes**

Run: `node --test tests/unit/**/*.test.js`  
Expected: PASS (all unit tests green)

Run: `node --test tests/bridge.test.js`  
Expected: PASS (all 9 integration tests green)

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/http/HttpServer.js server/server.js package.json
git commit -m "feat(server): migrate server to modular SOLID HttpServer architecture and pass integration tests"
```

---

### Task 10: CLI Flag Parser, Command Registry & Commands (OCP CLI)

**Files:**
- Create: `src/presentation/cli/FlagParser.js`
- Create: `src/presentation/cli/Formatters.js`
- Create: `src/presentation/cli/CommandRegistry.js`
- Create: `src/presentation/cli/commands/BaseCommand.js`
- Create: `src/presentation/cli/commands/StatusCommand.js`
- Create: `src/presentation/cli/commands/ProfilesCommand.js`
- Create: `src/presentation/cli/commands/TabsCommand.js`
- Create: `src/presentation/cli/commands/AttachCommand.js`
- Create: `src/presentation/cli/commands/OpenCommand.js`
- Create: `src/presentation/cli/commands/TaskCommand.js`
- Create: `src/presentation/cli/commands/ClickCommand.js`
- Create: `src/presentation/cli/commands/WaitCommand.js`
- Create: `src/presentation/cli/commands/TypeCommand.js`
- Create: `src/presentation/cli/commands/UploadCommand.js`
- Create: `src/presentation/cli/commands/ScrollCommand.js`
- Create: `src/presentation/cli/commands/LogsCommand.js`
- Create: `src/presentation/cli/commands/NetworkCommand.js`
- Create: `src/presentation/cli/commands/EvalCommand.js`
- Create: `src/presentation/cli/commands/ScreenshotCommand.js`
- Create: `src/presentation/cli/CliApp.js`
- Modify: `server/cli.js` (thin delegator to `CliApp`)
- Test: `tests/unit/presentation/Cli.test.js`

**Interfaces:**
- Consumes: None (Pure Presentation calling HTTP API via fetch)
- Produces: `CliApp.run(argv)` supporting all CLI commands with identical flags and outputs.

- [ ] **Step 1: Write failing unit test for `FlagParser` and `CommandRegistry`**

Create `tests/unit/presentation/Cli.test.js`:
```javascript
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

test('CommandRegistry registers and resolves commands and aliases', () => {
  const registry = new CommandRegistry();
  const dummyCmd = { name: 'status', aliases: ['health'], execute: () => 'ok' };
  registry.register(dummyCmd);

  assert.equal(registry.resolve('status'), dummyCmd);
  assert.equal(registry.resolve('health'), dummyCmd);
  assert.equal(registry.resolve('unknown'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/presentation/Cli.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `FlagParser.js`, `CommandRegistry.js`, `Formatters.js`, commands, and `CliApp.js`**

Create `src/presentation/cli/FlagParser.js`:
```javascript
export class FlagParser {
  static parse(rawArgs = []) {
    const command = rawArgs[0] || null;
    const flags = {};
    const extraArgs = [];

    for (let i = 1; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const next = rawArgs[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      } else {
        extraArgs.push(arg);
      }
    }

    return { command, flags, extraArgs };
  }
}
```

Create `src/presentation/cli/CommandRegistry.js`:
```javascript
export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
  }

  register(commandInstance) {
    this.commands.set(commandInstance.name, commandInstance);
    if (commandInstance.aliases && Array.isArray(commandInstance.aliases)) {
      commandInstance.aliases.forEach(alias => {
        this.aliases.set(alias, commandInstance);
      });
    }
  }

  resolve(commandName) {
    if (!commandName) return null;
    return this.commands.get(commandName) || this.aliases.get(commandName) || null;
  }
}
```

Create `src/presentation/cli/commands/BaseCommand.js`:
```javascript
export class BaseCommand {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async runAction(action, params = {}, profile = null, flags = {}) {
    const targetProfile = profile || flags.profile || null;
    const res = await this.api.call('/action', 'POST', { action, params, profile: targetProfile });
    if (!res.ok) {
      console.error(`❌ Error ejecutando "${action}":`, res.error);
      process.exit(1);
    }
    return res.result;
  }
}
```

Create `src/presentation/cli/CliApp.js` and modularize the commands to match `cli.js` exactly.
Update `server/cli.js` to delegate to `CliApp.run(process.argv.slice(2))`.

- [ ] **Step 4: Run unit tests and CLI integration tests**

Run: `node --test tests/unit/presentation/Cli.test.js`  
Expected: PASS

Run: `pnpm test`  
Expected: PASS (all unit tests + all 9 integration tests pass!)

- [ ] **Step 5: Commit**

```bash
git add src/presentation/cli/ server/cli.js tests/unit/presentation/Cli.test.js
git commit -m "feat(cli): refactor CLI into OCP CommandRegistry and FlagParser architecture"
```

---

### Task 11: Final Verification, Cerebro Digital & Sync

**Files:**
- Modify: `C:\Proyectos\yoguidev\cerebro-digital\diario\2026\11-noviembre\2026-11-25.md`
- Test: Full test suite (`pnpm test`)

- [ ] **Step 1: Execute full test suite**

Run: `cd C:\Proyectos\yoguidev\chrome-ai-bridge; pnpm test`  
Expected: PASS (100% tests passing)

- [ ] **Step 2: Commit all changes in `chrome-ai-bridge` and push to GitHub**

```bash
cd C:\Proyectos\yoguidev\chrome-ai-bridge
git push origin main
```

- [ ] **Step 3: Register in Cerebro Digital and Sync to Neon DB**

Update `cerebro-digital/diario/2026/11-noviembre/2026-11-25.md` documenting the complete SOLID + TDD refactor.
Execute commit & push in `cerebro-digital`.
Execute `VaultSyncService().sync_vault()` to persist in Neon database.
