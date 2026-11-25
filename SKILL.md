---
name: chrome-ai-bridge
description: Control and inspect the user's primary Google Chrome browser in real-time. Use MANDATORILY whenever the user asks to browse the web, visit URLs, search the internet, test web apps, test responsive/mobile layouts, simulate multi-user interactions (chats, forms, uploads), read live console logs/errors, inspect network failures (HTTP 4xx/5xx/CORS), inspect the DOM, or take screenshots in Chrome.
---

# 🤖 Chrome AI Bridge — Live Browser Automation, Debugging & Web Research

Esta skill permite a los asistentes de IA (**Antigravity** y **Claude Code**) interactuar directamente con el navegador **Google Chrome principal** del usuario sin necesidad de reiniciarlo, cerrar sus pestañas o perder sus sesiones activas.

---

## 🧭 ¿Cuándo usar esta Skill? (Uso Obligatorio)

Debes invocar **MANDATORIAMENTE** esta skill cuando el usuario:
1. **Pida navegar por internet o visitar una URL:** *"Abre esta página..."*, *"Busca esto en internet..."*, *"Revisa esta web..."*.
2. **Pida probar o auditar una aplicación web en modo escritorio o móvil:** *"Prueba la versión móvil"*, *"Revisa si el menú hamburguesa funciona"*.
3. **Pida depurar errores en vivo:** *"¿Hay algún error en la consola?"*, *"¿Por qué falla esta petición o API?"*.
4. **Pida simular interacciones multi-usuario o multi-perfil:** *"Simula dos usuarios en la app"*, *"Usa mi perfil de trabajo o personal"*.
5. **Pida capturar o inspeccionar visualmente una pantalla:** *"Toma una captura de cómo se ve la app"*, *"Lee los botones que hay en pantalla"*.

---

## 🌟 Capacidades de Alto Nivel Incorporadas

1. **Soporte Multi-Perfil Simultáneo:** Permite conectar múltiples perfiles independientes de Chrome (ej. Personal, Trabajo) al mismo daemon, enrutar acciones por perfil (`--profile`) y detectar automáticamente el perfil dueño de cada pestaña mediante su `tabId`.
2. **Nombres Contextuales de Tareas / Ideas:** Toda pestaña abierta con `--task "<propósito>"` refleja inmediatamente la idea en el título de la pestaña de Chrome (`🤖 [Idea] Título`) y en el chip del grupo de pestañas, dando visibilidad total al usuario sobre qué está haciendo el agente.
3. **Cursor Virtual Animado (Glide & Click Realista):** La IA muestra un cursor de mouse SVG visible en pantalla que se desliza fluidamente (curvas Bézier según distancia) hacia el botón o input antes de hacer clic, presionándolo físicamente con animación de retroalimentación táctil y onda pulsante.
4. **Desplazamiento Suave (Smooth Scroll):** Si el elemento a presionar está fuera de pantalla, la página se desliza suavemente hasta centrarlo y el cursor acompaña la vista.
5. **Modo Responsivo Móvil / Tablet (CDP Emulation):** Permite cambiar al instante la resolución de la pestaña a vista móvil (iPhone 390x844) o tablet (iPad 768x1024) con eventos táctiles habilitados sin cambiar el tamaño de tu ventana de Windows.
6. **Auto-wait y Sincronización Dinámica (`wait`):** Sondeo activo configurable por selector CSS o texto visible para esperar modales asíncronos, transiciones o finalización de procesos pesados.
7. **Soporte Nativo de Editores Ricos (`contenteditable`):** Escribe automáticamente en componentes modernos como YouTube Studio, Notion, Twitter/X o Slack sin requerir scripts manuales.
8. **Perforación Profunda de Shadow DOM:** Atraviesa recursivamente Web Components abiertos (`tp-yt-*`, `ytcp-*`, Shoelace, Lit, Polymer) para interactuar con botones o inputs encapsulados.
9. **Evasión Inteligente de Elementos Obsoletos (Stale Elements):** Filtra nodos residuales ocultos (0x0) de modales cerrados en SPAs, interactuando siempre con el elemento visible en primer plano.
10. **Inspector de Red (CDP Network):** Captura en tiempo real respuestas HTTP fallidas (status >= 400), llamadas con errores de CORS y peticiones caídas (`loadingFailed`).

---

## ⚡ 1. Comprobación y Estado de Perfiles

El servidor local corre en el puerto `9224` y conecta a los agentes con las extensiones de Chrome mediante WebSockets.

```powershell
# Ver estado general, perfiles conectados y pestañas bajo control
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js status

# Listar solo los perfiles de Chrome conectados
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js profiles
```

---

## 📑 2. Gestión de Pestañas con Nombres de Tareas y Multi-Perfil

