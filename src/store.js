import crypto from 'node:crypto';
import { config } from './config.js';

const demoProducts = [
  { id: 'demo-api-starter', name: '9Router API Starter 30 Hari', type: 'api_access', price: 15000, description: 'API key 9Router untuk akses model AI, masa aktif entitlement 30 hari.', delivery: 'api_key' },
  { id: 'demo-api-pro', name: '9Router API Pro 30 Hari', type: 'api_access', price: 50000, description: 'API key 9Router Pro, masa aktif entitlement 30 hari.', delivery: 'api_key' },
  { id: 'demo-hotspot', name: 'Paket Setup Hotspot', type: 'service', price: 150000, description: 'Konfigurasi hotspot dan captive portal 9Router.', delivery: 'manual' },
  { id: 'demo-voucher-1d', name: 'Voucher WiFi 1 Hari', type: 'voucher', price: 5000, description: 'Kode akses internet sekolah/rumah selama 1 hari.', delivery: 'code' },
  { id: 'demo-monitoring', name: 'Monitoring Router Bulanan', type: 'subscription', price: 25000, description: 'Monitoring dasar dan laporan status router.', delivery: 'manual' },
];

const memory = { products: [...demoProducts], orders: new Map(), users: new Map() };
let pool = null;
let databaseDriver = null;

function normalizeSql(sql, params) {
  let index = 0;
  return sql.replace(/\$\d+/g, () => { index += 1; return '?'; });
}

async function dbQuery(sql, params = []) {
  if (databaseDriver === 'mysql') {
    const [rows] = await pool.query(normalizeSql(sql), params);
    return { rows: Array.isArray(rows) ? rows : [], rowCount: rows.affectedRows ?? 0 };
  }
  return pool.query(sql, params);
}

export async function initStore() {
  if (!config.databaseUrl && config.databaseDriver !== 'mysql') return { mode: 'demo', products: demoProducts.length };
  if (config.databaseDriver === 'mysql') {
    const mysql = await import('mysql2/promise');
    pool = await mysql.createPool({ host: config.mysqlHost, port: config.mysqlPort, database: config.mysqlDatabase, user: config.mysqlUser, password: config.mysqlPassword, waitForConnections: true, connectionLimit: 5 });
    databaseDriver = 'mysql';
  } else {
    const pg = await import('pg');
    pool = new pg.default.Pool({ connectionString: config.databaseUrl, max: 5, ssl: { rejectUnauthorized: false } });
    databaseDriver = 'postgres';
  }
  const schema = databaseDriver === 'mysql' ? `
    CREATE TABLE IF NOT EXISTS store_products (id VARCHAR(100) PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, price BIGINT NOT NULL, description TEXT NOT NULL, delivery VARCHAR(50) NOT NULL DEFAULT 'manual', active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS store_users (telegram_id BIGINT PRIMARY KEY, username VARCHAR(255), first_name VARCHAR(255), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS store_orders (id VARCHAR(100) PRIMARY KEY, telegram_id BIGINT NOT NULL, product_id VARCHAR(100) NOT NULL, quantity INT NOT NULL, total BIGINT NOT NULL, status VARCHAR(50) NOT NULL, payment_reference VARCHAR(255) UNIQUE, delivery VARCHAR(50) NOT NULL DEFAULT 'manual', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP NOT NULL, paid_at TIMESTAMP NULL, delivered_at TIMESTAMP NULL);
    CREATE TABLE IF NOT EXISTS store_entitlements (id VARCHAR(100) PRIMARY KEY, order_id VARCHAR(100) NOT NULL UNIQUE, telegram_id BIGINT NOT NULL, product_id VARCHAR(100) NOT NULL, api_key_id VARCHAR(255) NOT NULL, api_key_ciphertext TEXT NOT NULL, starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'active', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TIMESTAMP NULL);
  ` : `
    CREATE TABLE IF NOT EXISTS store_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, price BIGINT NOT NULL, description TEXT NOT NULL DEFAULT '', delivery TEXT NOT NULL DEFAULT 'manual', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS store_users (telegram_id BIGINT PRIMARY KEY, username TEXT, first_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS store_orders (id TEXT PRIMARY KEY, telegram_id BIGINT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, total BIGINT NOT NULL, status TEXT NOT NULL, payment_reference TEXT UNIQUE, delivery TEXT NOT NULL DEFAULT 'manual', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, paid_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS store_entitlements (id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES store_orders(id), telegram_id BIGINT NOT NULL, product_id TEXT NOT NULL, api_key_id TEXT NOT NULL, api_key_ciphertext TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ);
  `;
  for (const statement of schema.split(';').map((x) => x.trim()).filter(Boolean)) await dbQuery(statement);
  for (const product of demoProducts) {
    const insert = databaseDriver === 'mysql'
      ? 'INSERT IGNORE INTO store_products (id,name,type,price,description,delivery) VALUES (?,?,?,?,?,?)'
      : 'INSERT INTO store_products (id,name,type,price,description,delivery) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING';
    await dbQuery(insert, [product.id, product.name, product.type, product.price, product.description, product.delivery]);
  }
  return { mode: databaseDriver, products: demoProducts.length };
}

