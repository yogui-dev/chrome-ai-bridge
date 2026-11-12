/**
 * Antigravity AI Chrome Bridge - Background Service Worker
 * Manages WebSocket connection, chrome.debugger (CDP), tabGroups, and browser automation.
 */

const DEFAULT_SERVER_URL = 'ws://localhost:9224/ws';
let ws = null;
let reconnectTimer = null;
let currentServerUrl = DEFAULT_SERVER_URL;
let isConnected = false;
let heartbeatInterval = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
    }
  }, 20000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// Managed tabs state: tabId -> TabInfo
const managedTabs = new Map();

let currentProfileId = null;
let currentProfileName = null;

async function ensureProfileInfo() {
  const stored = await chrome.storage.local.get(['profileId', 'profileName']);
  currentProfileId = stored.profileId;
  currentProfileName = stored.profileName;

  if (!currentProfileId) {
    currentProfileId = 'prof_' + Math.random().toString(36).substring(2, 9);
    await chrome.storage.local.set({ profileId: currentProfileId });
  }

  if (!currentProfileName) {
    try {
      if (chrome.identity && chrome.identity.getProfileUserInfo) {
        const userInfo = await new Promise(r => chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, r));
        if (userInfo && userInfo.email) {
          currentProfileName = userInfo.email;
        }
      }
    } catch (_) {}

    if (!currentProfileName) {
      currentProfileName = 'Perfil-' + currentProfileId.substring(5, 9);
    }
    await chrome.storage.local.set({ profileName: currentProfileName });
  }

  return { profileId: currentProfileId, profileName: currentProfileName };
}

// Initialize server URL from storage
chrome.storage.local.get(['serverUrl'], async (res) => {
  if (res.serverUrl) currentServerUrl = res.serverUrl;
  await ensureProfileInfo();
  connectWebSocket();
});

// Despertar y reconectar ante actividad del usuario en Chrome
chrome.tabs.onActivated.addListener(() => {
  if (!isConnected) connectWebSocket();
});
chrome.tabs.onCreated.addListener(() => {
  if (!isConnected) connectWebSocket();
});

// ---------------------------------------------------------
// WebSocket Connection Management
// ---------------------------------------------------------

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    console.log('[AI Bridge] Conectando a:', currentServerUrl);
    ws = new WebSocket(currentServerUrl);

    ws.onopen = async () => {
      console.log('[AI Bridge] ✅ Conectado al servidor puente');
      isConnected = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      startHeartbeat();

      await ensureProfileInfo();

      // Enviar registro de perfil, saludo inicial y lista de pestañas activas
      sendMessage({
        type: 'register_profile',
        profileId: currentProfileId,
        profileName: currentProfileName,
        timestamp: Date.now(),
        tabs: Array.from(managedTabs.values())
      });
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerCommand(message);
      } catch (err) {
        console.error('[AI Bridge] Error procesando mensaje del servidor:', err);
      }
    };

    ws.onclose = () => {
      console.log('[AI Bridge] Desconectado. Reintentando en 3s...');
      isConnected = false;
      stopHeartbeat();
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.warn('[AI Bridge] WebSocket error:', err);
      ws.close();
    };
  } catch (err) {
    console.error('[AI Bridge] Error al inicializar WebSocket:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, 3000);
}

function sendMessage(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (currentProfileId && !payload.profileId) {
      payload.profileId = currentProfileId;
    }
    if (currentProfileName && !payload.profileName) {
      payload.profileName = currentProfileName;
    }
    ws.send(JSON.stringify(payload));
  }
}

// ---------------------------------------------------------
// Dispatcher de Comandos desde el Servidor
// ---------------------------------------------------------

async function handleServerCommand(msg) {
  const { id, action, params = {} } = msg;

  try {
    let result = null;

    switch (action) {
      case 'ping':
        result = { pong: true, time: Date.now() };
        break;

      case 'create_tab':
        result = await createManagedTab(params);
        break;

      case 'set_task':
        result = await setTabTask(params);
        break;

      case 'attach_tab':
        result = await attachExistingTab(params);
        break;

      case 'list_all_tabs':
        result = await listAllBrowserTabs();
        break;

      case 'list_tabs':
        result = Array.from(managedTabs.values());
        break;

      case 'close_tab':
        result = await closeManagedTab(params.tabId);
        break;

      case 'navigate':
        result = await navigateTab(params);
        break;

      case 'click':
        result = await clickElement(params);
        break;

      case 'type':
        result = await typeElement(params);
        break;

      case 'upload_file':
        result = await uploadFile(params);
        break;

      case 'get_dom':
        result = await getDOMSummary(params);
        break;

      case 'eval_js':
        result = await evalJavaScript(params);
        break;

      case 'take_screenshot':
        result = await captureScreenshot(params);
        break;

      case 'get_logs':
        result = await getTabLogs(params);
        break;

      case 'get_network':
        result = await getTabNetworkErrors(params);
        break;

      case 'set_viewport':
        result = await setViewport(params);
        break;

      case 'reset_viewport':
        result = await resetViewport(params);
        break;

      case 'scroll':
        result = await scrollTab(params);
        break;

      default:
        throw new Error(`Acción desconocida: ${action}`);
    }

    sendMessage({ id, success: true, result });
  } catch (err) {
    console.error(`[AI Bridge] Error en acción ${action}:`, err);
    sendMessage({ id, success: false, error: err.message || String(err) });
  }
}

