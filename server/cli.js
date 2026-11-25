#!/usr/bin/env node

/**
 * CLI para interactuar con Antigravity Chrome Bridge
 * Uso: node server/cli.js <command> [opciones]
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BRIDGE_URL || 'http://localhost:9224';

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(rawArgs) {
  const flags = {};
  for (let i = 0; i < rawArgs.length; i++) {
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
    }
  }
  return flags;
}

const flags = parseFlags(args.slice(1));

async function callApi(endpoint, method = 'GET', data = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);

    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    const json = await res.json();
    return json;
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`❌ Error: No se puede conectar al servidor en ${BASE_URL}.`);
      console.error(`   Asegúrate de ejecutar primero: pnpm start`);
    } else {
      console.error(`❌ Error de conexión:`, err.message);
    }
    process.exit(1);
  }
}

async function runAction(action, params = {}, profile = null) {
  const targetProfile = profile || flags.profile || null;
  const res = await callApi('/action', 'POST', { action, params, profile: targetProfile });
  if (!res.ok) {
    console.error(`❌ Error ejecutando "${action}":`, res.error);
    process.exit(1);
  }
  return res.result;
}

async function main() {
  switch (command) {
    case 'status':
    case 'health': {
      const status = await callApi('/status');
      console.log('--- ESTADO DE CHROME BRIDGE ---');
      console.log(`Servidor activo:      Puerto ${status.port}`);
      console.log(`Extensión conectada:  ${status.extensionConnected ? '✅ SÍ' : '❌ NO'}`);
      console.log(`Perfiles activos:     ${status.profilesCount ?? (status.extensionConnected ? 1 : 0)}`);
      console.log(`Pestañas bajo control: ${status.tabsCount}`);

      if (status.profiles && status.profiles.length > 0) {
        console.log('\n👤 Perfiles de Chrome conectados:');
        status.profiles.forEach((p, idx) => {
          console.log(`  [${idx + 1}] "${p.name}" (ID: ${p.id}) — ${p.tabsCount} pestaña(s)`);
          if (p.tabs && p.tabs.length > 0) {
            p.tabs.forEach(t => {
              const taskLabel = t.task ? ` 🎯 [${t.task}]` : '';
              console.log(`      • [Tab #${t.tabId}]${taskLabel} ${t.groupTitle || t.sessionName} (${t.incognito ? 'Incógnito' : 'Normal'})`);
              console.log(`        URL: ${t.url}`);
            });
          }
        });
      } else if (status.tabs && status.tabs.length > 0) {
        console.log('\nPestañas activas:');
        status.tabs.forEach(t => {
          const taskLabel = t.task ? ` 🎯 [${t.task}]` : '';
          console.log(`  • [Tab #${t.tabId}]${taskLabel} ${t.groupTitle || t.sessionName} (${t.incognito ? 'Incógnito' : 'Normal'})`);
          console.log(`    URL: ${t.url}`);
        });
      }
      break;
    }

    case 'profiles':
    case 'list-profiles': {
      const data = await callApi('/profiles');
      console.log(`\n=== PERFILES DE CHROME CONECTADOS (${data.count}) ===`);
      if (data.count === 0) {
        console.log('No hay extensiones de Chrome registradas.');
        console.log('Abre Chrome y verifica que la extensión esté cargada y conectada.');
      } else {
        data.profiles.forEach((p, idx) => {
          console.log(`  ${idx + 1}. [${p.name}] ID: ${p.id} (${p.tabsCount} pestaña(s) controladas)`);
        });
      }
      break;
    }

    case 'tabs':
    case 'list-all': {
      const tabs = await runAction('list_all_tabs', {}, flags.profile);
      const profileLabel = flags.profile ? ` [Perfil: ${flags.profile}]` : '';
      console.log(`\n=== TODAS LAS PESTAÑAS ABIERTAS EN CHROME${profileLabel} (${tabs.length}) ===`);
      tabs.forEach(t => {
        const flagManaged = t.isManaged ? ' [🤖 GESTIONADA]' : '';
        const flagActive = t.active ? ' [ACTIVA]' : '';
        console.log(`  • Tab #${t.tabId}${flagActive}${flagManaged}`);
        console.log(`    Título: ${t.title}`);
        console.log(`    URL:    ${t.url}`);
      });
      break;
    }

    case 'attach': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const groupTitle = flags.group || '🤖 Antigravity AI';
      const groupColor = flags.color || 'purple';
      const sessionName = flags.session || 'user_active';

      console.log(`Uniendo Tab #${tabId} al grupo "${groupTitle}"...`);
      const res = await runAction('attach_tab', { tabId, sessionName, groupTitle, groupColor }, flags.profile);
      console.log(`✅ Pestaña incorporada con éxito al grupo!`);
      console.log(`   Tab ID: #${res.tabId}`);
      console.log(`   Grupo:  ${res.groupTitle}`);
      console.log(`   URL:    ${res.url}`);
      break;
    }

    case 'open':
    case 'open-tab': {
      const url = flags.url || 'http://localhost:3000';
      const task = flags.task || flags.idea || flags.name || null;
      const sessionName = flags.session || 'user_1';
      const defaultGroup = task ? `🤖 ${task}` : '🤖 Antigravity AI';
      const groupTitle = flags.group || defaultGroup;
      const groupColor = flags.color || 'purple';
      const incognito = Boolean(flags.incognito);
      const newWindow = Boolean(flags.window);
      const profileName = flags.profile || null;

      const profLabel = profileName ? ` en perfil "${profileName}"` : '';
      const taskLabel = task ? ` [Idea: "${task}"]` : '';
      console.log(`Abriendo pestaña${profLabel}${taskLabel}: ${url} (${incognito ? 'Modo Incógnito' : 'Modo Normal'})...`);
      const res = await runAction('create_tab', {
        url,
        task,
        sessionName,
        groupTitle,
        groupColor,
        incognito,
        newWindow
      }, profileName);
      console.log(`✅ Pestaña creada con éxito!`);
      console.log(`   Tab ID:     #${res.tabId}`);
      if (res.task) {
        console.log(`   Idea/Tarea: ${res.task}`);
      }
      console.log(`   Grupo:      ${res.groupTitle} (Color: ${res.groupColor})`);
      console.log(`   Sesión:     ${res.sessionName}`);
      break;
    }

    case 'task':
    case 'set-task': {
      const tabId = parseInt(flags.tab, 10);
      const task = flags.name || flags.task || flags.idea;
      if (!tabId || !task) {
        console.error('❌ Faltan argumentos: --tab <id> --name "<idea o tarea a realizar>"');
        process.exit(1);
      }
      const res = await runAction('set_task', { tabId, task }, flags.profile);
      console.log(`✅ Idea/Tarea de Tab #${tabId} actualizada a: "${res.task}"`);
      console.log(`   Grupo en Chrome: "${res.groupTitle}"`);
      break;
    }

    case 'click': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const selector = flags.selector ? String(flags.selector).replace(/^['"]|['"]$/g, '') : null;
      const textToMatch = flags.text || null;
      const res = await runAction('click', { tabId, selector, textToMatch }, flags.profile);
      if (res && res.tagName) {
        console.log(`✅ Clic ejecutado en elemento <${res.tagName}> (Texto: "${res.text || ''}")`);
      } else {
        console.log('✅ Clic ejecutado correctamente');
      }
      break;
    }

    case 'wait': {
      const tabId = parseInt(flags.tab, 10);
      const selector = flags.selector ? String(flags.selector).replace(/^['"]|['"]$/g, '') : null;
      const textToMatch = flags.text || null;
      const timeout = flags.timeout ? parseInt(flags.timeout, 10) : 10000;

      if (!tabId || (!selector && !textToMatch)) {
        console.error('❌ Faltan argumentos: --tab <id> (--selector <css> o --text <texto>) [--timeout <ms>]');
        process.exit(1);
      }

      const res = await runAction('wait_for', { tabId, selector, textToMatch, timeout }, flags.profile);
      console.log(`✅ Elemento detectado con éxito: <${res?.tagName || 'ELEMENTO'}> (id: "${res?.id || ''}", texto: "${res?.text || ''}")`);
      break;
    }

    case 'type': {
      const tabId = parseInt(flags.tab, 10);
      const selector = flags.selector ? String(flags.selector).replace(/^['"]|['"]$/g, '') : null;
      const text = flags.text ?? '';
      const clearFirst = flags.clear !== 'false' && flags.clear !== false;

      if (!tabId || !selector) {
        console.error('❌ Faltan argumentos: --tab <id> --selector <css> --text <valor>');
        process.exit(1);
      }

      const res = await runAction('type', { tabId, selector, text, clearFirst }, flags.profile);
      console.log(`✅ Texto ingresado en "${selector}": "${res?.value ?? text}"`);
      break;
    }

    case 'upload': {
      const tabId = parseInt(flags.tab, 10);
      const selector = flags.selector ? String(flags.selector).replace(/^['"]|['"]$/g, '') : null;
      const button = flags.button || null;
      const filePath = flags.file;
      const profile = flags.profile || null;

      if (!tabId || !filePath) {
        console.error('❌ Faltan argumentos: --tab <id> --file <ruta> [--button <textoOBotón> | --selector <css>]');
        process.exit(1);
      }

      const fullPath = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ Archivo no encontrado: ${fullPath}`);
        process.exit(1);
      }

      const fileName = path.basename(fullPath);
      const fileDataBase64 = fs.readFileSync(fullPath).toString('base64');
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.webm': 'video/webm',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.zip': 'application/zip'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      const res = await runAction('upload_file', {
        tabId,
        selector,
        button,
        fileName,
        fileDataBase64,
        mimeType
      }, profile);

      if (!res) {
        console.error('❌ Error: La extensión no devolvió confirmación de subida.');
        process.exit(1);
      }

      console.log(`✅ Archivo cargado con éxito: "${res.fileName}" (${res.fileSize} bytes)`);
      if (res.mode === 'dynamic_button_intercepted') {
        console.log(`   Modo: Intercepción dinámica (botón: "${res.buttonText}")`);
        console.log(`   🛡️ Ventana modal nativa de Windows suprimida exitosamente.`);
      } else {
        console.log(`   Modo: Inyección directa en <input type="file">`);
      }
      break;
    }

    case 'dom': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const res = await runAction('get_dom', { tabId, selector: flags.selector }, flags.profile);
      console.log(`\n=== RESUMEN DOM: [${res.title}] ===`);
      console.log(`URL: ${res.url}\n`);

      if (res.headings.length) {
        console.log('Titulares:');
        res.headings.forEach(h => console.log(`  • [${h.level}] ${h.text}`));
      }

      if (res.inputs.length) {
        console.log('\nCampos de Entrada:');
        res.inputs.forEach(i => console.log(`  • <${i.tag} type="${i.type}"> id="${i.id}" name="${i.name}" placeholder="${i.placeholder}" valor="${i.value}"`));
      }

      if (res.buttons.length) {
        console.log('\nBotones Disponibles:');
        res.buttons.forEach(b => console.log(`  • [${b.tag}] "${b.text}" id="${b.id}" class="${b.className}"`));
      }

      if (res.alerts.length) {
        console.log('\n⚠️ Alertas/Errores detectados en la interfaz:');
        res.alerts.forEach(a => console.log(`  • ${a.text}`));
      }
      break;
    }

    case 'logs': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const data = await callApi(`/logs/${tabId}`);
      console.log(`\n=== LOGS DE CONSOLA PARA TAB #${tabId} (${data.count} eventos) ===`);
      data.logs.forEach(l => {
        const icon = l.level === 'error' ? '❌' : (l.level === 'warning' ? '⚠️' : '📝');
        const time = new Date(l.timestamp).toLocaleTimeString();
        console.log(`[${time}] ${icon} [${l.level.toUpperCase()}]: ${l.text}`);
      });
      break;
    }

    case 'network': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const data = await callApi(`/network/${tabId}`);
      console.log(`\n=== ERRORES Y PETICIONES DE RED PARA TAB #${tabId} (${data.count} incidentes) ===`);
      if (data.networkErrors.length === 0) {
        console.log('✅ No se han detectado errores HTTP (4xx/5xx) ni caídas de conexión.');
      } else {
        data.networkErrors.forEach(n => {
          const time = new Date(n.timestamp).toLocaleTimeString();
          if (n.status) {
            console.log(`[${time}] 🌐 [HTTP ${n.status} ${n.statusText}] (${n.resourceType || 'fetch'}):`);
            console.log(`         URL: ${n.url}`);
          } else {
            console.log(`[${time}] ⚠️ [CONEXIÓN/CORS FALLÓ]: ${n.errorText} (${n.resourceType || 'request'})`);
          }
        });
      }
      break;
    }

    case 'viewport':
    case 'responsive': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }

      if (flags.reset) {
        await runAction('reset_viewport', { tabId }, flags.profile);
        console.log(`✅ Vista restablecida al tamaño original en Tab #${tabId}`);
        break;
      }

      const preset = flags.preset || 'mobile';
      const width = flags.width ? parseInt(flags.width, 10) : undefined;
      const height = flags.height ? parseInt(flags.height, 10) : undefined;

      const res = await runAction('set_viewport', { tabId, preset, width, height }, flags.profile);
      console.log(`📱 Modo responsivo activado en Tab #${tabId}:`);
      console.log(`   Preset: ${res.preset}`);
      console.log(`   Resolución: ${res.width}x${res.height} (Mobile: ${res.mobile})`);
      break;
    }

    case 'scroll': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const y = flags.y ? parseInt(flags.y, 10) : 450;
      const x = flags.x ? parseInt(flags.x, 10) : 0;
      const res = await runAction('scroll', { tabId, y, x, behavior: 'smooth' }, flags.profile);
      console.log(`📜 Desplazamiento suave completado en Tab #${tabId}: (X: ${res.scrollX}, Y: ${res.scrollY})`);
      break;
    }

    case 'screenshot': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const res = await runAction('take_screenshot', { tabId }, flags.profile);
      console.log(`✅ Captura de pantalla guardada con éxito:`);
      console.log(`   Ruta: ${res.savedFilePath}`);
      break;
    }

    case 'eval': {
      const tabId = parseInt(flags.tab, 10);
      const code = flags.code;
      if (!tabId || !code) {
        console.error('❌ Faltan argumentos: --tab <id> --code "<javascript>"');
        process.exit(1);
      }
      const res = await runAction('eval_js', { tabId, code }, flags.profile);
      if (res.success) {
        console.log('Resultado:', res.value);
      } else {
        console.error('Error de ejecución:', res.error);
      }
      break;
    }

    case 'dialog': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      const accept = flags.accept !== 'false' && flags.accept !== false;
      const promptText = flags.text || '';
      const res = await runAction('handle_dialog', { tabId, accept, promptText }, flags.profile);
      console.log(`💬 Diálogo nativo respondido en Tab #${tabId} (Aceptado: ${res.accept})`);
      break;
    }

    case 'close':
    case 'close-tab': {
      const tabId = parseInt(flags.tab, 10);
      if (!tabId) {
        console.error('❌ Falta --tab <id>');
        process.exit(1);
      }
      await runAction('close_tab', { tabId }, flags.profile);
      console.log(`✅ Tab #${tabId} cerrada.`);
      break;
    }

    default: {
      console.log(`
Antigravity Chrome AI Bridge CLI (Soporte Multi-Perfil)
-------------------------------------------------------
Comandos disponibles:

  node server/cli.js status
      Verifica el estado del servidor, los perfiles de Chrome conectados y sus pestañas.

  node server/cli.js profiles
      Lista todos los perfiles de Chrome conectados (personal, trabajo, etc.).

  node server/cli.js tabs [--profile <nombre>]
      Lista las pestañas abiertas en Chrome (filtrando opcionalmente por perfil).

  node server/cli.js open --url <url> [--profile <nombre>] [--task <idea>] [--incognito]
      Abre una pestaña en el perfil de Chrome especificado o en modo incógnito.

  node server/cli.js task --tab <id> --name "<nueva tarea>"
      Actualiza en caliente la tarea o idea asignada a una pestaña y su título en Chrome.

  node server/cli.js click --tab <id> [--selector <css>] [--text <texto>] [--profile <nombre>]
      Hace clic en un botón o elemento con animación suave y cursor virtual.

  node server/cli.js wait --tab <id> [--selector <css>] [--text <texto>] [--timeout <ms>] [--profile <nombre>]
      Espera hasta que un elemento aparezca y sea visible en el DOM o Shadow DOM.

  node server/cli.js type --tab <id> --selector <css> --text <valor> [--clear false] [--profile <nombre>]
      Escribe texto en un campo de formulario (compatible con React/Vue/Angular).

  node server/cli.js upload --tab <id> --file <rutaArchivo> [--button <texto>] [--selector <css>] [--profile <nombre>]
      Sube un archivo a un input tradicional o hace clic en un botón suprimiendo la ventana de Windows.

  node server/cli.js dom --tab <id> [--profile <nombre>]
      Lee la estructura de botones, campos de texto, títulos y alertas de la página.

  node server/cli.js logs --tab <id>
      Muestra todos los console.log, advertencias y errores capturados en tiempo real.

  node server/cli.js network --tab <id>
      Muestra errores HTTP (4xx/5xx) y caídas de red o CORS en vivo.

  node server/cli.js viewport --tab <id> [--preset mobile|tablet|desktop] [--reset] [--profile <nombre>]
      Emula resolución responsive móvil o tablet vía CDP.

  node server/cli.js scroll --tab <id> [--y <pixeles>] [--x <pixeles>] [--profile <nombre>]
      Desplaza la página suavemente.

  node server/cli.js screenshot --tab <id> [--profile <nombre>]
      Captura la pantalla actual y la guarda en la carpeta 'screenshots/'.

  node server/cli.js eval --tab <id> --code "<js>" [--profile <nombre>]
      Ejecuta JavaScript directamente en la pestaña (vía CDP Runtime.evaluate).

  node server/cli.js dialog --tab <id> [--accept true|false] [--text <prompt>] [--profile <nombre>]
      Maneja o responde a un diálogo nativo de JavaScript (alert, confirm, prompt).

  node server/cli.js close --tab <id> [--profile <nombre>]
      Cierra la pestaña indicada.
`);
      break;
    }
  }
}

main();
