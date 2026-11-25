# Chrome AI Bridge — Refactorización Arquitectónica SOLID & TDD

**Fecha:** 2026-11-25  
**Autor:** Antigravity AI & yogui-dev  
**Estado:** Propuesta de Diseño (Spec)  
**Alcance:** Servidor y CLI de `chrome-ai-bridge`  

---

## 1. Resumen Ejecutivo y Motivación

Actualmente, `chrome-ai-bridge` opera de forma funcional y exitosa, pero su lógica reside en dos archivos monolíticos:
- `server/server.js` (427 líneas): agrupa simultáneamente el servidor HTTP, el servidor WebSocket, el almacenamiento en memoria de perfiles (`connectedProfiles`), la resolución y enrutamiento de sockets (`findTargetSocket`), la lógica de timeout/request id, la persistencia de logs/errores de red, y la lógica específica de acciones (como guardar screenshots a disco).
- `server/cli.js` (541 líneas): contiene un switch monolítico de 18 ramas acoplado directamente a `fetch`, manipulación directa de `process.argv`, formateo de consola e intercepción de errores.

### Objetivos de la Refactorización
1. **Aplicar Principios SOLID:**
   - **SRP (Single Responsibility Principle):** Cada módulo, clase o función tiene una única razón para cambiar.
   - **OCP (Open/Closed Principle):** Añadir nuevas acciones del navegador o nuevos comandos del CLI sin modificar los despachadores principales, mediante un `ActionHandlerRegistry` y un `CommandRegistry`.
   - **LSP (Liskov Substitution Principle):** Las implementaciones de transporte (`WsExtensionTransport`, `MockTransport`) o repositorios son completamente intercambiables sin alterar el comportamiento de los casos de uso.
   - **ISP (Interface Segregation Principle):** Interfaces/contratos pequeños y específicos (`ITransport`, `IProfileRegistry`, `ILogRepository`, `IActionHandler`).
   - **DIP (Dependency Inversion Principle):** Los casos de uso de alto nivel no dependen de detalles de bajo nivel (WebSocket, HTTP, sistema de archivos). Ambos dependen de abstracciones mediante un contenedor IoC liviano.
2. **Habilitar Test-Driven Development (TDD):**
   - Permitir pruebas unitarias puras y aisladas con mocks en milisegundos (`tests/unit/`), sin necesidad de abrir sockets reales ni levantar servidores HTTP.
3. **Cero Regresiones e Invariantes:**
   - 100% de compatibilidad con la extensión Chrome (`extension/background.js`).
   - 100% de compatibilidad con la suite de 9 pruebas de integración existentes (`tests/bridge.test.js`).
   - Sin herramientas complejas de compilación: **JavaScript ESM Nativo** con Node.js `node:test` y `node:assert/strict`.

---

## 2. Arquitectura del Sistema (Clean / Hexagonal)

