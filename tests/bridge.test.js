import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';

const execAsync = promisify(exec);

const BASE_URL = 'http://localhost:9224';
const WS_URL = 'ws://localhost:9224/ws';

test('1. HTTP API /status responde correctamente', async () => {
  const res = await fetch(`${BASE_URL}/status`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.port, 9224);
  assert.equal(typeof data.extensionConnected, 'boolean');
  assert.equal(typeof data.tabsCount, 'number');
});

test('2. Endpoints /logs y /network responden con JSON válido', async () => {
  const mockTabId = 987654;

  const logsRes = await fetch(`${BASE_URL}/logs/${mockTabId}`);
  assert.equal(logsRes.status, 200);
  const logsData = await logsRes.json();
  assert.equal(logsData.ok, true);
  assert.equal(logsData.tabId, mockTabId);
  assert.ok(Array.isArray(logsData.logs));

  const netRes = await fetch(`${BASE_URL}/network/${mockTabId}`);
  assert.equal(netRes.status, 200);
  const netData = await netRes.json();
  assert.equal(netData.ok, true);
  assert.equal(netData.tabId, mockTabId);
  assert.ok(Array.isArray(netData.networkErrors));
});

test('3. CLI status ejecuta sin errores y devuelve salida esperada', () => {
  const output = execSync('node server/cli.js status', { encoding: 'utf-8' });
  assert.match(output, /--- ESTADO DE CHROME BRIDGE ---/);
  assert.match(output, /Servidor activo:\s+Puerto 9224/);
});

test('4. Protocolo WebSocket y procesamiento bidireccional de eventos de red', async () => {
  // Conectar un cliente WebSocket simulado para probar el canal
  const testWs = new WebSocket(WS_URL);

  await new Promise((resolve, reject) => {
    testWs.on('open', resolve);
    testWs.on('error', reject);
  });

  const testTabId = 888123;

  // Enviar un evento de error de red simulado
  testWs.send(JSON.stringify({
    type: 'tab_network_error',
    tabId: testTabId,
    sessionName: 'test_session',
    networkError: {
      type: 'http_error',
      status: 500,
      statusText: 'Internal Server Error',
      url: 'http://localhost:3000/api/test-failure',
      resourceType: 'fetch',
      timestamp: Date.now()
    }
  }));

  // Esperar 150ms a que el servidor procese el mensaje
  await new Promise(r => setTimeout(r, 150));

  // Verificar que el endpoint /network reporta el error recibido
  const netRes = await fetch(`${BASE_URL}/network/${testTabId}`);
  const netData = await netRes.json();
  assert.equal(netData.count, 1);
  assert.equal(netData.networkErrors[0].status, 500);
  assert.equal(netData.networkErrors[0].url, 'http://localhost:3000/api/test-failure');

  // Verificar que el CLI network lee el error correctamente
  const cliOutput = execSync(`node server/cli.js network --tab ${testTabId}`, { encoding: 'utf-8' });
  assert.match(cliOutput, /HTTP 500 Internal Server Error/);
  assert.match(cliOutput, /api\/test-failure/);

  // Cerrar tab simulada
  testWs.send(JSON.stringify({
    type: 'tab_closed',
    tabId: testTabId
  }));

  await new Promise(r => setTimeout(r, 100));

  // Verificar que el tab se limpió tras cerrar
  const cleanRes = await fetch(`${BASE_URL}/network/${testTabId}`);
  const cleanData = await cleanRes.json();
  assert.equal(cleanData.count, 0);

  testWs.close();
});

