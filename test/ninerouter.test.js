import test from 'node:test';
import assert from 'node:assert/strict';
import { createNineRouterAdapter } from '../src/ninerouter.js';
import { createEntitlementService, decryptSecret, encryptSecret } from '../src/entitlements.js';

process.env.NINE_ROUTER_BASE_URL = 'https://router.test';
process.env.NINE_ROUTER_PASSWORD = 'test-password';
process.env.ENTITLEMENT_ENCRYPTION_KEY = 'test-encryption-key';

function fakeFetch(url, options) {
  const path = new URL(url).pathname;
  if (path === '/api/auth/login') return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'set-cookie': 'auth_token=test; Path=/' } }));
  if (path === '/api/keys' && options.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 'key-1', key: 'sk-test-key', name: JSON.parse(options.body).name }), { status: 201 }));
  if (path === '/api/keys/key-1' && options.method === 'PUT') return Promise.resolve(new Response(JSON.stringify({ key: { id: 'key-1', isActive: false } }), { status: 200 }));
  return Promise.resolve(new Response(JSON.stringify({ error: 'not found' }), { status: 404 }));
}

test('9Router adapter creates and disables an API key', async () => {
  const router = createNineRouterAdapter({ baseUrl: 'https://router.test', password: 'test-password', fetchImpl: fakeFetch });
  const key = await router.createKey('telegram-order-1');
  assert.equal(key.id, 'key-1');
  assert.equal(key.key, 'sk-test-key');
  const disabled = await router.disableKey('key-1');
  assert.equal(disabled.key.isActive, false);
});

test('entitlement provisioning is idempotent and encrypts key', async () => {
  let calls = 0;
  const router = { createKey: async () => { calls++; return { id: 'key-1', key: 'sk-test-key' }; }, disableKey: async () => {} };
  const service = createEntitlementService({ router, clock: () => new Date('2026-01-01T00:00:00Z') });
  const order = { id: 'order-1', telegramId: 123, productId: 'demo-api-starter', delivery: 'api_key' };
  const one = await service.provision(order);
  const two = await service.provision(order);
  assert.equal(calls, 1);
  assert.equal(one.apiKey, 'sk-test-key');
  assert.equal(decryptSecret(one.apiKeyCiphertext), 'sk-test-key');
  assert.equal(two.id, one.id);
});
