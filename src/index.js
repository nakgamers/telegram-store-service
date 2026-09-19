import http from 'node:http';
import { assertRuntime, config } from './config.js';
import { initStore, listProducts, storeSnapshot } from './store.js';

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, service: 'telegram-store-service', store: storeSnapshot() })); }
  res.writeHead(404); res.end('not found');
});

async function main() {
  const requireBot = process.env.RUN_BOT === '1';
  assertRuntime({ requireBot });
  const db = await initStore();
  const products = await listProducts();
  healthServer.listen(config.port, '127.0.0.1', () => console.log(`[health] http://127.0.0.1:${config.port}/health mode=${db.mode} products=${products.length}`));
  if (!requireBot) return;
  const { createBot } = await import('./bot.js');
  const bot = createBot();
  await bot.launch();
  console.log(`[bot] ${config.storeName} polling started`);
  const shutdown = () => { bot.stop('shutdown'); healthServer.close(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}

main().catch((error) => { console.error('[STARTUP ERROR]', error.message); process.exitCode = 1; });