test('5. Envío de acción scroll a través del WebSocket simulado', async () => {
  const testWs = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    testWs.on('open', resolve);
    testWs.on('error', reject);
  });

  testWs.send(JSON.stringify({
    type: 'register_profile',
    profileId: 'test_scroll_prof',
    profileName: 'Scroll Test Client',
    tabs: [{ tabId: 1234 }]
  }));

  await new Promise(r => setTimeout(r, 100));

  // Escuchar mensaje del servidor y responder éxito simulado
  testWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.action === 'scroll') {
      testWs.send(JSON.stringify({
        id: msg.id,
        success: true,
        result: { scrolled: true, scrollX: 0, scrollY: 450 }
      }));
    }
  });

  const res = await fetch(`${BASE_URL}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'scroll',
      params: { tabId: 1234, y: 450 }
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.result.scrolled, true);
  assert.equal(data.result.scrollY, 450);

  testWs.close();
});

test('6. Soporte Multi-Perfil: Registro concurrente y enrutamiento por perfil y tabId', async () => {
  // Simular dos perfiles de Chrome distintos conectándose concurrentemente
  const profileWs1 = new WebSocket(WS_URL);
  const profileWs2 = new WebSocket(WS_URL);

  await Promise.all([
    new Promise(r => profileWs1.on('open', r)),
    new Promise(r => profileWs2.on('open', r))
  ]);

  // Perfil 1: Personal
  profileWs1.send(JSON.stringify({
    type: 'register_profile',
    profileId: 'prof_personal_test',
    profileName: 'Personal (personal@test.cl)',
    tabs: [
      { tabId: 101, url: 'https://gmail.com', groupTitle: '🤖 Antigravity AI' },
      { tabId: 102, url: 'https://github.com', groupTitle: '🤖 Antigravity AI' }
    ]
  }));

  // Perfil 2: Trabajo
  profileWs2.send(JSON.stringify({
    type: 'register_profile',
    profileId: 'prof_trabajo_test',
    profileName: 'Trabajo (trabajo@test.cl)',
    tabs: [
      { tabId: 201, url: 'https://jira.com', groupTitle: '🤖 Antigravity AI' }
    ]
  }));

  await new Promise(r => setTimeout(r, 200));

  // Verificar /profiles endpoint
  const profRes = await fetch(`${BASE_URL}/profiles`);
  assert.equal(profRes.status, 200);
  const profData = await profRes.json();
  assert.equal(profData.ok, true);
  assert.ok(profData.profiles.some(p => p.id === 'prof_personal_test'));
  assert.ok(profData.profiles.some(p => p.id === 'prof_trabajo_test'));

  // Verificar que el CLI profiles lista ambos perfiles
  const cliProfilesOutput = execSync('node server/cli.js profiles', { encoding: 'utf-8' });
  assert.match(cliProfilesOutput, /Personal \(personal@test\.cl\)/);
  assert.match(cliProfilesOutput, /Trabajo \(trabajo@test\.cl\)/);

  // Escuchar acciones dirigidas a cada perfil
  let profile1ReceivedAction = false;
  let profile2ReceivedAction = false;

  profileWs1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.action === 'eval_js') {
      profile1ReceivedAction = true;
      profileWs1.send(JSON.stringify({ id: msg.id, success: true, result: { value: 'from_profile_1' } }));
    }
  });

  profileWs2.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.action === 'eval_js') {
      profile2ReceivedAction = true;
      profileWs2.send(JSON.stringify({ id: msg.id, success: true, result: { value: 'from_profile_2' } }));
    }
  });

  // 1. Enrutar explícitamente al Perfil 2 usando `profile`
  const actionRes2 = await fetch(`${BASE_URL}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'eval_js',
      profile: 'prof_trabajo_test',
      params: { code: 'document.title' }
    })
  });
  const actionData2 = await actionRes2.json();
  assert.equal(actionData2.ok, true);
  assert.equal(actionData2.result.value, 'from_profile_2');
  assert.equal(profile2ReceivedAction, true);

  // 2. Enrutar automáticamente al Perfil 1 usando el tabId mapeado (tabId 101 pertenece a Perfil 1)
  const actionRes1 = await fetch(`${BASE_URL}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'eval_js',
      params: { tabId: 101, code: 'document.title' }
    })
  });
  const actionData1 = await actionRes1.json();
  assert.equal(actionData1.ok, true);
  assert.equal(actionData1.result.value, 'from_profile_1');
  assert.equal(profile1ReceivedAction, true);

  profileWs1.close();
  profileWs2.close();
});

test('7. Nombre contextual de tarea/idea en pestaña (set_task)', async () => {
  const taskWs = new WebSocket(WS_URL);
  await new Promise(r => taskWs.on('open', r));

  const testTabId = 999123;
  taskWs.send(JSON.stringify({
    type: 'register_profile',
    profileId: 'prof_task_test',
    profileName: 'Task Test Client',
    tabs: [{ tabId: testTabId, url: 'https://example.com' }]
  }));

  await new Promise(r => setTimeout(r, 100));

  // Escuchar mensaje 'set_task'
  taskWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.action === 'set_task') {
      taskWs.send(JSON.stringify({
        id: msg.id,
        success: true,
        result: {
          success: true,
          tabId: testTabId,
          task: msg.params.task,
          groupTitle: `🤖 ${msg.params.task}`
        }
      }));
    }
  });

  const res = await fetch(`${BASE_URL}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'set_task',
      params: { tabId: testTabId, task: 'Publicar post en Instagram' }
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.result.task, 'Publicar post en Instagram');
  assert.equal(data.result.groupTitle, '🤖 Publicar post en Instagram');

  // Probar CLI task command
  const { stdout: cliOutput } = await execAsync(`node server/cli.js task --tab ${testTabId} --name "Configurar AdMob app-ads"`);
  assert.match(cliOutput, /Configurar AdMob app-ads/);

  taskWs.close();
});

