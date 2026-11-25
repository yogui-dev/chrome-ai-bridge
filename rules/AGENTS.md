# Chrome AI Bridge — Reglas de Navegación, Arquitectura SOLID y Gobernanza

## 🌐 1. Uso Obligatorio para Navegación Web e Interacción en Vivo
Ante cualquier solicitud de navegar por internet, visitar páginas web, investigar documentación online, probar aplicaciones web, inspeccionar interfaces, completar formularios, interactuar con múltiples usuarios o depurar en vivo:
1. **Conexión Directa:** Usar SIEMPRE la skill `chrome-ai-bridge` conectándose al navegador Chrome principal del usuario mediante el daemon local (`http://localhost:9224` o `node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js ...`).
2. **Agrupación Visual:** Todas las pestañas creadas o inspeccionadas para tareas del agente deben mantenerse organizadas bajo el grupo unificado **`🤖 Antigravity AI`** (o incorporadas con `attach`), manteniendo el navegador del usuario limpio y ordenado.
3. **Pruebas Multi-usuario:** Usar el modo `--incognito` para el segundo usuario cuando se requieran sesiones y cookies totalmente aisladas, o `--profile "<nombre>"` para conmutar entre perfiles activos.
4. **Nombres de Tarea:** Al abrir una pestaña con `open`, incluir siempre `--task "<propósito>"` para que el usuario identifique la actividad en su barra de pestañas.

---

## 🏛️ 2. Mandato Obligatorio de Arquitectura SOLID, DIP y TDD
Cualquier modificación, corrección o nueva funcionalidad en `chrome-ai-bridge` debe adherirse estrictamente a los siguientes principios de ingeniería:
1. **SRP (Single Responsibility Principle):** Cada módulo, entidad o handler tiene una única responsabilidad bien delimitada.
2. **OCP (Open/Closed Principle):**
   - Para añadir una **nueva acción del navegador**: implementar una clase handler que extienda `IActionHandler` y registrarla en `ActionRegistry` (en `src/application/actions/`), sin modificar los despachadores HTTP ni WebSocket.
   - Para añadir un **nuevo comando CLI**: registrar la definición `{ name, aliases, execute }` en `CommandRegistry` (en `src/presentation/cli/`), sin alterar el parser ni el bucle principal.
3. **LSP (Liskov Substitution Principle):** Las implementaciones de infraestructura (`WsExtensionTransport` vs `MockTransport`, `InMemoryProfileRegistry` vs adaptadores futuros) son 100% intercambiables bajo sus contratos (`ITransport`, `IProfileRegistry`).
4. **ISP (Interface Segregation Principle):** Contratos pequeños, enfocados y sin métodos superfluos (`ITransport`, `IProfileRegistry`, `ILogRepository`, `IActionHandler`).
5. **DIP (Dependency Inversion Principle):** La lógica de alto nivel (casos de uso) nunca importa dependencias de bajo nivel (sockets, HTTP o sistema de archivos). Todas las dependencias se inyectan a través del `Container` de Inversión de Control (`src/infrastructure/container/Container.js`).
6. **TDD Obligatorio (Test-Driven Development):**
   - Toda nueva función, caso de uso o comando requiere primero su prueba unitaria en `tests/unit/` (fase RED) antes de escribir la implementación (fase GREEN).
   - Invariante de 0 regresiones: la suite completa de tests de integración (`tests/bridge.test.js`) y unitarios debe pasar al 100% verde (`pnpm test`) antes de cualquier commit.
   - Prohibido crear monolitos: `server/server.js` y `server/cli.js` deben mantenerse como delegadores delgados de bootstrapping.

---

## 🔄 3. Mandato de Mejora Continua y Evolución Obligatoria
**Regla Estricta:** Cada vez que un agente utilice `chrome-ai-bridge` y experimente cualquier fricción, demora, incompatibilidad o descubra una oportunidad de optimización:
1. **Resolver el caso concreto** en el flujo de trabajo activo sin detenerse.
2. **Abstraer y consolidar la solución:** Incorporar la nueva capacidad, selector resiliente, opción de CLI, heurística de espera o soporte de componente directamente en la arquitectura (`src/`) y documentarlo en `SKILL.md`.
3. **Cero Regresiones & Suite de Tests:** Agregar el caso de prueba correspondiente en `tests/`, ejecutar `pnpm test` y verificar verde total.
4. **La herramienta debe terminar cada sesión más potente, rápida y robusta de lo que empezó.**

---

## 🕒 4. Formatos Estrictos en Plataformas Complejas (YouTube Studio)
1. **Fecha:** Obligatoriamente formato `D mmm YYYY` en minúsculas (ej: `26 nov 2026`). No usar formato ISO (`2026-11-26`) ni con barras (`26/11/2026`).
2. **Hora:** Obligatoriamente formato 12 horas con minutos, espacio estrecho (`\u202f`) y sufijo en minúsculas con puntos (`a.m.` / `p.m.`):
   - `2:00 p.m.`
   - `12:00 p.m.`
   - `4:30 a.m.`
   - `12:00 a.m.`
   - `11:45 p.m.`
   *NUNCA usar formato militar 24h (`14:00`, `18:00`), ya que el dropdown del web component de YouTube Studio reseteará el valor a medianoche (`12:00 a.m.`).*
3. **Editores Ricos (`contenteditable`):** Para descripciones o títulos multilínea en YouTube Studio, Notion o redes sociales, nunca pasar saltos como `\n` literales escapados. Inyectar saltos de párrafo reales mediante `document.execCommand('insertText')` y despachar eventos `input` y `change`.

---

## 🇪🇸 5. Protocolo de Git: Commits y Pushes en Español
Todos los mensajes de commit y operaciones de push hacia el repositorio remoto deben redactarse obligatoriamente en **idioma español** y de manera **descriptiva**, indicando el tipo convencional (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`) y el área afectada (ej. `feat(cli): desacoplar comandos usando CommandRegistry`).
