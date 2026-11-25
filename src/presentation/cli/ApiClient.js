export class ApiClient {
  constructor(baseUrl = process.env.BRIDGE_URL || 'http://localhost:9224') {
    this.baseUrl = baseUrl;
  }

  async callApi(endpoint, method = 'GET', data = null) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (data) options.body = JSON.stringify(data);

      const res = await fetch(`${this.baseUrl}${endpoint}`, options);
      const json = await res.json();
      return json;
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        console.error(`❌ Error: No se puede conectar al servidor en ${this.baseUrl}.`);
        console.error(`   Asegúrate de ejecutar primero: pnpm start`);
      } else {
        console.error(`❌ Error de conexión:`, err.message);
      }
      process.exit(1);
    }
  }

  async runAction(action, params = {}, profile = null) {
    const res = await this.callApi('/action', 'POST', { action, params, profile });
    if (!res.ok) {
      console.error(`❌ Error ejecutando "${action}":`, res.error);
      process.exit(1);
    }
    return res.result;
  }
}
