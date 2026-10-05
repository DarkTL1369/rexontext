// ============================================================
// طبقة البيانات — ملف JSON ذري للتطوير والعرض التجريبي.
// الواجهة (insert/get/find/update/remove) مطابقة لما ستحتاجه عند الانتقال إلى PostgreSQL
// (انظر database/schema.sql). استبدل هذا الملف فقط دون لمس بقية الكود.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

let state = { users: {}, websites: {}, versions: {}, resets: {} };
try { state = { ...state, ...JSON.parse(fs.readFileSync(config.dataFile, 'utf8')) }; } catch { /* قاعدة جديدة */ }

let timer = null;
function flushNow() {
  clearTimeout(timer); timer = null;
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
  const tmp = config.dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, config.dataFile); // كتابة ذرية: لا يتلف الملف عند الانقطاع
}
const flush = () => { if (!timer) timer = setTimeout(flushNow, 150); };
process.on('exit', () => { if (timer) flushNow(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (timer) flushNow(); process.exit(0); });

export const newId = (p) => p + '_' + crypto.randomBytes(8).toString('hex');
const clone = (x) => (x == null ? x : structuredClone(x));

function col(name) {
  return {
    insert(row) { const r = { id: row.id || newId(name.slice(0, 3)), ...row }; state[name][r.id] = r; flush(); return clone(r); },
    get: (id) => clone(state[name][id]),
    find: (fn) => clone(Object.values(state[name]).find(fn)),
    list: (fn = () => true) => clone(Object.values(state[name]).filter(fn)),
    update(id, patch) { if (!state[name][id]) return null; Object.assign(state[name][id], patch); flush(); return clone(state[name][id]); },
    remove(id) { const had = !!state[name][id]; delete state[name][id]; if (had) flush(); return had; }
  };
}

export const db = { users: col('users'), websites: col('websites'), versions: col('versions'), resets: col('resets') };
