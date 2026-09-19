import { config } from './config.js';

async function jsonFetch(url, options) {
  const response = await fetch(url, { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`9Router HTTP ${response.status}: ${body.error || 'request failed'}`);
  return body;
}

export function createNineRouterAdapter({ baseUrl = config.nineRouterBaseUrl, password = config.nineRouterPassword, fetchImpl = fetch } = {}) {
  let cookie = '';
  const request = async (path, options = {}) => {
    const response = await fetchImpl(`${baseUrl}${path}`, { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`9Router HTTP ${response.status}: ${body.error || 'request failed'}`);
    return body;
  };
  return {
    async login() {
      if (!baseUrl || !password) throw new Error('NINE_ROUTER_BASE_URL/NINE_ROUTER_PASSWORD belum diatur.');
      return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
    },
    async createKey(name) {
      await this.login();
      return request('/api/keys', { method: 'POST', body: JSON.stringify({ name }) });
    },
    async disableKey(id) {
      await this.login();
      return request(`/api/keys/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ isActive: false }) });
    },
    async deleteKey(id) {
      await this.login();
      return request(`/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async listPricing() { return request('/api/pricing'); },
  };
}
