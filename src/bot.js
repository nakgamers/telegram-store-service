import { Markup, Telegraf } from 'telegraf';
import { config } from './config.js';
import { createOrder, getOrder, listProducts, markDelivered, markPaid, updateOrderPayment, upsertUser } from './store.js';
import { createPayment } from './payment.js';

const money = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
const adminOnly = (ctx, next) => config.adminIds.has(Number(ctx.from?.id)) ? next() : ctx.reply(`Akses admin ditolak. ID Telegram kamu: ${ctx.from?.id}`);

export function createBot() {
  const bot = new Telegraf(config.botToken);
  bot.catch((error, ctx) => { console.error('[BOT ERROR]', error.message); ctx.reply('Terjadi kesalahan sistem.').catch(() => {}); });
  bot.start(async (ctx) => { await upsertUser({ telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name }); await ctx.reply(`Selamat datang di ${config.storeName}!\n${config.description}`, menu()); });
  bot.command('id', (ctx) => ctx.reply(`Telegram ID kamu: ${ctx.from.id}`));
  bot.command('katalog', async (ctx) => showCatalog(ctx));
  bot.action('catalog', async (ctx) => { await ctx.answerCbQuery(); await showCatalog(ctx); });
  bot.action(/^buy:(.+)$/, async (ctx) => { await ctx.answerCbQuery(); await beginOrder(ctx, ctx.match[1]); });
  bot.command('order', async (ctx) => ctx.reply('Gunakan /katalog untuk memilih produk.'));
  bot.command('paid', adminOnly, async (ctx) => { const orderId = ctx.message.text.split(/\s+/)[1]; if (!orderId) return ctx.reply('Format: /paid ORDER_ID'); const order = await markPaid(orderId); if (!order) return ctx.reply('Order tidak ditemukan.'); await deliver(ctx, order); });
  bot.command('orders', adminOnly, async (ctx) => ctx.reply('Admin order dashboard akan terhubung ke API web pada tahap berikutnya.'));
  bot.action('home', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply(`Menu ${config.storeName}`, menu()); });
  return bot;
}

const menu = () => Markup.inlineKeyboard([[Markup.button.callback('📦 Katalog Produk', 'catalog')], [Markup.button.callback('🆔 Cek ID Telegram', 'home')]]);

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
