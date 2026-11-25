import { Container } from '../src/infrastructure/container/Container.js';
import { HttpServer } from '../src/infrastructure/http/HttpServer.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9224;

const container = new Container();
const app = new HttpServer(container, PORT);

await app.listen();

console.log(`=======================================================`);
console.log(`🤖 Antigravity Chrome Bridge Server (SOLID Architecture)`);
console.log(`📡 HTTP API:    http://localhost:${PORT}`);
console.log(`🔌 WebSocket:   ws://localhost:${PORT}/ws`);
console.log(`📸 Screenshots: ${container.screenshotsDir}`);
console.log(`=======================================================`);