### A) Abrir una nueva pestaña asignándole la Tarea/Idea y Perfil
> [!IMPORTANT]
> Al abrir una pestaña con `open`, incluye **SIEMPRE** el parámetro `--task "<nombre o idea de la tarea>"` para que el usuario identifique con claridad qué hace la pestaña en su barra de navegación.

```powershell
# Abrir asignando la tarea/propósito (en el perfil activo por defecto):
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js open --url "https://instagram.com" --task "Publicar post en Instagram"

# Abrir en un perfil específico de Chrome (ej. Personal o Trabajo):
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js open --url "https://admob.google.com" --task "Auditoría de app-ads.txt" --profile "Personal"
```

### B) Cambiar o Actualizar la Tarea de una Pestaña Abierta
```powershell
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js task --tab <TAB_ID> --name "Completar formulario de registro"
```

### C) Modo Responsivo (Móvil / Tablet)
```powershell
# Emular vista móvil (iPhone con touch)
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js viewport --tab <TAB_ID> --preset mobile

# Emular tablet (iPad)
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js viewport --tab <TAB_ID> --preset tablet

# Restablecer a escritorio original
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js viewport --tab <TAB_ID> --reset
```

### D) Conectarse a una pestaña que el usuario ya tenga abierta
```powershell
# Listar todas las pestañas de Chrome (opcionalmente filtrando por perfil)
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js tabs [--profile "Personal"]

# Mover la pestaña al grupo '🤖 Antigravity AI' y conectar debugger
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js attach --tab <TAB_ID>
```

### E) Cerrar la pestaña al finalizar
```powershell
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js close --tab <TAB_ID>
```

---

## 👥 3. Simulación Multi-Usuario (Incógnito o Multi-Perfil)

1. **Vía Perfiles de Chrome:**
   - Usuario 1 en Perfil Personal: `--profile "personal"`
   - Usuario 2 en Perfil Trabajo: `--profile "trabajo"`
2. **Vía Modo Incógnito (misma sesión pero almacenamiento limpio):**
   ```powershell
   node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js open --url "http://localhost:3000" --task "Usuario B - Invitado" --incognito
   ```

---

## 🛠️ 4. Automatización e Interacción

### Esperar activamente un elemento (Auto-Wait con Timeout)
```powershell
# Esperar por selector CSS (atraviesa Shadow DOM automáticamente):
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js wait --tab <TAB_ID> --selector "button#confirm" [--timeout 10000]

# O esperar por texto visible:
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js wait --tab <TAB_ID> --text "Proceso completado" [--timeout 15000]
```

### Escribir en inputs, formularios y editores ricos (`contenteditable`)
```powershell
# En un input tradicional:
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js type --tab <TAB_ID> --selector "input[name='email']" --text "test@example.com"

# En un editor rico con contenteditable="true" (YouTube Studio, Notion, Twitter/X):
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js type --tab <TAB_ID> --selector "#textbox[contenteditable='true']" --text "Mi nuevo título viral"
```

### Hacer clic en botones o enlaces (con Cursor Animado, Shadow DOM y Evasión Stale)
```powershell
# Por selector CSS:
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js click --tab <TAB_ID> --selector "button#submit"

# O por texto visible:
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js click --tab <TAB_ID> --text "Guardar cambios"
```

### Desplazar la página suavemente (Smooth Scroll)
```powershell
# Desplazar hacia abajo 450px:
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js scroll --tab <TAB_ID> --y 450
```

### Subir archivos o imágenes (Híbrido: Input Tradicional o Botón Dinámico)
```powershell
# 1. Modo Estático: Inyección directa en <input type="file">:
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js upload --tab <TAB_ID> --selector "input[type='file']" --file "C:\ruta\avatar.png"

# 2. Modo Dinámico: Disparo de botón suprimiendo la ventana de Windows (Meta Business Suite, Canva, Drive):
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js upload --tab <TAB_ID> --button "Add photo/video" --file "C:\ruta\foto.png" [--profile "Personal"]
```

> [!NOTE]
> En aplicaciones modernas donde el input `<input type="file">` se crea en memoria al hacer clic en un botón (ej. Meta Business Suite, Canva, Google Drive), usar `--button "<texto>"` activa un monkey-patching en caliente sobre `HTMLInputElement.prototype.click` que inyecta los archivos vía `DataTransfer` y suprime por completo el diálogo nativo "Abrir" de Windows.

### Inspeccionar la estructura del DOM
```powershell
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js dom --tab <TAB_ID>
```

### Leer logs y errores de consola en vivo
```powershell
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js logs --tab <TAB_ID>
```

### Inspeccionar errores de Red y APIs (HTTP 4xx / 5xx / CORS)
```powershell
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js network --tab <TAB_ID>
```

### Tomar captura de pantalla (Inspección Visual de la Pestaña)
```powershell
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js screenshot --tab <TAB_ID>
```