```
chrome-ai-bridge/
├── src/
│   ├── domain/                         # Capa de Dominio (Entidades y Contratos)
│   │   ├── entities/
│   │   │   ├── Profile.js              # Entidad Perfil (id, name, tabs, lastSeen, etc.)
│   │   │   ├── Tab.js                  # Value Object Pestaña
│   │   │   └── ActionEnvelope.js       # Mensaje/Petición de Acción normalizada
│   │   └── contracts/
│   │       ├── IProfileRegistry.js     # Contrato para registro y búsqueda de perfiles
│   │       ├── ITransport.js           # Contrato para comunicación con extensiones
│   │       ├── ILogRepository.js       # Contrato para logs y errores de red
│   │       └── IActionHandler.js       # Contrato base para acciones ejecutables
│   │
│   ├── application/                    # Capa de Aplicación (Casos de Uso)
│   │   ├── use-cases/
│   │   │   ├── ExecuteActionUseCase.js # Orquestador de ejecución de acciones con timeout
│   │   │   ├── RegisterProfileUseCase.js # Registro/actualización de perfiles y sus tabs
│   │   │   ├── ListProfilesUseCase.js  # Consulta de perfiles y pestañas activas
│   │   │   ├── QueryLogsUseCase.js     # Consulta de logs de pestañas
│   │   │   └── QueryNetworkUseCase.js  # Consulta de errores de red de pestañas
│   │   └── actions/                    # Handlers específicos de acciones (OCP)
│   │       ├── ActionRegistry.js       # Registro dinámico de acciones
│   │       ├── ScreenshotActionHandler.js # Maneja acción take_screenshot y guardado
│   │       ├── CreateTabActionHandler.js  # Maneja create_tab y asociación a perfil
│   │       └── GenericActionHandler.js    # Maneja acciones delegadas estándar (click, type, etc.)
│   │
│   ├── infrastructure/                 # Capa de Infraestructura (Adaptadores y Drivers)
│   │   ├── persistence/
│   │   │   ├── InMemoryProfileRegistry.js # Implementa IProfileRegistry
│   │   │   └── InMemoryLogRepository.js   # Implementa ILogRepository
│   │   ├── transport/
│   │   │   ├── WsExtensionTransport.js    # Implementa ITransport usando WebSocket Server
│   │   │   └── MockTransport.js           # Implementa ITransport para tests unitarios
│   │   ├── filesystem/
│   │   │   └── LocalFileStorage.js        # Almacenamiento local de screenshots y archivos
│   │   ├── http/
│   │   │   ├── HttpServer.js              # Servidor HTTP nativo node:http
│   │   │   └── routes/                    # Controladores de rutas (/status, /action, /logs, /profiles)
│   │   └── container/
│   │       └── Container.js               # Contenedor IoC / Composition Root
│   │
│   └── presentation/                   # Capa de Presentación (CLI)
│       └── cli/
│           ├── CliApp.js                  # Despachador principal del CLI
│           ├── CommandRegistry.js         # Registro de comandos del CLI (OCP)
│           ├── FlagParser.js              # Parseo desacoplado de argumentos y flags
│           ├── Formatters.js              # Formateadores de salida para consola
│           └── commands/                  # Comandos individuales
│               ├── StatusCommand.js
│               ├── ProfilesCommand.js
│               ├── TabsCommand.js
│               ├── ClickCommand.js
│               ├── TypeCommand.js
│               ├── WaitCommand.js
│               ├── UploadCommand.js
│               ├── ScreenshotCommand.js
│               └── EvalCommand.js
│
├── server/
│   ├── server.js                       # Entry point delgado (invoca Container e inicia HttpServer)
│   └── cli.js                          # Entry point delgado (invoca CliApp)
├── tests/
│   ├── unit/                           # Tests unitarios TDD (rápidos, aislados, con mocks)
│   │   ├── Profile.test.js
│   │   ├── ExecuteActionUseCase.test.js
│   │   ├── ActionRegistry.test.js
│   │   ├── InMemoryProfileRegistry.test.js
│   │   ├── FlagParser.test.js
│   │   └── Container.test.js
│   └── bridge.test.js                  # Tests de integración E2E existentes (100% compatibles)
└── package.json
```

---

## 3. Detalle de Contratos y Componentes

### 3.1. Dominio y Contratos (`src/domain/`)

#### `ITransport`
Define la interfaz para enviar y recibir mensajes con las extensiones conectadas.
```javascript
export class ITransport {
  send(clientId, message, timeoutMs) { throw new Error('Not implemented'); }
  broadcast(message) { throw new Error('Not implemented'); }
  on(event, handler) { throw new Error('Not implemented'); }
  getClient(clientId) { throw new Error('Not implemented'); }
}
```

#### `IProfileRegistry`
Define el almacenamiento y resolución de perfiles y pestañas.
```javascript
export class IProfileRegistry {
  register(profile) { throw new Error('Not implemented'); }
  unregister(profileId) { throw new Error('Not implemented'); }
  getById(profileId) { throw new Error('Not implemented'); }
  findTargetProfile(targetQuery, tabId) { throw new Error('Not implemented'); }
  listProfiles() { throw new Error('Not implemented'); }
  mapTabToProfile(tabId, profileId) { throw new Error('Not implemented'); }
}
```

#### `IActionHandler`
Contrato para handlers de acciones (OCP).
```javascript
export class IActionHandler {
  canHandle(actionName) { throw new Error('Not implemented'); }
  handle(envelope, context) { throw new Error('Not implemented'); }
}
```

---

### 3.2. Capa de Aplicación (`src/application/`)

#### `ExecuteActionUseCase`
- Resuelve el perfil destino mediante `IProfileRegistry.findTargetProfile(envelope.profile, envelope.params.tabId)`.
- Si no hay perfil específico pero hay un perfil único conectado, lo utiliza; si hay varios, prioriza el más reciente.
- Despacha la acción a través del `ActionRegistry`.
- Maneja el ciclo de vida de la promesa y el timeout configurable.
- Si la acción genera efectos secundarios posteriores (ej. mapear nueva pestaña en `create_tab` o persistir imagen en `take_screenshot`), delega en los handlers correspondientes sin contaminar el orquestador principal.

#### `ActionRegistry` (OCP)
Permite registrar handlers sin modificar el código de ejecución:
```javascript
const registry = new ActionRegistry();
registry.register(new ScreenshotActionHandler(fileStorage));
registry.register(new CreateTabActionHandler(profileRegistry));
registry.setDefaultHandler(new GenericActionHandler(transport));
```

---