// ---------------------------------------------------------
// Funciones de Automatización y Control de Pestañas
// ---------------------------------------------------------

/**
 * Agrupa una pestaña bajo un grupo unificado (reutiliza el grupo si ya existe en la misma ventana)
 */
async function assignTabToGroup(tabId, windowId, groupTitle = '🤖 Antigravity AI', groupColor = 'purple') {
  try {
    const groups = await chrome.tabGroups.query({ windowId });
    const existingGroup = (groups || []).find(g => g.title === groupTitle);
    let groupId = null;

    if (existingGroup) {
      groupId = existingGroup.id;
      await chrome.tabs.group({ tabIds: [tabId], groupId });
      await chrome.tabGroups.update(groupId, { collapsed: false });
    } else {
      groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, {
        title: groupTitle,
        color: groupColor,
        collapsed: false
      });
    }

    return groupId;
  } catch (err) {
    console.warn('[AI Bridge] Error agrupando pestaña:', err.message);
    return null;
  }
}

/**
 * Lista todas las pestañas abiertas en el navegador del usuario
 */
async function listAllBrowserTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map(t => ({
    tabId: t.id,
    windowId: t.windowId,
    groupId: t.groupId,
    title: t.title,
    url: t.url,
    active: t.active,
    incognito: t.incognito,
    isManaged: managedTabs.has(t.id)
  }));
}

/**
 * Toma una pestaña que el usuario ya tenga abierta, la mete al grupo y conecta el debugger
 */
async function attachExistingTab({
  tabId,
  sessionName = 'user_active',
  groupTitle = '🤖 Antigravity AI',
  groupColor = 'purple'
}) {
  if (!tabId) throw new Error('tabId requerido');
  const tab = await chrome.tabs.get(tabId);
  if (!tab) throw new Error(`Pestaña #${tabId} no encontrada`);

  let groupId = null;
  if (!tab.incognito) {
    groupId = await assignTabToGroup(tab.id, tab.windowId, groupTitle, groupColor);
  }

  let attachedDebugger = false;
  try {
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Console.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Network.enable');
    attachedDebugger = true;
  } catch (e) {
    console.warn('[AI Bridge] Error adjuntando debugger a pestaña existente:', e.message);
  }

  const tabInfo = {
    tabId: tab.id,
    windowId: tab.windowId,
    groupId,
    sessionName,
    groupTitle,
    groupColor,
    incognito: tab.incognito,
    url: tab.url,
    title: tab.title,
    attachedDebugger,
    logs: [],
    networkErrors: [],
    createdAt: Date.now()
  };

  managedTabs.set(tab.id, tabInfo);
  return tabInfo;
}

/**
 * Crea una pestaña o ventana (soporta incógnito para multi-usuario aislado)
 */
async function createManagedTab({
  url = 'about:blank',
  task = null,
  sessionName = 'user_1',
  groupTitle = null,
  groupColor = 'purple',
  incognito = false,
  newWindow = false
}) {
  const effectiveGroupTitle = groupTitle || (task ? `🤖 ${task}` : '🤖 Antigravity AI');
  let tab = null;

  if (incognito) {
    const isAllowed = await chrome.extension.isAllowedIncognitoAccess();
    if (!isAllowed) {
      throw new Error(
        'Modo Incógnito no permitido. Ve a chrome://extensions > Detalles de "Antigravity AI Chrome Bridge" y activa "Permitir en incógnito".'
      );
    }
    const win = await chrome.windows.create({ incognito: true, url });
    tab = win.tabs[0];
  } else if (newWindow) {
    const win = await chrome.windows.create({ url });
    tab = win.tabs[0];
  } else {
    tab = await chrome.tabs.create({ url });
  }

  // Agrupar la pestaña en el grupo unificado
  let groupId = null;
  if (!incognito) {
    groupId = await assignTabToGroup(tab.id, tab.windowId, effectiveGroupTitle, groupColor);
  }

  // Adjuntar debugger (CDP)
  let attachedDebugger = false;
  try {
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Console.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Network.enable');
    attachedDebugger = true;
  } catch (e) {
    console.warn('[AI Bridge] Error adjuntando debugger:', e.message);
  }

  const tabInfo = {
    tabId: tab.id,
    windowId: tab.windowId,
    groupId,
    task: task || null,
    sessionName,
    groupTitle: effectiveGroupTitle,
    groupColor,
    incognito,
    url,
    attachedDebugger,
    logs: [],
    networkErrors: [],
    createdAt: Date.now()
  };

  managedTabs.set(tab.id, tabInfo);

  if (task) {
    // Aplicar título con el nombre de la tarea en cuanto la pestaña complete su carga
    const applyTitle = () => applyTaskTitleToTab(tab.id, task);
    chrome.tabs.onUpdated.addListener(function onLoaded(updatedTabId, info) {
      if (updatedTabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onLoaded);
        setTimeout(applyTitle, 300);
      }
    });
  }

  return tabInfo;
}