### Ejecutar JavaScript arbitrario (Bypass CSP vía CDP)
```powershell
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\cli.js eval --tab <TAB_ID> --code "document.title"
```

---

## 💡 5. Patrones Avanzados y Resolución de Problemas en SPAs

### A) Bypass de Content Security Policy (`unsafe-eval` bloqueado)
* **Problema:** En sitios empresariales como `business.facebook.com`, `twitter.com` o bancos, las inyecciones de script estándar fallan con `Evaluating a string as JavaScript violates the following Content Security Policy directive: script-src ... 'unsafe-eval'`.
* **Solución de la Skill:** Ejecutar siempre código vía `cli.js eval` o llamadas nativas CDP. La extensión evalúa mediante `Runtime.evaluate` en el protocolo DevTools con `userGesture: true` y `awaitPromise: true`, saltándose por completo el bloqueo de CSP de la página. Si la pestaña se desprendió del debugger, basta abrir una nueva pestaña con `cli.js open` o re-adjuntar con `cli.js attach --tab <id>`.

### B) Formularios y Editores en React / DraftJS / Lexical / ContentEditable
* **Problema:** Asignar `input.value = "..."` o `element.innerText = "..."` no dispara los eventos sintéticos de React y los botones de guardado permanecen deshabilitados.
* **Solución:**
  1. En inputs de texto estándar, `cli.js type` utiliza el descriptor del prototipo nativo `HTMLInputElement.prototype.value.set` y emite `input`, `change` y `blur`.
  2. En editores ricos con `contenteditable="true"` (como el compositor de YouTube Studio, Instagram o Notion), `cli.js type` detecta automáticamente el nodo editable y ejecuta `document.execCommand('insertText')`, garantizando que el estado interno se actualice sin trucos manuales.

### C) Perforación Profunda de Shadow DOM y Web Components (Google Apps, Lit, Polymer)
* **Problema:** `document.querySelector` devuelve `null` al buscar botones o inputs situados dentro de componentes web modernos (ej. `#second-container-expand-button`, `ytcp-video-metadata-editor`).
* **Solución:** Las acciones `click`, `type`, `wait_for` y `get_dom` de la extensión exploran recursivamente tanto el árbol del DOM como todos los `shadowRoot` abiertos en cascada.

### D) Evasión de Elementos Obsoletos (Stale Elements) en Modales Consecutivos
* **Problema:** En SPAs con flujos multi-paso o modales recurrentes (ej. subida de múltiples archivos en YouTube Studio), los diálogos anteriores no se destruyen del DOM sino que se ocultan con `0x0` píxeles. Un selector ingenuo hace clic en el diálogo cerrado inactivo.
* **Solución:** La extensión filtra todos los candidatos verificando su caja de delimitación (`rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'`), seleccionando siempre el último elemento visible activo en pantalla.

### E) Calendarios y Date Pickers Dinámicos (Evitar Desincronización)
* **Problema:** Al escribir una fecha en texto (`Nov 19, 2026`), los componentes de calendario de React mantienen internamente la fecha por defecto.
* **Solución:** Hacer clic en el input para abrir el calendario flotante nativo y disparar el clic directamente sobre el nodo del día por su atributo `aria-label` (ej. `[aria-label*="19 November 2026"]`), o sobre el botón `Next month` para meses posteriores.

### F) Formatos Estrictos de Fecha y Hora en YouTube Studio (Chile / Español)
* **Formato de Fecha:** Obligatoriamente `D mmm YYYY` en minúsculas (ejemplo: `26 nov 2026`). Si se envía en formato ISO (`2026-11-26`) o numérico con barras (`26/11/2026`), YouTube Studio no lo reconoce o lo resetea.
* **Formato de Hora:** Obligatoriamente formato 12 horas con minutos y sufijo `a.m.` / `p.m.` en minúsculas con puntos:
  - `2:00 p.m.` (14:00 hrs)
  - `12:00 p.m.` (12:00 hrs mediodía)
  - `4:30 a.m.` (04:30 hrs madrugada)
  - `12:00 a.m.` (00:00 hrs medianoche)
  - `11:45 p.m.` (23:45 hrs noche)
* **Regla de Automatización:** NUNCA enviar formato de 24 horas (`14:00`, `18:00`) ni mayúsculas (`PM` / `AM`), ya que el dropdown del web component de YouTube (`tp-yt-paper-item` en el selector de hora) requiere coincidencia exacta con `\u202f` (espacio estrecho) o el texto localizado del selector.

### G) Si el Servidor Daemon no Responde (Puerto 9224)
Si el comando arroja `Error: No se puede conectar al servidor en http://localhost:9224`:
```powershell
# Levantar el servidor en segundo plano
node C:\Proyectos\yoguidev\chrome-ai-bridge\server\server.js
```
