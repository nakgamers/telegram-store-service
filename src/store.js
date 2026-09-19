import crypto from 'node:crypto';
import { config } from './config.js';

const demoProducts = [
  { id: 'demo-hotspot', name: 'Paket Setup Hotspot', type: 'service', price: 150000, description: 'Konfigurasi hotspot dan captive portal 9Router.', delivery: 'manual' },
  { id: 'demo-voucher-1d', name: 'Voucher WiFi 1 Hari', type: 'voucher', price: 5000, description: 'Kode akses internet sekolah/rumah selama 1 hari.', delivery: 'code' },
  { id: 'demo-monitoring', name: 'Monitoring Router Bulanan', type: 'subscription', price: 25000, description: 'Monitoring dasar dan laporan status router.', delivery: 'manual' },
];

const memory = { products: [...demoProducts], orders: new Map(), users: new Map() };
let pool = null;

export async function initStore() {
  if (!config.databaseUrl) return { mode: 'demo', products: demoProducts.length };
  const pg = await import('pg');
  pool = new pg.default.Pool({ connectionString: config.databaseUrl, max: 5, ssl: { rejectUnauthorized: false } });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, price BIGINT NOT NULL,
      description TEXT NOT NULL DEFAULT '', delivery TEXT NOT NULL DEFAULT 'manual', active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS store_users (
      telegram_id BIGINT PRIMARY KEY, username TEXT, first_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS store_orders (
      id TEXT PRIMARY KEY, telegram_id BIGINT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL,
      total BIGINT NOT NULL, status TEXT NOT NULL, payment_reference TEXT UNIQUE, delivery TEXT NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, paid_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ
    );
  `);
  for (const product of demoProducts) {
    await pool.query(`INSERT INTO store_products (id,name,type,price,description,delivery) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [product.id, product.name, product.type, product.price, product.description, product.delivery]);
  }
  return { mode: 'postgres', products: demoProducts.length };
}

export async function listProducts() {
  if (!pool) return memory.products.filter((p) => p.active !== false);
  const { rows } = await pool.query('SELECT id,name,type,price,description,delivery FROM store_products WHERE active = TRUE ORDER BY name');
  return rows;
}

export async function upsertUser(user) {
  if (!pool) { memory.users.set(String(user.telegramId), user); return user; }
  await pool.query(`INSERT INTO store_users (telegram_id,username,first_name) VALUES ($1,$2,$3) ON CONFLICT (telegram_id) DO UPDATE SET username=EXCLUDED.username, first_name=EXCLUDED.first_name`, [user.telegramId, user.username || null, user.firstName || null]);
  return user;
}

export async function createOrder({ telegramId, productId, quantity = 1 }) {
  const products = await listProducts();
  const product = products.find((p) => String(p.id) === String(productId));
  if (!product) throw new Error('Produk tidak ditemukan.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Jumlah produk tidak valid.');
  const id = `NR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const total = Number(product.price) * quantity;
  const expiresAt = new Date(Date.now() + config.expiryMinutes * 60_000);
  const order = { id, telegramId: Number(telegramId), productId: product.id, productName: product.name, quantity, total, status: 'pending_payment', delivery: product.delivery, expiresAt: expiresAt.toISOString() };
  if (!pool) { memory.orders.set(id, order); return order; }
  await pool.query(`INSERT INTO store_orders (id,telegram_id,product_id,quantity,total,status,delivery,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, order.telegramId, order.productId, quantity, total, order.status, order.delivery, expiresAt]);
  return order;
}

export async function updateOrderPayment(orderId, paymentReference) {
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order tidak ditemukan.');
  if (!pool) { order.paymentReference = paymentReference; memory.orders.set(orderId, order); return order; }
  await pool.query('UPDATE store_orders SET payment_reference=$1 WHERE id=$2', [paymentReference, orderId]);
  return getOrder(orderId);
}

export async function getOrder(orderId) {
  if (!pool) return memory.orders.get(orderId) || null;
  const { rows } = await pool.query('SELECT id,telegram_id AS "telegramId",product_id AS "productId",quantity,total,status,delivery,expires_at AS "expiresAt",payment_reference AS "paymentReference",paid_at AS "paidAt",delivered_at AS "deliveredAt" FROM store_orders WHERE id=$1', [orderId]);
  return rows[0] || null;
}

export async function markPaid(orderId) {
  const order = await getOrder(orderId);
  if (!order || !['pending_payment', 'paid'].includes(order.status)) return order;
  if (!pool) { order.status = 'paid'; order.paidAt = new Date().toISOString(); memory.orders.set(orderId, order); return order; }
  await pool.query(`UPDATE store_orders SET status='paid', paid_at=COALESCE(paid_at,NOW()) WHERE id=$1 AND status='pending_payment'`, [orderId]);
  return getOrder(orderId);
}

export async function markDelivered(orderId) {
  if (!pool) { const order = memory.orders.get(orderId); if (order) { order.status = 'completed'; order.deliveredAt = new Date().toISOString(); memory.orders.set(orderId, order); } return getOrder(orderId); }
  await pool.query(`UPDATE store_orders SET status='completed', delivered_at=COALESCE(delivered_at,NOW()) WHERE id=$1 AND status='paid'`, [orderId]);
  return getOrder(orderId);
}

export function storeSnapshot() { return { mode: pool ? 'postgres' : 'demo', products: memory.products.length, orders: memory.orders.size }; }