/**
 * Inyecta el nombre de la tarea o idea en el document.title de la pestaña
 */
async function applyTaskTitleToTab(tabId, task) {
  if (!tabId || !task) return;
  const safePrefix = JSON.stringify(`🤖 [${task}] `);
  const code = `
    (() => {
      window.__current_task_prefix = ${safePrefix};
      const cleanTitle = document.title.replace(/^🤖\\s*\\[[^\\]]+\\]\\s*/, '');
      document.title = window.__current_task_prefix + (cleanTitle || 'Antigravity');

      if (!window.__title_observer_active) {
        window.__title_observer_active = true;
        const target = document.querySelector('title') || document.head;
        if (target) {
          const obs = new MutationObserver(() => {
            const pref = window.__current_task_prefix || '';
            if (pref && !document.title.startsWith(pref)) {
              const cur = document.title.replace(/^🤖\\s*\\[[^\\]]+\\]\\s*/, '');
              document.title = pref + cur;
            }
          });
          obs.observe(target, { childList: true, subtree: true });
        }
      }
    })()
  `;
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: code,
      returnByValue: true
    });
  } catch (_) {}
}

/**
 * Actualiza la tarea/idea asignada a una pestaña activa
 */
async function setTabTask({ tabId, task }) {
  if (!tabId || !task) throw new Error('tabId y task requeridos');
  const tabInfo = managedTabs.get(tabId);
  if (tabInfo) {
    tabInfo.task = task;
    tabInfo.groupTitle = `🤖 ${task}`;
    if (tabInfo.groupId) {
      try {
        await chrome.tabGroups.update(tabInfo.groupId, { title: `🤖 ${task}` });
      } catch (_) {}
    }
    await applyTaskTitleToTab(tabId, task);
    return { success: true, tabId, task, groupTitle: tabInfo.groupTitle };
  }
  throw new Error(`Tab #${tabId} no encontrada`);
}

/**
 * Cierra una pestaña gestionada
 */
async function closeManagedTab(tabId) {
  if (!tabId) throw new Error('tabId requerido');
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {}

  await chrome.tabs.remove(tabId);
  managedTabs.delete(tabId);
  return { closed: true, tabId };
}

/**
 * Navega a una URL y espera a que cargue
 */
async function navigateTab({ tabId, url, timeoutMs = 15000 }) {
  if (!tabId || !url) throw new Error('tabId y url requeridos');

  await chrome.tabs.update(tabId, { url });

  // Esperar a que el tab termine de cargar
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ status: 'timeout_but_navigated', url });
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        const tabInfo = managedTabs.get(tabId);
        if (tabInfo) tabInfo.url = url;
        resolve({ status: 'complete', url });
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Hace clic en un elemento (con auto-wait, scroll suave, cursor virtual animado y clic realista)
 */
