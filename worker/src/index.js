// Collects answer corrections from the app and lets the admin accept them.
// Accepting a correction commits the new letter to source/answers/<cat>.txt
// on GitHub, which triggers the Pages deploy.
import adminHtml from './admin.html';

const RATE_LIMIT_PER_HOUR = 40;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/suggestions') return await publicApi(req, env);
      if (url.pathname.startsWith('/api/admin/')) return await adminApi(req, env, url);
      if (url.pathname === '/admin' || url.pathname === '/') {
        return new Response(adminHtml.replace('__APP_URL__', env.APP_URL), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' },
        });
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: err.message || 'internal error' }, err.status || 500, cors(req, env));
    }
  },
};

/* ---------- public: submit a suggestion ---------- */

async function publicApi(req, env) {
  const headers = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, headers);

  const body = await req.json().catch(() => ({}));
  const cat = String(body.cat ?? '');
  const n = Number(body.n);
  const letter = letterSet(body.letter);
  const clientId = String(body.clientId ?? '');
  const comment = String(body.comment ?? '').trim().slice(0, 1000);
  const name = String(body.name ?? '').trim().slice(0, 80);
  const current = letterSet(body.current) || null;
  if (!/^\d{1,2}$/.test(cat) || !Number.isInteger(n) || n < 1 || n > 1000 || !letter || !/^[\w-]{8,64}$/.test(clientId)) {
    return json({ error: 'invalid input' }, 400, headers);
  }

  const now = Date.now();
  const ipHash = await sha256(`${req.headers.get('CF-Connecting-IP') || 'local'}:${env.ADMIN_TOKEN || ''}`);
  const { recent } = await env.DB.prepare('SELECT COUNT(*) AS recent FROM suggestions WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - 3600_000).first();
  if (recent >= RATE_LIMIT_PER_HOUR) return json({ error: 'too many requests' }, 429, headers);

  await env.DB.prepare(
    `INSERT INTO suggestions (cat, n, letter, current, comment, name, client_id, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (cat, n, client_id) DO UPDATE SET
       letter = excluded.letter, current = excluded.current, comment = excluded.comment, name = excluded.name,
       ip_hash = excluded.ip_hash, created_at = excluded.created_at, status = 'pending', resolved_at = NULL`,
  ).bind(cat, n, letter, current, comment, name, clientId, ipHash, now).run();
  return json({ ok: true }, 200, headers);
}

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = origin === env.APP_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return allowed
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
}

/* ---------- admin ---------- */

async function adminApi(req, env, url) {
  if (!env.ADMIN_TOKEN || !safeEqual(req.headers.get('Authorization') || '', `Bearer ${env.ADMIN_TOKEN}`)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const route = url.pathname.slice('/api/admin/'.length);

  if (route === 'suggestions' && req.method === 'GET') {
    const status = url.searchParams.get('status') || 'pending';
    const stmt = status === 'pending'
      ? env.DB.prepare("SELECT * FROM suggestions WHERE status = 'pending' ORDER BY cat, n, created_at")
      : env.DB.prepare("SELECT * FROM suggestions WHERE status != 'pending' ORDER BY resolved_at DESC LIMIT 200");
    const { results } = await stmt.all();
    return json({ suggestions: results.map(({ ip_hash, client_id, ...rest }) => rest) });
  }

  if (req.method !== 'POST') return json({ error: 'not found' }, 404);
  const body = await req.json().catch(() => ({}));
  const cat = String(body.cat ?? '');
  const n = Number(body.n);
  if (!/^\d{1,2}$/.test(cat) || !Number.isInteger(n)) return json({ error: 'invalid input' }, 400);

  if (route === 'accept') {
    const letter = letterSet(body.letter);
    if (!letter) return json({ error: 'invalid letter' }, 400);
    const commit = await setAnswer(env, cat, n, letter);
    await env.DB.prepare(
      `UPDATE suggestions SET status = CASE WHEN letter = ? THEN 'accepted' ELSE 'rejected' END, resolved_at = ?
       WHERE cat = ? AND n = ? AND status = 'pending'`,
    ).bind(letter, Date.now(), cat, n).run();
    return json({ ok: true, commit });
  }

  if (route === 'reject') {
    await env.DB.prepare("UPDATE suggestions SET status = 'rejected', resolved_at = ? WHERE cat = ? AND n = ? AND status = 'pending'")
      .bind(Date.now(), cat, n).run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

// Rewrites one line of source/answers/<cat>.txt through the GitHub contents API.
async function setAnswer(env, cat, n, letter) {
  const path = `source/answers/${cat}.txt`;
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'medtests-feedback',
  };
  const res = await fetch(`${api}?ref=${env.GITHUB_BRANCH}`, { headers });
  if (!res.ok) throw httpError(`GitHub read failed: ${res.status}`, 502);
  const file = await res.json();
  const text = fromBase64(file.content);

  const line = new RegExp(`^${n}\\s*[.):]?\\s*[a-e, \\t]*$`, 'm');
  const updated = line.test(text)
    ? text.replace(line, `${n}. ${letter}`)
    : `${text.replace(/\n?$/, '\n')}${n}. ${letter}\n`;
  if (updated === text) return null;

  const put = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Answer fix: category ${cat}, question ${n} -> ${letter}`,
      content: toBase64(updated),
      sha: file.sha,
      branch: env.GITHUB_BRANCH,
    }),
  });
  if (!put.ok) throw httpError(`GitHub write failed: ${put.status} ${await put.text()}`, 502);
  return (await put.json()).commit?.sha ?? null;
}

/* ---------- helpers ---------- */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

// "da" / "a, d" -> "ad"; empty string if anything but letters a–e
function letterSet(v) {
  const s = String(v ?? '').toLowerCase().replace(/[\s,]/g, '');
  return /^[a-e]{1,5}$/.test(s) ? [...new Set(s)].sort().join('') : '';
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const toBase64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
