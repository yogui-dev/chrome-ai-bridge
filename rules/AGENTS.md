# Chrome AI Bridge — Reglas de Navegación y Automatización

## 🌐 Uso Obligatorio para Navegación Web e Interacción en Vivo
Ante cualquier solicitud de navegar por internet, visitar páginas web, investigar documentación online, probar aplicaciones web, inspeccionar interfaces, completar formularios, interactuar con múltiples usuarios o depurar en vivo:
1. **Conexión Directa:** Usar SIEMPRE la skill `chrome-ai-bridge` conectándose al navegador Chrome principal del usuario mediante el daemon local (`http://localhost:9224` o `node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js ...`).
2. **Agrupación Visual:** Todas las pestañas creadas o inspeccionadas para tareas del agente deben mantenerse organizadas bajo el grupo unificado **`🤖 Antigravity AI`** (o incorporadas con `attach`), manteniendo el navegador del usuario limpio y ordenado.
3. **Pruebas Multi-usuario:** Usar el modo `--incognito` para el segundo usuario cuando se requieran sesiones y cookies totalmente aisladas, o `--profile "<nombre>"` para conmutar entre perfiles activos.
4. **Nombres de Tarea:** Al abrir una pestaña con `open`, incluir siempre `--task "<propósito>"` para que el usuario identifique la actividad en su barra de pestañas.

## 🕒 Formatos Estrictos en Plataformas Complejas (YouTube Studio)
1. **Fecha:** Obligatoriamente formato `D mmm YYYY` en minúsculas (ej: `26 nov 2026`). No usar formato ISO (`2026-11-26`) ni con barras (`26/11/2026`).
2. **Hora:** Obligatoriamente formato 12 horas con minutos, espacio estrecho (`\u202f`) y sufijo en minúsculas con puntos (`a.m.` / `p.m.`):
   - `2:00 p.m.`
   - `12:00 p.m.`
   - `4:30 a.m.`
   - `12:00 a.m.`
   - `11:45 p.m.`
   *NUNCA usar formato militar 24h (`14:00`, `18:00`), ya que el dropdown del web component de YouTube Studio reseteará el valor a medianoche (`12:00 a.m.`).*
3. **Editores Ricos (`contenteditable`):** Para descripciones o títulos multilínea en YouTube Studio, Notion o redes sociales, nunca pasar saltos como `\n` literales escapados. Inyectar saltos de párrafo reales mediante `document.execCommand('insertText')` y despachar eventos `input` y `change`.