async function clickElement({ tabId, selector, textToMatch, timeout = 5000 }) {
  if (!tabId) throw new Error('tabId requerido');
  if (!selector && !textToMatch) throw new Error('selector o textToMatch requerido');

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (sel, text, timeoutMs) => {
      // 1. Auto-wait con polling hasta timeoutMs
      const startTime = Date.now();
      let el = null;

      while (Date.now() - startTime < timeoutMs) {
        if (sel) el = document.querySelector(sel);
        if (!el && text) {
          const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"], span, div, p, label'));
          el = candidates.find(c => c.textContent && c.textContent.trim().toLowerCase().includes(text.toLowerCase()));
        }
        if (el) break;
        await new Promise(r => setTimeout(r, 60));
      }

      if (!el) {
        throw new Error(`Elemento no encontrado tras esperar ${timeoutMs}ms (selector: "${sel}", text: "${text}")`);
      }

      // 2. Desplazamiento suave (Smooth Scroll) si el elemento no está en el viewport
      const initialRect = el.getBoundingClientRect();
      const inViewport = initialRect.top >= 40 && initialRect.bottom <= (window.innerHeight - 40);
      if (!inViewport) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 450));
      }

      // 3. Crear o recuperar el cursor virtual flotante
      let cursor = document.getElementById('__antigravity_virtual_cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = '__antigravity_virtual_cursor';
        cursor.style.position = 'fixed';
        cursor.style.pointerEvents = 'none';
        cursor.style.zIndex = '2147483647';
        cursor.style.width = '24px';
        cursor.style.height = '24px';
        cursor.style.left = `${window.innerWidth / 2}px`;
        cursor.style.top = `${window.innerHeight / 2}px`;
        cursor.style.transformOrigin = '3px 2px';

        cursor.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 7px rgba(0,0,0,0.5));">
            <path d="M4 2L20 10L12.5 12.5L10 20L4 2Z" fill="#9333ea" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
          <div class="__ripple" style="
            position: absolute;
            top: 2px;
            left: 3px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid #a855f7;
            background: rgba(168, 85, 247, 0.35);
            opacity: 0;
            transform: translate(-16px, -16px) scale(0.2);
            pointer-events: none;
          "></div>
        `;
        document.documentElement.appendChild(cursor);
        window.__antigravityCursorPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      }

      // 4. Calcular coordenadas de destino
      const rect = el.getBoundingClientRect();
      const targetX = Math.round(rect.left + Math.min(rect.width / 2, 70));
      const targetY = Math.round(rect.top + rect.height / 2);

      // 5. Animación de deslizamiento fluido (Glide)
      const prevPos = window.__antigravityCursorPos || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const dist = Math.hypot(targetX - prevPos.x, targetY - prevPos.y);
      const glideDuration = Math.min(Math.max(dist * 0.5, 320), 650);

      cursor.style.transition = `left ${glideDuration}ms cubic-bezier(0.22, 1, 0.36, 1), top ${glideDuration}ms cubic-bezier(0.22, 1, 0.36, 1), transform 0.15s ease`;
      cursor.style.left = `${targetX - 3}px`;
      cursor.style.top = `${targetY - 2}px`;
      window.__antigravityCursorPos = { x: targetX, y: targetY };

      await new Promise(r => setTimeout(r, glideDuration + 40));

      // 6. Efecto de presión física de clic (Press down & Ripple)
      cursor.style.transform = 'scale(0.82) translate(-2px, -2px)';
      const ripple = cursor.querySelector('.__ripple');
      if (ripple) {
        ripple.style.transition = 'none';
        ripple.style.opacity = '1';
        ripple.style.transform = 'translate(-16px, -16px) scale(0.2)';
        requestAnimationFrame(() => {
          ripple.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
          ripple.style.transform = 'translate(-16px, -16px) scale(2.4)';
          ripple.style.opacity = '0';
        });
      }

      await new Promise(r => setTimeout(r, 130));

      // 7. Liberar clic y despachar eventos reales de mouse
      cursor.style.transform = 'scale(1.0)';
      el.focus();

      ['mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
        const evt = new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window
        });
        el.dispatchEvent(evt);
      });

      return {
        clicked: true,
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        text: (el.innerText || el.value || '').slice(0, 100)
      };
    },
    args: [selector || null, textToMatch || null, timeout]
  });

  return results[0]?.result;
}

/**
 * Rellena campos de texto (con auto-wait, scroll suave, cursor virtual animado y compatibilidad React/Vue)
 */
async function typeElement({ tabId, selector, text, clearFirst = true, timeout = 5000 }) {
  if (!tabId || !selector || text === undefined) {
    throw new Error('tabId, selector y text son requeridos');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (sel, val, clear, timeoutMs) => {
      // 1. Auto-wait con polling
      const startTime = Date.now();
      let el = null;

      while (Date.now() - startTime < timeoutMs) {
        el = document.querySelector(sel);
        if (el) break;
        await new Promise(r => setTimeout(r, 60));
      }

      if (!el) {
        throw new Error(`Input no encontrado tras esperar ${timeoutMs}ms: "${sel}"`);
      }

      // 2. Desplazamiento suave si está fuera de pantalla
      const initialRect = el.getBoundingClientRect();
      const inViewport = initialRect.top >= 40 && initialRect.bottom <= (window.innerHeight - 40);
      if (!inViewport) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 450));
      }

      // 3. Crear o mover cursor virtual
      let cursor = document.getElementById('__antigravity_virtual_cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = '__antigravity_virtual_cursor';
        cursor.style.position = 'fixed';
        cursor.style.pointerEvents = 'none';
        cursor.style.zIndex = '2147483647';
        cursor.style.width = '24px';
        cursor.style.height = '24px';
        cursor.style.left = `${window.innerWidth / 2}px`;
        cursor.style.top = `${window.innerHeight / 2}px`;
        cursor.style.transformOrigin = '3px 2px';

        cursor.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 7px rgba(0,0,0,0.5));">
            <path d="M4 2L20 10L12.5 12.5L10 20L4 2Z" fill="#6366f1" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
          <div class="__ripple" style="
            position: absolute;
            top: 2px;
            left: 3px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid #6366f1;
            background: rgba(99, 102, 241, 0.35);
            opacity: 0;
            transform: translate(-16px, -16px) scale(0.2);
            pointer-events: none;
          "></div>
        `;
        document.documentElement.appendChild(cursor);
        window.__antigravityCursorPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      }

      const rect = el.getBoundingClientRect();
      const targetX = Math.round(rect.left + Math.min(rect.width / 4, 30));
      const targetY = Math.round(rect.top + rect.height / 2);

      const prevPos = window.__antigravityCursorPos || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const dist = Math.hypot(targetX - prevPos.x, targetY - prevPos.y);
      const glideDuration = Math.min(Math.max(dist * 0.5, 300), 600);

      cursor.style.transition = `left ${glideDuration}ms cubic-bezier(0.22, 1, 0.36, 1), top ${glideDuration}ms cubic-bezier(0.22, 1, 0.36, 1), transform 0.15s ease`;
      cursor.style.left = `${targetX - 3}px`;
      cursor.style.top = `${targetY - 2}px`;
      window.__antigravityCursorPos = { x: targetX, y: targetY };

      await new Promise(r => setTimeout(r, glideDuration + 30));

      // Destello de foco
      cursor.style.transform = 'scale(0.85) translate(-2px, -2px)';
      const ripple = cursor.querySelector('.__ripple');
      if (ripple) {
        ripple.style.transition = 'none';
        ripple.style.opacity = '1';
        ripple.style.transform = 'translate(-16px, -16px) scale(0.2)';
        requestAnimationFrame(() => {
          ripple.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
          ripple.style.transform = 'translate(-16px, -16px) scale(2.0)';
          ripple.style.opacity = '0';
        });
      }

      await new Promise(r => setTimeout(r, 100));
      cursor.style.transform = 'scale(1.0)';

      el.focus();

      // Compatibilidad con React 16-19: utilizar el descriptor nativo del prototipo
      const nativeSetter =
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

      const finalVal = clear ? val : (el.value || '') + val;

      if (nativeSetter) {
        nativeSetter.call(el, finalVal);
      } else {
        el.value = finalVal;
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));

      return { typed: true, value: el.value, selector: sel };
    },
    args: [selector, text, clearFirst, timeout]
  });

  return results[0]?.result;
}

