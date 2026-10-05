// اختبار سريع شامل: يشغّل الخادم ويجرب التسجيل والتوليد والحفظ والنشر والتصدير
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const PORT = 3999, BASE = `http://localhost:${PORT}`;
const tmp = './data/test-' + Date.now() + '.json';
const srv = spawn('node', ['server/index.js'], { env: { ...process.env, PORT, APP_URL: BASE, DATA_FILE: tmp }, stdio: 'pipe' });
await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('جاهز') && r()));
let cookie = '';
const call = async (m, p, b) => {
  const r = await fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
try {
  // تطابق مفاتيح الترجمة بين اللغات الثلاث
  for (const ns of ['common','landing','generator','dashboard','editor','pricing','auth']) {
    const k = (l) => Object.keys(JSON.parse(fs.readFileSync(`public/locales/${l}/${ns}.json`, 'utf8'))).sort().join();
    ok(k('en') === k('fr') && k('en') === k('ar'), `locale parity: ${ns}`);
  }
  let r = await call('POST', '/api/auth/signup', { email: 'a@b.co', password: 'password123', name: 'Test' });
  ok(r.status === 200, 'signup');
  r = await call('POST', '/api/auth/signup', { email: 'x', password: '1', name: '' }); ok(r.status === 400, 'validation');
  r = await call('POST', '/api/ai/generate', { type: 'portfolio', prompt: 'Portfolio for a GFX artist', style: 'futuristic', colors: { preset: 'purple-blue' }, language: 'multi', name: 'Pixel' });
  ok(r.status === 200 && r.data.website.data.pages.length >= 2, 'generate multi-language');
  const id = r.data.website.id; const site = r.data.website.data;
  r = await call('POST', '/api/ai/edit', { website: site, command: 'غير اللون البنفسجي إلى أخضر' }); ok(r.data.message.code === 'ai.colorChanged', 'ai edit (arabic)');
  r = await call('PUT', '/api/websites/' + id, { website: r.data.website }); ok(r.status === 200, 'save');
  r = await call('POST', `/api/websites/${id}/publish`); ok(r.status === 200 && r.data.website.url, 'publish');
  const url = r.data.website.url.replace(BASE, '');
  const pub = await call('GET', url + 'en/index.html'); ok(pub.status === 200 && String(pub.data).includes('dir="ltr"'), 'published page en');
  const pa = await call('GET', url + 'ar/index.html'); ok(String(pa.data).includes('dir="rtl"') && String(pa.data).includes('<!-- هذا القسم'), 'published page ar RTL + Arabic comments');
  r = await call('GET', `/api/websites/${id}/export`); ok(r.status === 200 && r.data.subarray(0, 2).toString() === 'PK', 'export zip');
  fs.writeFileSync('/tmp/nexora-export.zip', r.data);
  r = await call('POST', '/api/billing/checkout', { websiteId: id }); ok(r.data.mock, 'checkout mock');
  r = await call('GET', '/api/templates/biz-nova/preview?lang=fr'); ok(r.status === 200, 'template preview');
  const other = await fetch(BASE + `/api/websites/${id}`); ok(other.status === 401, 'authorization required');
} catch (e) { console.error(e); process.exitCode = 1; }
srv.kill(); try { fs.unlinkSync(tmp); } catch {}
