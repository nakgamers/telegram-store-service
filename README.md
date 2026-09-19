# telegram-store-service

Service bot Telegram untuk menjual produk/jasa 9Router. Ini MVP terpisah dari aplikasi 9router agar tidak mengubah core 9router secara langsung.

## Fitur MVP

- Katalog produk: service, voucher, config, subscription, manual.
- Order Telegram dengan ID unik.
- Payment adapter `mock` untuk development dan `ramashop` untuk production.
- Delivery adapter awal untuk instruksi/manual fulfillment.
- PostgreSQL schema siap digunakan bersama backend web.
- Demo mode tanpa database untuk test lokal.
- Allowlist admin wajib saat bot aktif.
- Health endpoint lokal.

## Menjalankan test

```bash
npm install
npm test
npm run lint
```

## Demo mode tanpa Telegram token

```bash
copy .env.example .env
# biarkan RUN_BOT tidak diset
node src/index.js
```

Health:

```text
http://127.0.0.1:8788/health
```

## Menjalankan bot

Isi `.env` lokal, jangan commit:

```env
RUN_BOT=1
BOT_TOKEN=...
ADMIN_TELEGRAM_IDS=123456789
DATABASE_URL=postgresql://...
PAYMENT_PROVIDER=ramashop
PAYMENT_API_KEY=...
```

Lalu:

```bash
node src/index.js
```

Untuk production, Telegram user wajib menekan `/start` terlebih dahulu. Bot tidak dapat mengirim pesan pertama kepada user yang belum membuka bot.

## Integrasi 9Router

Endpoint provisioning sudah dipetakan ke 9Router:

```text
POST https://router.nandz.qzz.io/api/auth/login
POST https://router.nandz.qzz.io/api/keys
PUT  https://router.nandz.qzz.io/api/keys/:id
DELETE https://router.nandz.qzz.io/api/keys/:id
```

Set environment production di host bot (jangan commit):

```env
NINE_ROUTER_BASE_URL=https://router.nandz.qzz.io
NINE_ROUTER_PASSWORD=<password-9router>
ENTITLEMENT_ENCRYPTION_KEY=<random-secret-minimal-32-char>
```

API key 9Router tidak memiliki quota/expiration native, jadi service menyimpan entitlement dan menonaktifkan key saat entitlement expired. Jangan menjalankan provisioning production sebelum `PAYMENT_PROVIDER` dan webhook/polling pembayaran sudah dikonfigurasi.