/**
 * Desplaza suavemente la página (Smooth Scroll) y mueve el cursor virtual acompañando la vista
 */
async function scrollTab({ tabId, y = 450, x = 0, behavior = 'smooth' }) {
  if (!tabId) throw new Error('tabId requerido');

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (deltaY, deltaX, beh) => {
      window.scrollBy({ top: deltaY, left: deltaX, behavior: beh });

      // Acompañar el cursor virtual con el scroll
      const cursor = document.getElementById('__antigravity_virtual_cursor');
      if (cursor && window.__antigravityCursorPos) {
        const newY = Math.min(Math.max(window.__antigravityCursorPos.y + (deltaY > 0 ? 40 : -40), 80), window.innerHeight - 80);
        cursor.style.transition = 'top 0.45s ease-out';
        cursor.style.top = `${newY}px`;
        window.__antigravityCursorPos.y = newY;
      }

      await new Promise(r => setTimeout(r, 450));
      return {
        scrolled: true,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      };
    },
    args: [y, x, behavior]
  });

  return results[0]?.result;
}

/**
 * Sube un archivo a la página web:
 * Modo A (Estático): Si se provee `selector` o existe un <input type="file"> en el DOM, se inyecta directamente.
 * Modo B (Dinámico / Intercepción): Si se especifica `button` (selector o texto) o no hay input estático:
 *   - Intercepta HTMLInputElement.prototype.click para suprimir la ventana modal nativa de Windows (Explorer).
 *   - Localiza y hace clic en el botón disparador (ej. "Add photo/video", "Subir archivo", etc.).
 *   - Al dispararse la llamada a click() del input en memoria, inyecta el archivo vía DataTransfer y dispara eventos 'input' y 'change'.
 *   - Restaura el prototipo original garantizando que no queden efectos secundarios.
 */
