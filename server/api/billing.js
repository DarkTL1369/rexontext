// ============================================================
// الفوترة: 7 أيام تجربة، ثم 5$ لكل موقع.
// الدفع والتحقق يتمان في الخادم فقط. الموقع يُعلَّم "مدفوع" فقط بعد Webhook موقّع من Stripe.
// بدون مفاتيح Stripe يعمل وضع تجريبي (mock) في التطوير فقط.
// ============================================================
import crypto from 'node:crypto';
import { route, HttpError } from '../lib/http.js';
import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import { signToken, verifyToken } from '../lib/auth.js';
import { trialActive } from './websites.js';

const mode = () => (config.stripe.key ? 'stripe' : 'mock');

route('GET', '/api/billing', ({ user }) => ({
  mode: mode(), priceUsd: config.priceUsd, trialDays: config.trialDays,
  trialEndsAt: user.createdAt + config.trialDays * 86400000, trialActive: trialActive(user),
  websites: db.websites.list((w) => w.userId === user.id).map((w) => ({ id: w.id, name: w.name, paid: w.paid }))
}), { auth: true });

route('POST', '/api/billing/checkout', async ({ user, body }) => {
  const w = db.websites.get(String(body.websiteId || ''));
  if (!w || w.userId !== user.id) throw new HttpError(404, 'not_found');
  if (w.paid) return { paid: true };
  if (!config.stripe.key) return { mock: true, token: signToken({ wid: w.id, uid: user.id, k: 'mock-pay' }, 600) };
  const form = new URLSearchParams({
    mode: 'payment', client_reference_id: w.id, customer_email: user.email,
    success_url: `${config.appUrl}/#/dashboard/billing?paid=1`, cancel_url: `${config.appUrl}/#/dashboard/billing`,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(config.priceUsd * 100)),
    'line_items[0][price_data][product_data][name]': `NEXORA — ${w.name}`.slice(0, 100),
    'metadata[websiteId]': w.id, 'metadata[userId]': user.id
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${config.stripe.key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const s = await r.json();
  if (!r.ok || !s.url) { console.error('[nexora] Stripe error', s.error?.message); throw new HttpError(502, 'payment_unavailable'); }
  return { url: s.url };
}, { auth: true, limit: [10, 600000] });

// تأكيد الدفع التجريبي (معطّل تمامًا في الإنتاج وعند وجود Stripe)
route('POST', '/api/billing/mock-confirm', ({ user, body }) => {
  if (config.prod || config.stripe.key) throw new HttpError(404, 'not_found');
  const p = verifyToken(body.token);
  if (!p || p.k !== 'mock-pay' || p.uid !== user.id) throw new HttpError(400, 'invalid_token');
  db.websites.update(p.wid, { paid: true });
  return { ok: true };
}, { auth: true });

// Webhook: يتحقق من توقيع Stripe على الجسم الخام قبل أي تغيير
route('POST', '/api/billing/webhook', ({ req, raw }) => {
  if (!config.stripe.webhookSecret) throw new HttpError(503, 'webhook_not_configured');
  const header = String(req.headers['stripe-signature'] || '');
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const expected = crypto.createHmac('sha256', config.stripe.webhookSecret).update(`${parts.t}.${raw.toString('utf8')}`).digest('hex');
  const ok = parts.v1 && parts.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  if (!ok || Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) throw new HttpError(400, 'invalid_signature');
  const event = JSON.parse(raw.toString('utf8'));
  if (event.type === 'checkout.session.completed' && event.data?.object?.payment_status === 'paid') {
    const id = event.data.object.metadata?.websiteId;
    if (id && db.websites.get(id)) db.websites.update(id, { paid: true });
  }
  return { received: true };
}, { rawBody: true, noOrigin: true });

route('GET', '/api/config', () => ({ googleClientId: config.google.clientId, billingMode: mode(), priceUsd: config.priceUsd, trialDays: config.trialDays, platformDomain: config.platformDomain || 'nexora.app' }));
