const statusBadge = document.getElementById('statusBadge');
const serverUrlInput = document.getElementById('serverUrl');
const profileNameInput = document.getElementById('profileName');
const btnSaveProfile = document.getElementById('btnSaveProfile');
const profileHint = document.getElementById('profileHint');
const btnReconnect = document.getElementById('btnReconnect');
const btnRefresh = document.getElementById('btnRefresh');
const tabsList = document.getElementById('tabsList');

let isProfileInputFocused = false;
profileNameInput.addEventListener('focus', () => { isProfileInputFocused = true; });
profileNameInput.addEventListener('blur', () => { isProfileInputFocused = false; });

async function updateState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (!response) return;

    if (response.connected) {
      statusBadge.textContent = 'Conectado';
      statusBadge.className = 'badge connected';
    } else {
      statusBadge.textContent = 'Desconectado';
      statusBadge.className = 'badge disconnected';
    }

    if (response.serverUrl) {
      serverUrlInput.value = response.serverUrl;
    }

    if (response.profileName && !isProfileInputFocused) {
      profileNameInput.value = response.profileName;
    }

    if (response.profileId) {
      profileHint.textContent = `ID de Perfil: ${response.profileId}`;
    }

    renderTabs(response.tabs || []);
  } catch (err) {
    statusBadge.textContent = 'Error';
    statusBadge.className = 'badge disconnected';
    console.error('Error getting status:', err);
  }
}

function renderTabs(tabs) {
  if (!tabs || tabs.length === 0) {
    tabsList.innerHTML = '<div class="empty-state">No hay pestañas bajo depuración actualmente.</div>';
    return;
  }

  tabsList.innerHTML = '';
  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';
    if (tab.groupColor) {
      item.style.borderLeftColor = tab.groupColor;
    }

    const header = document.createElement('div');
    header.className = 'tab-header';
    const titleText = tab.task ? `🎯 ${tab.task}` : (tab.groupTitle || tab.sessionName || 'Pestaña #' + tab.tabId);
    header.innerHTML = `<span>${titleText}</span>
                        <span>#${tab.tabId} ${tab.incognito ? '(Incógnito)' : ''}</span>`;

    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = tab.url || '(Sin URL)';

    item.appendChild(header);
    item.appendChild(url);
    tabsList.appendChild(item);
  });
}

btnSaveProfile.addEventListener('click', async () => {
  const name = profileNameInput.value.trim();
  if (!name) return;

  btnSaveProfile.disabled = true;
  const originalText = btnSaveProfile.textContent;
  btnSaveProfile.textContent = 'Guardando...';

  try {
    await chrome.runtime.sendMessage({ action: 'setProfileName', name });
    btnSaveProfile.textContent = '¡Guardado!';
    setTimeout(() => {
      btnSaveProfile.textContent = originalText;
      btnSaveProfile.disabled = false;
    }, 1200);
  } catch (err) {
    console.error('Error guardando nombre de perfil:', err);
    btnSaveProfile.disabled = false;
    btnSaveProfile.textContent = originalText;
  }
});

btnReconnect.addEventListener('click', async () => {
  const url = serverUrlInput.value.trim();
  btnReconnect.disabled = true;
  btnReconnect.textContent = 'Conectando...';

  try {
    await chrome.runtime.sendMessage({ action: 'setServerUrl', url });
    await updateState();
  } catch (err) {
    console.error(err);
  } finally {
    btnReconnect.disabled = false;
    btnReconnect.textContent = 'Conectar';
  }
});

btnRefresh.addEventListener('click', () => {
  updateState();
});

// Update periodically when popup is open
updateState();
const timer = setInterval(updateState, 2000);
window.addEventListener('unload', () => clearInterval(timer));