async function uploadFile({ tabId, selector = null, button = null, fileName, fileDataBase64, mimeType = 'image/png' }) {
  if (!tabId || !fileName || !fileDataBase64) {
    throw new Error('tabId, fileName y fileDataBase64 requeridos');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (sel, btnQuery, name, b64, mime) => {
      // 1. Convertir Base64 a File
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const file = new File([blob], name, { type: mime, lastModified: Date.now() });

      const assignFilesToInput = (input) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // Si se especificó selector directo o existe input[type="file"] y no se pidió botón explícito
      let staticInput = sel ? document.querySelector(sel) : (!btnQuery ? document.querySelector('input[type="file"]') : null);

      if (staticInput && staticInput.tagName === 'INPUT' && staticInput.type === 'file') {
        assignFilesToInput(staticInput);
        return {
          uploaded: true,
          mode: 'static_input',
          fileName: name,
          fileCount: staticInput.files.length,
          fileSize: file.size
        };
      }

      // Modo Dinámico / Interceptación de Botón
      let targetButton = null;
      if (btnQuery) {
        // Intentar primero como selector CSS
        try {
          targetButton = document.querySelector(btnQuery);
        } catch (_) {}

        // Si no se encontró por selector CSS, buscar por texto o aria-label
        if (!targetButton) {
          const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'));
          targetButton = candidates.find(el => {
            const text = (el.innerText || '').trim().toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
            const q = btnQuery.toLowerCase();
            return (text && text.includes(q)) || (aria && aria.includes(q));
          });
        }
      } else {
        // Auto-detección de botones de subida comunes
        const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        targetButton = candidates.find(el => {
          const text = (el.innerText || '').trim().toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          return /add photo|add video|agregar foto|agregar video|subir|upload media|upload file|seleccionar archivo|adjuntar/i.test(text) ||
                 /add photo|add video|agregar foto|agregar video|subir|upload/i.test(aria);
        });
      }

      if (!targetButton) {
        throw new Error(btnQuery 
          ? `No se encontró el botón de subida especificado: "${btnQuery}"`
          : `No se encontró un <input type="file"> estático ni un botón de subida reconocible en la página.`);
      }

      // Instalar interceptor de click para suprimir la ventana nativa de Windows
      let capturedInput = null;
      const originalClick = HTMLInputElement.prototype.click;

      try {
        HTMLInputElement.prototype.click = function() {
          if (this.type === 'file') {
            capturedInput = this;
            assignFilesToInput(this);
            return; // Suprimir el diálogo nativo de Windows (Explorer Win32)
          }
          return originalClick.apply(this, arguments);
        };

        // Hacer clic en el botón disparador
        targetButton.click();

        // Si el botón requiere un tiempo pequeño para instanciar el input
        if (!capturedInput) {
          await new Promise(r => setTimeout(r, 200));
        }

        if (!capturedInput) {
          // Si el botón no disparó input.click directamente, buscar si se agregó un nuevo input[type="file"] al DOM tras el clic
          const newlyAdded = document.querySelector('input[type="file"]');
          if (newlyAdded) {
            assignFilesToInput(newlyAdded);
            capturedInput = newlyAdded;
          }
        }

        if (!capturedInput) {
          throw new Error('Se hizo clic en el botón de subida, pero no se detectó la creación de ningún input de archivo.');
        }

        return {
          uploaded: true,
          mode: 'dynamic_button_intercepted',
          buttonText: targetButton.innerText?.slice(0, 50) || targetButton.getAttribute('aria-label') || 'Botón de subida',
          fileName: name,
          fileCount: capturedInput.files ? capturedInput.files.length : 1,
          fileSize: file.size
        };
      } finally {
        HTMLInputElement.prototype.click = originalClick;
      }
    },
    args: [selector || null, button || null, fileName, fileDataBase64, mimeType]
  });

  return results[0]?.result;
}

/**
 * Extrae un resumen estructurado del DOM (para que el modelo "entienda" la pantalla)
 */
async function getDOMSummary({ tabId, selector }) {
  if (!tabId) throw new Error('tabId requerido');

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const root = sel ? document.querySelector(sel) : document.body;
      if (!root) throw new Error(`Elemento raíz no encontrado: ${sel}`);

      const buttons = Array.from(root.querySelectorAll('button, [role="button"], input[type="submit"]')).map(b => ({
        tag: b.tagName.toLowerCase(),
        text: (b.innerText || b.value || '').trim(),
        id: b.id || null,
        className: b.className || null,
        disabled: b.disabled || false
      }));

      const inputs = Array.from(root.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(i => ({
        tag: i.tagName.toLowerCase(),
        type: i.type || 'text',
        name: i.name || null,
        id: i.id || null,
        placeholder: i.placeholder || null,
        value: i.type === 'password' ? '***' : (i.value || ''),
        required: i.required || false
      }));

      const headings = Array.from(root.querySelectorAll('h1, h2, h3')).map(h => ({
        level: h.tagName.toLowerCase(),
        text: h.innerText.trim()
      }));

      const links = Array.from(root.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
        text: a.innerText.trim(),
        href: a.getAttribute('href')
      }));

      // Detectar mensajes de error o alertas visibles
      const alerts = Array.from(root.querySelectorAll('.error, .alert, [role="alert"], .text-red-500, .invalid-feedback')).map(e => ({
        text: e.innerText.trim()
      }));

      return {
        title: document.title,
        url: window.location.href,
        headings,
        buttons,
        inputs,
        links,
        alerts,
        innerTextPreview: root.innerText.slice(0, 1000)
      };
    },
    args: [selector || null]
  });

  return results[0]?.result;
}

