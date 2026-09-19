import 'dotenv/config';

const csv = (value) => String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
const positiveInt = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const config = Object.freeze({
  botToken: String(process.env.BOT_TOKEN || '').trim(),
  adminIds: new Set(csv(process.env.ADMIN_TELEGRAM_IDS).map(Number).filter(Number.isInteger)),
  storeName: process.env.STORE_NAME || '9Router Store',
  description: process.env.STORE_DESCRIPTION || 'Produk dan layanan jaringan',
  databaseUrl: String(process.env.DATABASE_URL || '').trim(),
  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
  paymentApiKey: String(process.env.PAYMENT_API_KEY || '').trim(),
  paymentBaseUrl: (process.env.PAYMENT_BASE_URL || 'https://ramashop.my.id/api/public').replace(/\/$/, ''),
  port: positiveInt(process.env.PORT, 8788),
  expiryMinutes: positiveInt(process.env.ORDER_EXPIRY_MINUTES, 15),
  currency: process.env.CURRENCY || 'IDR',
  nineRouterBaseUrl: (process.env.NINE_ROUTER_BASE_URL || '').replace(/\/$/, ''),
  nineRouterPassword: String(process.env.NINE_ROUTER_PASSWORD || '').trim(),
});

export function assertRuntime({ requireBot = false } = {}) {
  if (requireBot && !config.botToken) throw new Error('BOT_TOKEN kosong; set .env sebelum menjalankan bot.');
  if (requireBot && config.adminIds.size === 0) throw new Error('ADMIN_TELEGRAM_IDS kosong; service menolak start tanpa allowlist admin.');
}