export async function listProducts() {
  if (!pool) return memory.products.filter((p) => p.active !== false);
  const { rows } = await dbQuery('SELECT id,name,type,price,description,delivery FROM store_products WHERE active = TRUE ORDER BY name');
  return rows;
}

export async function upsertUser(user) {
  if (!pool) { memory.users.set(String(user.telegramId), user); return user; }
  const sql = databaseDriver === 'mysql'
    ? 'INSERT INTO store_users (telegram_id,username,first_name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE username=VALUES(username), first_name=VALUES(first_name)'
    : `INSERT INTO store_users (telegram_id,username,first_name) VALUES ($1,$2,$3) ON CONFLICT (telegram_id) DO UPDATE SET username=EXCLUDED.username, first_name=EXCLUDED.first_name`;
  await dbQuery(sql, [user.telegramId, user.username || null, user.firstName || null]);
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
  await dbQuery(`INSERT INTO store_orders (id,telegram_id,product_id,quantity,total,status,delivery,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, order.telegramId, order.productId, quantity, total, order.status, order.delivery, expiresAt]);
  return order;
}

export async function updateOrderPayment(orderId, paymentReference) {
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order tidak ditemukan.');
  if (!pool) { order.paymentReference = paymentReference; memory.orders.set(orderId, order); return order; }
  await dbQuery('UPDATE store_orders SET payment_reference=$1 WHERE id=$2', [paymentReference, orderId]);
  return getOrder(orderId);
}

export async function getOrder(orderId) {
  if (!pool) return memory.orders.get(orderId) || null;
  const { rows } = await dbQuery('SELECT id,telegram_id AS "telegramId",product_id AS "productId",quantity,total,status,delivery,expires_at AS "expiresAt",payment_reference AS "paymentReference",paid_at AS "paidAt",delivered_at AS "deliveredAt" FROM store_orders WHERE id=$1', [orderId]);
  return rows[0] || null;
}

export async function markPaid(orderId) {
  const order = await getOrder(orderId);
  if (!order || !['pending_payment', 'paid'].includes(order.status)) return order;
  if (!pool) { order.status = 'paid'; order.paidAt = new Date().toISOString(); memory.orders.set(orderId, order); return order; }
  await dbQuery(`UPDATE store_orders SET status='paid', paid_at=COALESCE(paid_at,NOW()) WHERE id=$1 AND status='pending_payment'`, [orderId]);
  return getOrder(orderId);
}

export async function markDelivered(orderId) {
  if (!pool) { const order = memory.orders.get(orderId); if (order) { order.status = 'completed'; order.deliveredAt = new Date().toISOString(); memory.orders.set(orderId, order); } return getOrder(orderId); }
  await dbQuery(`UPDATE store_orders SET status='completed', delivered_at=COALESCE(delivered_at,NOW()) WHERE id=$1 AND status='paid'`, [orderId]);
  return getOrder(orderId);
}

export function storeSnapshot() { return { mode: pool ? databaseDriver : 'demo', products: memory.products.length, orders: memory.orders.size }; }