/**
 * Ejecuta código JavaScript arbitrario en la página (usando CDP Runtime.evaluate para ignorar restricciones CSP)
 */
async function evalJavaScript({ tabId, code }) {
  if (!tabId || !code) throw new Error('tabId y code requeridos');

  const tabInfo = managedTabs.get(tabId);
  if (tabInfo && tabInfo.attachedDebugger) {
    try {
      const response = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: code,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true
      });

      if (response.exceptionDetails) {
        return {
          success: false,
          error: response.exceptionDetails.exception?.description || response.exceptionDetails.text
        };
      }

      return {
        success: true,
        value: response.result?.value !== undefined ? response.result.value : response.result?.description
      };
    } catch (cdpErr) {
      console.warn('[AI Bridge] Fallback a executeScript tras error CDP:', cdpErr.message);
    }
  }

  // Fallback si no está el debugger adjunto
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (jsCode) => {
      try {
        const fn = new Function(`return (${jsCode})`);
        return { success: true, value: fn() };
      } catch (err) {
        return { success: false, error: err.message, stack: err.stack };
      }
    },
    args: [code]
  });

  return results[0]?.result;
}

/**
 * Captura pantalla de la pestaña activa en base64 (vía CDP Page.captureScreenshot)
 */
async function captureScreenshot({ tabId }) {
  if (!tabId) throw new Error('tabId requerido');

  // 1. Intentar capturar directamente por CDP (no requiere que la pestaña esté al frente)
  try {
    const cdpResult = await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', { format: 'png' }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });
    if (cdpResult?.data) {
      return { dataUrl: `data:image/png;base64,${cdpResult.data}`, tabId };
    }
  } catch (cdpErr) {
    console.warn('[AI Bridge] CDP captureScreenshot falló, intentando captureVisibleTab:', cdpErr?.message);
  }

  // 2. Fallback con chrome.tabs.captureVisibleTab
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return { dataUrl, tabId, windowId: tab.windowId };
}

/**
 * Retorna los logs acumulados de la consola
 */
async function getTabLogs({ tabId, clear = false }) {
  if (!tabId) throw new Error('tabId requerido');
  const tabInfo = managedTabs.get(tabId);
  if (!tabInfo) return { logs: [] };

  const logs = [...tabInfo.logs];
  if (clear) tabInfo.logs = [];
  return { logs, tabId, count: logs.length };
}

/**
 * Retorna las peticiones y fallos de red acumulados (status >= 400 o caídas de conexión/CORS)
 */
async function getTabNetworkErrors({ tabId, clear = false }) {
  if (!tabId) throw new Error('tabId requerido');
  const tabInfo = managedTabs.get(tabId);
  if (!tabInfo) return { errors: [] };

  const errors = [...(tabInfo.networkErrors || [])];
  if (clear) tabInfo.networkErrors = [];
  return { errors, tabId, count: errors.length };
}

/**
 * Emula resoluciones de dispositivos móviles, tablets o desktops (Modo Responsivo vía CDP)
 */
async function setViewport({ tabId, width, height, preset = 'mobile', deviceScaleFactor, mobile }) {
  if (!tabId) throw new Error('tabId requerido');

  let w = width;
  let h = height;
  let dsf = deviceScaleFactor || 2;
  let isMobile = mobile !== undefined ? mobile : true;

  if (preset === 'mobile') {
    w = 390; // iPhone 14/15/16 Pro
    h = 844;
    dsf = 3;
    isMobile = true;
  } else if (preset === 'tablet') {
    w = 768; // iPad
    h = 1024;
    dsf = 2;
    isMobile = true;
  } else if (preset === 'desktop') {
    w = 1440;
    h = 900;
    dsf = 1;
    isMobile = false;
  } else if (!w || !h) {
    w = 390;
    h = 844;
  }

  await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: dsf,
    mobile: isMobile
  });

  if (isMobile) {
    await chrome.debugger.sendCommand({ tabId }, 'Emulation.setTouchEmulationEnabled', {
      enabled: true
    });
  }

  return {
    responsive: true,
    preset: preset || 'custom',
    width: w,
    height: h,
    mobile: isMobile,
    deviceScaleFactor: dsf
  };
}

