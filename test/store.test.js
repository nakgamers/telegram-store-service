import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TELEGRAM_IDS = '123';
process.env.PAYMENT_PROVIDER = 'mock';

const store = await import('../src/store.js');
const payment = await import('../src/payment.js');


test('demo catalog is available without database credentials', async () => {
  const products = await store.listProducts();
  assert.ok(products.length >= 3);
  assert.ok(products.every((p) => p.type === 'api_access'));
});

test('order payment delivery lifecycle is idempotent enough for demo', async () => {
  const product = (await store.listProducts())[0];
  const order = await store.createOrder({ telegramId: 123, productId: product.id, quantity: 1 });
  assert.equal(order.status, 'pending_payment');
  const invoice = await payment.createPayment({ orderId: order.id, amount: order.total });
  assert.equal(invoice.status, 'pending');
  await store.updateOrderPayment(order.id, invoice.reference);
  const paid = await store.markPaid(order.id);
  assert.equal(paid.status, 'paid');
  const done = await store.markDelivered(order.id);
  assert.equal(done.status, 'completed');
  assert.equal((await store.getOrder(order.id)).status, 'completed');
});
