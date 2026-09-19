import { config } from './config.js';

export async function createPayment({ orderId, amount }) {
  if (config.paymentProvider === 'mock') {
    return { provider: 'mock', reference: `MOCK-${orderId}`, status: 'pending', amount, instructions: `Demo payment untuk ${orderId}. Gunakan /paid ${orderId} saat testing.` };
  }
  if (!config.paymentApiKey) throw new Error('PAYMENT_API_KEY kosong.');
  const response = await fetch(`${config.paymentBaseUrl}/deposit/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': config.paymentApiKey }, body: JSON.stringify({ amount, method: 'qris' }) });
  if (!response.ok) throw new Error(`Payment provider HTTP ${response.status}`);
  const data = await response.json();
  const reference = data?.data?.id || data?.data?.transactionId || data?.id || data?.transactionId;
  if (!reference) throw new Error('Payment provider tidak mengembalikan reference.');
  return { provider: config.paymentProvider, reference: String(reference), status: data?.data?.status || 'pending', raw: data };
}

export async function getPaymentStatus(reference) {
  if (config.paymentProvider === 'mock') return { provider: 'mock', reference, status: 'pending' };
  const response = await fetch(`${config.paymentBaseUrl}/deposit/status/${encodeURIComponent(reference)}`, { headers: { 'X-API-Key': config.paymentApiKey } });
  if (!response.ok) throw new Error(`Payment provider HTTP ${response.status}`);
  const data = await response.json();
  return { provider: config.paymentProvider, reference, status: data?.data?.status || data?.status || 'unknown', raw: data };
}