/**
 * Restablece la vista al tamaño natural de la ventana
 */
async function resetViewport({ tabId }) {
  if (!tabId) throw new Error('tabId requerido');
  await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
  await chrome.debugger.sendCommand({ tabId }, 'Emulation.setTouchEmulationEnabled', { enabled: false });
  return { reset: true, tabId };
}

// ---------------------------------------------------------
// Escucha de Eventos CDP (Console logs, Runtime exceptions, Network)
// ---------------------------------------------------------

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  const tabInfo = managedTabs.get(tabId);
  if (!tabInfo) return;

  if (method === 'Runtime.consoleAPICalled') {
    const formattedArgs = (params.args || []).map(arg => {
      if (arg.value !== undefined) return arg.value;
      if (arg.description) return arg.description;
      return JSON.stringify(arg);
    }).join(' ');

    const logEntry = {
      type: 'console',
      level: params.type, // log, error, warning, info, debug
      text: formattedArgs,
      timestamp: Date.now()
    };

    tabInfo.logs.push(logEntry);

    // Enviar en tiempo real al servidor
    sendMessage({
      type: 'tab_log',
      tabId,
      sessionName: tabInfo.sessionName,
      log: logEntry
    });
  } else if (method === 'Runtime.exceptionThrown') {
    const desc = params.exceptionDetails?.exception?.description ||
                 params.exceptionDetails?.text ||
                 'Error desconocido';

    const errorEntry = {
      type: 'exception',
      level: 'error',
      text: desc,
      stack: params.exceptionDetails?.stackTrace,
      timestamp: Date.now()
    };

    tabInfo.logs.push(errorEntry);

    sendMessage({
      type: 'tab_error',
      tabId,
      sessionName: tabInfo.sessionName,
      error: errorEntry
    });
  } else if (method === 'Network.responseReceived') {
    const { response, type } = params;
    // Capturar errores de servidor o cliente (4xx, 5xx)
    if (response && response.status >= 400) {
      const netEntry = {
        type: 'http_error',
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        mimeType: response.mimeType,
        resourceType: type,
        timestamp: Date.now()
      };

      tabInfo.networkErrors = tabInfo.networkErrors || [];
      tabInfo.networkErrors.push(netEntry);

      sendMessage({
        type: 'tab_network_error',
        tabId,
        sessionName: tabInfo.sessionName,
        networkError: netEntry
      });
    }
  } else if (method === 'Network.loadingFailed') {
    const { errorText, canceled, type } = params;
    // Capturar fallos de red (CORS, conexión rechazada, DNS)
    if (!canceled) {
      const netEntry = {
        type: 'connection_failed',
        errorText,
        resourceType: type,
        timestamp: Date.now()
      };

      tabInfo.networkErrors = tabInfo.networkErrors || [];
      tabInfo.networkErrors.push(netEntry);

      sendMessage({
        type: 'tab_network_error',
        tabId,
        sessionName: tabInfo.sessionName,
        networkError: netEntry
      });
    }
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabInfo = managedTabs.get(source.tabId);
  if (tabInfo) {
    tabInfo.attachedDebugger = false;
    console.log(`[AI Bridge] Debugger desconectado del tab #${source.tabId}:`, reason);
  }
});

// Limpieza cuando el usuario cierra una pestaña
chrome.tabs.onRemoved.addListener((tabId) => {
  if (managedTabs.has(tabId)) {
    managedTabs.delete(tabId);
    sendMessage({
      type: 'tab_closed',
      tabId
    });
  }
});

// ---------------------------------------------------------
// Mensajes internos desde el popup
// ---------------------------------------------------------

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'getStatus') {
    sendResponse({
      connected: isConnected,
      serverUrl: currentServerUrl,
      profileId: currentProfileId,
      profileName: currentProfileName,
      tabs: Array.from(managedTabs.values())
    });
  } else if (req.action === 'setServerUrl') {
    currentServerUrl = req.url || DEFAULT_SERVER_URL;
    chrome.storage.local.set({ serverUrl: currentServerUrl });
    if (ws) ws.close();
    connectWebSocket();
    sendResponse({ ok: true, serverUrl: currentServerUrl });
  } else if (req.action === 'setProfileName') {
    const newName = (req.name || '').trim();
    if (newName) {
      currentProfileName = newName;
      chrome.storage.local.set({ profileName: newName }).then(() => {
        sendMessage({
          type: 'register_profile',
          profileId: currentProfileId,
          profileName: currentProfileName,
          timestamp: Date.now(),
          tabs: Array.from(managedTabs.values())
        });
      });
      sendResponse({ ok: true, profileName: newName });
    } else {
      sendResponse({ ok: false, error: 'Nombre de perfil no válido' });
    }
  }
  return false;
});