test('8. Subida de archivos híbrida (estática y botón dinámico con supresión de diálogo Windows)', async () => {
  const uploadWs = new WebSocket(WS_URL);
  await new Promise(r => uploadWs.on('open', r));

  const testTabId = 777123;
  uploadWs.send(JSON.stringify({
    type: 'register_profile',
    profileId: 'prof_upload_test',
    profileName: 'Upload Test Client',
    tabs: [{ tabId: testTabId, url: 'https://example.com/composer' }]
  }));

  await new Promise(r => setTimeout(r, 100));

  uploadWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.action === 'upload_file') {
      const { button, selector, fileName } = msg.params;
      const isDynamic = Boolean(button || (!selector && !button));
      uploadWs.send(JSON.stringify({
        id: msg.id,
        success: true,
        result: {
          uploaded: true,
          mode: isDynamic ? 'dynamic_button_intercepted' : 'static_input',
          buttonText: button || 'Add photo/video',
          fileName,
          fileCount: 1,
          fileSize: 1024
        }
      }));
    }
  });

  // Probar subida dinámica con botón
  const resDynamic = await fetch(`${BASE_URL}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload_file',
      params: {
        tabId: testTabId,
        button: 'Add photo/video',
        fileName: 'test-image.png',
        fileDataBase64: Buffer.from('fake image data').toString('base64'),
        mimeType: 'image/png'
      }
    })
  });

  assert.equal(resDynamic.status, 200);
  const dataDynamic = await resDynamic.json();
  assert.equal(dataDynamic.ok, true);
  assert.equal(dataDynamic.result.mode, 'dynamic_button_intercepted');
  assert.equal(dataDynamic.result.buttonText, 'Add photo/video');

  // Probar CLI upload con botón
  const { stdout: cliOutput } = await execAsync(`node server/cli.js upload --tab ${testTabId} --file "package.json" --button "Add photo/video" --profile "Upload Test Client"`);
  assert.match(cliOutput, /Archivo cargado con éxito/);
  assert.match(cliOutput, /Intercepción dinámica/);
  assert.match(cliOutput, /Ventana modal nativa de Windows suprimida/);

  uploadWs.close();
});

test('9. Auto-Wait (wait_for): Espera activa de elementos en DOM y Shadow DOM', async () => {
  const waitWs = new WebSocket(WS_URL);
  const testTabId = 444111;

  await new Promise(resolve => waitWs.on('open', resolve));

  // Registrar cliente de prueba con su pestaña
  waitWs.send(JSON.stringify({
    type: 'register_profile',
    profileId: 'prof_wait_test',
    profileName: 'Wait Test Client',
    tabs: [{ tabId: testTabId, url: 'https://example.com/wait-test' }]
  }));

  await new Promise(r => setTimeout(r, 100));

  waitWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.action === 'wait_for') {
      const { textToMatch } = msg.params;
      waitWs.send(JSON.stringify({
        id: msg.id,
        success: true,
        result: {
          found: true,
          tagName: 'BUTTON',
          id: 'confirm-modal-btn',
          className: 'btn-primary',
          text: textToMatch || 'Confirmar',
          visible: true
        }
      }));
    }
  });

  try {
    // Probar endpoint HTTP /action wait_for
    const res = await fetch(`${BASE_URL}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'wait_for',
        params: {
          tabId: testTabId,
          selector: '#confirm-modal-btn',
          timeout: 3000
        }
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.result.found, true);
    assert.equal(data.result.tagName, 'BUTTON');

    // Probar CLI wait
    const { stdout: cliOut } = await execAsync(`node server/cli.js wait --tab ${testTabId} --selector "#confirm-modal-btn" --profile "Wait Test Client"`);
    assert.match(cliOut, /Elemento detectado con éxito/);
    assert.match(cliOut, /confirm-modal-btn/);
  } finally {
    waitWs.close();
  }
});



