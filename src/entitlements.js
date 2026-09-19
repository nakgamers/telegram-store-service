import crypto from 'node:crypto';

const algorithm = 'aes-256-gcm';

function encryptionKey() {
  const raw = process.env.ENTITLEMENT_ENCRYPTION_KEY || '';
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(value) {
  const key = encryptionKey();
  if (!key) return `plain:${value}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value) {
  if (value.startsWith('plain:')) return value.slice(6);
  const key = encryptionKey();
  if (!key || !value.startsWith('v1:')) throw new Error('ENTITLEMENT_ENCRYPTION_KEY belum tersedia.');
  const [, iv, tag, encrypted] = value.split(':');
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function createEntitlementService({ router, database = null, clock = () => new Date() } = {}) {
  const demo = new Map();
  return {
    async provision(order) {
      if (database) {
        const existing = await database.query('SELECT * FROM store_entitlements WHERE order_id=$1', [order.id]);
        if (existing.rows[0]) return existing.rows[0];
      } else if (demo.has(order.id)) return demo.get(order.id);
      const expires = new Date(clock().getTime() + Number(order.durationDays || 1) * 24 * 60 * 60 * 1000);
      const key = await router.createKey(`telegram-${order.id}`);
      const entitlement = { id: crypto.randomUUID(), orderId: order.id, telegramId: order.telegramId, productId: order.productId, apiKeyId: key.id, apiKeyCiphertext: encryptSecret(key.key), startsAt: clock().toISOString(), expiresAt: expires.toISOString(), status: 'active', apiKey: key.key };
      if (database) {
        await database.query(`INSERT INTO store_entitlements (id,order_id,telegram_id,product_id,api_key_id,api_key_ciphertext,starts_at,expires_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active')`, [entitlement.id, entitlement.orderId, entitlement.telegramId, entitlement.productId, entitlement.apiKeyId, entitlement.apiKeyCiphertext, entitlement.startsAt, entitlement.expiresAt]);
      } else demo.set(order.id, entitlement);
      return entitlement;
    },
    async revokeExpired() {
      const now = clock();
      const candidates = database ? (await database.query(`SELECT * FROM store_entitlements WHERE status='active' AND expires_at <= NOW()`)).rows : [...demo.values()].filter((x) => x.status === 'active' && new Date(x.expiresAt) <= now);
      let revoked = 0;
      for (const item of candidates) {
        await router.disableKey(item.api_key_id || item.apiKeyId);
        if (database) await database.query(`UPDATE store_entitlements SET status='expired', revoked_at=NOW() WHERE id=$1 AND status='active'`, [item.id]);
        else { item.status = 'expired'; item.revokedAt = now.toISOString(); demo.set(item.order_id || item.orderId, item); }
        revoked++;
      }
      return revoked;
    },
  };
}
