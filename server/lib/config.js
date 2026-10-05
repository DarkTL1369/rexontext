// ============================================================
// الإعدادات: تُقرأ من متغيرات البيئة (.env) فقط — لا مفاتيح داخل الكود
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// قارئ .env بسيط بدون مكتبات خارجية
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* لا يوجد .env — نستخدم القيم الافتراضية */ }

const e = process.env;
const prod = e.NODE_ENV === 'production';
let secret = e.SESSION_SECRET;
if (!secret) {
  if (prod) throw new Error('SESSION_SECRET مطلوب في وضع الإنتاج');
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[nexora] SESSION_SECRET غير مضبوط: سيتم استخدام سرّ مؤقت (الجلسات تنتهي عند إعادة التشغيل).');
}

export const config = {
  prod,
  port: Number(e.PORT) || 3000,
  // على Render يتوفر RENDER_EXTERNAL_URL تلقائيًا فنستخدمه إذا لم يُضبط APP_URL
  appUrl: (e.APP_URL || e.RENDER_EXTERNAL_URL || `http://localhost:${Number(e.PORT) || 3000}`).replace(/\/$/, ''),
  platformDomain: (e.PLATFORM_DOMAIN || '').toLowerCase(),
  secret,
  dataFile: path.resolve(ROOT, e.DATA_FILE || './data/db.json'),
  ai: { key: e.ANTHROPIC_API_KEY || '', model: e.AI_MODEL || 'claude-sonnet-5-5' },
  stripe: { key: e.STRIPE_SECRET_KEY || '', webhookSecret: e.STRIPE_WEBHOOK_SECRET || '' },
  google: { clientId: e.GOOGLE_CLIENT_ID || '', secret: e.GOOGLE_CLIENT_SECRET || '' },
  priceUsd: Number(e.WEBSITE_PRICE_USD) || 5,
  trialDays: Number(e.TRIAL_DAYS) || 7
};
