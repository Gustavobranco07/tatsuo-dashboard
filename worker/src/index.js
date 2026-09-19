/**
 * Worker que fica entre o dashboard (GitHub Pages) e o snapshot do CRM.
 *
 * Existe por dois motivos:
 *   1. o token da private integration nao pode ir para uma pagina estatica;
 *   2. o GHL nao libera CORS para o navegador.
 *
 * Ele NAO fala com o GHL. Quem coleta e o GitHub Actions, que grava o
 * snapshot no KV — a coleta precisa de mais CPU e mais requisicoes do que o
 * plano gratis do Workers permite. Aqui so tem senha, CORS e leitura do KV.
 */

const SNAPSHOT_KEY = 'snapshot:v1';

/* =========================================================
   CORS
========================================================= */

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || env.DEV_ALLOW_ALL === 'true';

  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : (allowed[0] || ''),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Dash-Key, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, { status = 200, request, env } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

/* =========================================================
   Senha
========================================================= */

/** Comparacao em tempo constante: nao vaza o tamanho nem o prefixo certo. */
function safeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function authorized(request, env) {
  if (!env.DASH_PASSWORD) return false;   // sem senha configurada, ninguem entra
  const url = new URL(request.url);
  const key = request.headers.get('X-Dash-Key') || url.searchParams.get('k') || '';
  return safeEqual(key, env.DASH_PASSWORD);
}

/* =========================================================
   Handler
========================================================= */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // Sonda de vida. Nao devolve dado nenhum, entao dispensa senha.
    if (url.pathname === '/health') {
      const raw = await env.DASH_CACHE.get(SNAPSHOT_KEY);
      let meta = null;
      try { meta = raw ? JSON.parse(raw) : null; } catch { /* snapshot corrompido */ }
      return json({
        ok: true,
        temSnapshot: !!raw,
        generatedAt: meta?.generatedAt || null,
        linhas: meta?.rows?.length ?? 0,
      }, { request, env });
    }

    if (url.pathname !== '/data') {
      return json({ error: 'rota desconhecida' }, { status: 404, request, env });
    }

    if (!authorized(request, env)) {
      return json({ error: 'nao autorizado' }, { status: 401, request, env });
    }

    const raw = await env.DASH_CACHE.get(SNAPSHOT_KEY);
    if (!raw) {
      return json({
        error: 'snapshot ainda nao foi gerado. Rode o workflow sync-ghl no GitHub.',
      }, { status: 503, request, env });
    }

    // `?meta=1` devolve so as contagens, para conferir a coleta sem baixar
    // os 8 MB de linhas.
    if (url.searchParams.get('meta') === '1') {
      let snap;
      try { snap = JSON.parse(raw); } catch {
        return json({ error: 'snapshot invalido no KV' }, { status: 500, request, env });
      }
      const { rows, pipelines, ...meta } = snap;
      return json({ ...meta, linhas: rows?.length ?? 0 }, { request, env });
    }

    // Caminho normal: repassa o JSON do KV sem parsear. Economiza CPU e
    // memoria num payload de alguns megabytes.
    return new Response(raw, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...corsHeaders(request, env),
      },
    });
  },
};