### 3.3. Capa de Infraestructura (`src/infrastructure/`)

#### `Container` (Inversión de Control)
El `Container` es el punto de composición (*Composition Root*). Instancia las dependencias y las inyecta en los casos de uso:
```javascript
export class Container {
  constructor(options = {}) {
    this.profileRegistry = new InMemoryProfileRegistry();
    this.logRepository = new InMemoryLogRepository();
    this.fileStorage = options.fileStorage || new LocalFileStorage(options.screenshotsDir);
    this.transport = options.transport || new WsExtensionTransport();
    
    this.actionRegistry = new ActionRegistry();
    this.actionRegistry.register(new ScreenshotActionHandler(this.fileStorage, this.transport));
    this.actionRegistry.register(new CreateTabActionHandler(this.profileRegistry, this.transport));
    this.actionRegistry.setDefaultHandler(new GenericActionHandler(this.transport));

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

#### `HttpServer`
Un adaptador HTTP limpio que mapea las peticiones REST (`GET /status`, `POST /action`, `GET /profiles`, `GET /logs/:id`, `GET /network/:id`) directamente a los casos de uso respectivos, manteniendo los mismos códigos de estado y esquemas JSON.

---

### 3.4. Capa de Presentación: CLI Refactorizado (`src/presentation/cli/`)

- **`FlagParser`:** Parser puro sin dependencias externas que extrae comandos y flags `--key value` o `--flag boolean`.
- **`CommandRegistry`:** Cada comando (`status`, `click`, `open`, `type`, `wait`, `upload`, etc.) es una clase aislada que implementa `execute(args, flags)`.
- **`OutputFormatter`:** Encapsula todos los mensajes de consola con formato consistente, colores e iconos.

---

## 4. Estrategia de Pruebas (TDD First)

### 4.1. Suite de Pruebas Unitarias (`tests/unit/`)
Se implementarán mediante TDD (Red-Green-Refactor):
1. **`FlagParser.test.js`:** Valida parsing de flags booleanas, flags con valores y argumentos posicionales.
2. **`Profile.test.js` & `InMemoryProfileRegistry.test.js`:** Valida registro, búsqueda exacta y fuzzy por nombre/id, mapeo de tabs a perfiles y orden por última actividad.
3. **`ActionRegistry.test.js`:** Valida registro de handlers específicos y fallback al handler genérico.
4. **`ExecuteActionUseCase.test.js`:** Valida ejecución exitosa, errores de timeout, enrutamiento a `MockTransport`, y post-procesamiento de capturas de pantalla sin I/O real.
5. **`Container.test.js`:** Valida el cableado correcto del grafo de dependencias.

### 4.2. Suite de Pruebas de Integración (`tests/bridge.test.js`)
- La suite completa existente de 9 tests se ejecutará para certificar que el comportamiento externo de HTTP, WebSocket, y CLI se mantiene 100% idéntico.

---

## 5. Compatibilidad hacia Atrás (Zero-Breakage)

- **Entry points conservados:**
  - `server/server.js`: Inicializa `Container`, arranca `HttpServer` y escucha en `PORT` (por defecto 9224).
  - `server/cli.js`: Invoca `CliApp.run(process.argv.slice(2))`.
- **Scripts de `package.json`:**
  - `pnpm start` -> `node server/server.js` (sin cambios).
  - `pnpm cli` -> `node server/cli.js` (sin cambios).
  - `pnpm test` -> `node --test tests/*.test.js tests/unit/*.test.js` (ejecuta tanto integración como unitarios).

---

## 6. Plan de Implementación por Fases

1. **Fase 1: Dominio, Entidades y Contratos**
   - Crear `src/domain/entities/` y `src/domain/contracts/`.
2. **Fase 2: Infraestructura en Memoria y Registro de Perfiles (TDD)**
   - Test unitario de `InMemoryProfileRegistry` -> Implementación.
3. **Fase 3: Handlers de Acción y Casos de Uso (TDD)**
   - Test unitario de `ActionRegistry` y `ExecuteActionUseCase` con `MockTransport` -> Implementación.
4. **Fase 4: Adaptadores de Red y Contenedor IoC**
   - Implementar `WsExtensionTransport`, `HttpServer` y `Container`.
   - Conectar `server/server.js` con el nuevo `Container`.
   - Ejecutar `tests/bridge.test.js` para asegurar verde total.
5. **Fase 5: CLI Modular (TDD)**
   - Test unitario de `FlagParser` -> Implementación.
   - Migrar comandos a `src/presentation/cli/commands/`.
   - Conectar `server/cli.js`.
6. **Fase 6: Verificación Final y Documentación**
   - Ejecutar suite completa (unitarios + integración).
   - Registrar en `cerebro-digital` y sincronizar con Neon.
