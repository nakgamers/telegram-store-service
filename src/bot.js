import { Markup, Telegraf, Input } from 'telegraf';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createOrder, listProducts, markPaid, updateOrderPayment, upsertUser } from './store.js';
import { createPayment } from './payment.js';
import { createEntitlementService } from './entitlements.js';
import { createNineRouterAdapter } from './ninerouter.js';

const money = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
const formatDate = (value) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value)) + ' WIB';
const bannerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', '9router-store-banner.png');
const adminOnly = (ctx, next) => config.adminIds.size > 0 && config.adminIds.has(Number(ctx.from?.id)) ? next() : ctx.reply(`Akses admin ditolak. ID Telegram kamu: ${ctx.from?.id}.`);

export function createBot() {
  const bot = new Telegraf(config.botToken);
  const entitlements = createEntitlementService({ router: createNineRouterAdapter() });
  bot.catch((error, ctx) => { console.error('[BOT ERROR]', error.message); ctx.reply('Terjadi kesalahan sistem.').catch(() => {}); });
  bot.start(async (ctx) => {
    await upsertUser({ telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name });
    const name = escapeHtml(ctx.from.first_name || ctx.from.username || 'teman');
    const greeting = `Halo, <b>${name}</b> 👋\n\nSelamat datang di <b>9Router Store</b>.\nAkses API AI praktis, cepat, dan siap digunakan.\n\nPilih menu di bawah untuk mulai.`;
    return ctx.replyWithPhoto(Input.fromLocalFile(bannerPath), { caption: greeting, parse_mode: 'HTML', ...menu() });
  });
  bot.command('id', (ctx) => ctx.reply(`Telegram ID kamu: ${ctx.from.id}`));
  bot.command('katalog', async (ctx) => showCatalog(ctx));
  bot.command('bantuan', async (ctx) => ctx.reply('Butuh bantuan? Pilih produk di Katalog atau hubungi admin melalui chat ini.'));
  bot.action('catalog', async (ctx) => { await ctx.answerCbQuery(); await showCatalog(ctx); });
  bot.action('help', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('Pilih Katalog untuk membeli API key. Setelah pembayaran tervalidasi, key dikirim otomatis ke chat ini.'); });
  bot.action('id', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply(`ID Telegram kamu: ${ctx.from.id}`); });
  bot.action('orders', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('Riwayat pesanan akan tersedia setelah pembayaran QRIS aktif.'); });
  bot.action('home', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('Menu utama 9Router Store', menu()); });
  bot.action(/^buy:(.+)$/, async (ctx) => { await ctx.answerCbQuery(); await beginOrder(ctx, ctx.match[1]); });
  bot.command('order', async (ctx) => ctx.reply('Gunakan /katalog untuk memilih produk.'));
  bot.command('paid', adminOnly, async (ctx) => {
    const orderId = ctx.message.text.split(/\s+/)[1];
    if (!orderId) return ctx.reply('Format: /paid ORDER_ID');
    const order = await markPaid(orderId);
    if (!order) return ctx.reply('Order tidak ditemukan.');
    if (String(order.productId).startsWith('api-key-') || order.delivery === 'api_key') {
      try {
        const entitlement = await entitlements.provision(order);
        return ctx.reply(`Order paid ✅\nAPI key 9Router untuk ${order.id}:\n\n<code>${entitlement.apiKey}</code>\n\nBerlaku sampai: ${formatDate(entitlement.expiresAt)}`, { parse_mode: 'HTML' });
      } catch (error) {
        return ctx.reply(`Payment tercatat, tetapi provisioning API key gagal: ${error.message}`);
      }
    }
    return ctx.reply(`Order ${order.id} ditandai paid. Delivery belum otomatis untuk tipe produk ini.`);
  });
  bot.command('orders', adminOnly, async (ctx) => ctx.reply('Admin order dashboard akan terhubung ke API web pada tahap berikutnya.'));
  return bot;
}

const menu = () => Markup.inlineKeyboard([
  [Markup.button.callback('📦 Beli API Key', 'catalog')],
  [Markup.button.callback('🧾 Pesanan Saya', 'orders'), Markup.button.callback('🆔 ID Telegram', 'id')],
  [Markup.button.callback('❓ Bantuan', 'help')],
]);

async function showCatalog(ctx) {
  const products = await listProducts();
  if (!products.length) return ctx.reply('Katalog kosong.');
  const text = products.map((p, i) => `${i + 1}. <b>${escapeHtml(p.name)}</b>\n${escapeHtml(p.description)}\nHarga: <b>${money(p.price)}</b>`).join('\n\n');
  const keyboard = products.map((p) => [Markup.button.callback(`Beli ${p.name} · ${money(p.price)}`, `buy:${p.id}`)]);
  return ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(keyboard) });
}

async function beginOrder(ctx, productId) {
  try {
    const order = await createOrder({ telegramId: ctx.from.id, productId, quantity: 1 });
    const payment = await createPayment({ orderId: order.id, amount: order.total });
    await updateOrderPayment(order.id, payment.reference);
    return ctx.reply(`Order dibuat ✅\n\nID: <code>${order.id}</code>\nProduk: ${escapeHtml(order.productName)}\nTotal: <b>${money(order.total)}</b>\nStatus: menunggu pembayaran\n\n${escapeHtml(payment.instructions || `Reference pembayaran: ${payment.reference}`)}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📦 Katalog lagi', 'catalog')]]) });
  } catch (error) { console.error('[ORDER ERROR]', error.message); return ctx.reply(`Order gagal: ${error.message}`); }
}

async function deliver(ctx, order) {
  const paid = await markPaid(order.id);
  const done = await markDelivered(order.id);
  return ctx.reply(`Pembayaran diterima ✅\nOrder <code>${done.id}</code> selesai.\nProduk: ${escapeHtml(done.productName || order.productName)}\n\nDelivery adapter siap dihubungkan ke voucher/config/service 9Router.`, { parse_mode: 'HTML' });
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }

export { showCatalog };
