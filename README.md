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

Tahap berikutnya:

1. Sambungkan `DATABASE_URL` ke database backend web.
2. Isi `store_products` dengan produk 9Router.
3. Tambahkan API adapter ke order web.
4. Buat delivery adapter untuk voucher/config `.rsc`/WireGuard atau instruksi setup.
5. Tambahkan webhook payment dan idempotency ledger.
6. Tambahkan admin CRUD yang membaca katalog web.

Jangan menyimpan Bot Token, payment API key, database URL, atau secret delivery di Git.
