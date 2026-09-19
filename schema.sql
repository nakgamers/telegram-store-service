CREATE TABLE IF NOT EXISTS store_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('service','voucher','config','subscription','manual')),
  price BIGINT NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL DEFAULT '',
  delivery TEXT NOT NULL DEFAULT 'manual',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_orders (
  id TEXT PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  product_id TEXT NOT NULL REFERENCES store_products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total BIGINT NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','completed','expired','cancelled')),
  payment_reference TEXT UNIQUE,
  delivery TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_store_orders_user ON store_orders(telegram_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON store_orders(status, expires_at);
CREATE TABLE IF NOT EXISTS store_entitlements (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES store_orders(id),
  telegram_id BIGINT NOT NULL,
  product_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_store_entitlements_user ON store_entitlements(telegram_id, status);
CREATE INDEX IF NOT EXISTS idx_store_entitlements_expiry ON store_entitlements(status, expires_at);
