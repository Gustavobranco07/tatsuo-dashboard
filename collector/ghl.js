/**
 * Cliente da API v2 do GoHighLevel.
 *
 * Toda chamada sai daqui: um unico ponto para headers, retry e paginacao.
 * O token nunca aparece em log nem em mensagem de erro.
 */

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

/** Limite de burst do GHL e ~100 req / 10s por location. Ficamos abaixo. */
const MIN_GAP_MS = 120;
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/** Conta quantas requisicoes a coleta gastou, para dimensionar limites. */
export const contador = { chamadas: 0, retries: 0 };

export async function ghlFetch(env, path, { method = 'GET', body, attempt = 1 } = {}) {
  await throttle();
  contador.chamadas++;

  const url = path.startsWith('http') ? path : BASE + path;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + env.GHL_TOKEN,
        Version: VERSION,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    /* Falha de rede: o fetch rejeita antes de existir resposta, entao nao cai
       no tratamento por status la embaixo. Numa coleta de centenas de paginas
       um soluco de conexao e questao de tempo. */
    if (attempt >= 5) {
      throw new Error('Rede falhou em ' + path + ' apos ' + attempt + ' tentativas: ' + (err.message || err));
    }
    contador.retries++;
    await sleep(500 * Math.pow(2, attempt));
    return ghlFetch(env, path, { method, body, attempt: attempt + 1 });
  }

  if (res.ok) return res.json();

  const text = await res.text();

  /* O GHL devolve 401 com "Command timed out" quando a consulta dele estoura
     o tempo interno — nao e problema de credencial, e passa numa nova
     tentativa. Sem isso a coleta inteira morre no meio por um soluco da API.
     Um 401 de credencial de verdade ("Invalid JWT") continua falhando na
     hora, que e o certo: nao adianta insistir. */
  const timeoutDisfarcado = res.status === 401 && /tim(e|ed)\s*out/i.test(text);
  const vaiTentarDeNovo = res.status === 429 || res.status === 408 || res.status >= 500 || timeoutDisfarcado;

  if (vaiTentarDeNovo && attempt < 5) {
    contador.retries++;
    const retryAfter = Number(res.headers.get('Retry-After')) || 0;
    await sleep(retryAfter ? retryAfter * 1000 : 500 * Math.pow(2, attempt));
    return ghlFetch(env, path, { method, body, attempt: attempt + 1 });
  }

  throw new Error('GHL ' + res.status + ' em ' + path +
    (attempt > 1 ? ' apos ' + attempt + ' tentativas' : '') + ': ' + text.slice(0, 300));
}

/* =========================================================
   Pipelines
========================================================= */

/**
 * Pipelines que NAO entram no dashboard de campanhas.
 *
 * A lista e de exclusao, e nao de inclusao, de proposito: pipeline novo de
 * campanha passa a aparecer sozinho, sem precisar mexer no codigo. So o que
 * e pos-venda ou prospeccao fria fica de fora.
 */
export const PIPELINES_EXCLUIDOS = [
  'Social Selling',
  '[CS] Onboarding',
  '[CS] CONTROLE DE CARTEIRA',
  'Pipeline SDR',
  'Pipeline Closer',
];

/**
 * Devolve a estrutura dos pipelines usados.
 *
 * `position` e `showInFunnel` de cada etapa vao junto: e a configuracao de
 * funil do proprio CRM, e e ela que o dashboard usa para montar o grafico,
 * em vez de uma lista fixa no codigo.
 */
export async function fetchPipelines(env) {
  const j = await ghlFetch(env, '/opportunities/pipelines?locationId=' + env.GHL_LOCATION_ID);

  const excluidos = new Set(
    (env.PIPELINES_EXCLUIDOS
      ? String(env.PIPELINES_EXCLUIDOS).split(',').map((s) => s.trim())
      : PIPELINES_EXCLUIDOS
    ).map((n) => n.toLowerCase())
  );

  const byStageId = new Map();
  const pipelines = [];
  const idsUsados = [];
  const ignorados = [];

  for (const p of j.pipelines || []) {
    if (excluidos.has(String(p.name).toLowerCase())) {
      ignorados.push(p.name);
      continue;
    }

    const stages = (p.stages || [])
      .map((s) => ({
        id: s.id,
        nome: s.name,
        position: typeof s.position === 'number' ? s.position : 0,
        showInFunnel: s.showInFunnel !== false,
      }))
      .sort((a, b) => a.position - b.position);

    pipelines.push({ id: p.id, nome: p.name, stages });
    idsUsados.push(p.id);

    for (const s of stages) {
      byStageId.set(s.id, {
        estagio: s.nome,
        pipeline: p.name,
        pipelineId: p.id,
        position: s.position,
        showInFunnel: s.showInFunnel,
      });
    }
  }

  return { pipelines, byStageId, idsUsados, ignorados };
}

/* =========================================================
   Apoio
========================================================= */

/** userId -> nome */
export async function fetchUsers(env) {
  const j = await ghlFetch(env, '/users/?locationId=' + env.GHL_LOCATION_ID);
  const byId = new Map();
  for (const u of j.users || []) {
    const nome = u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '';
    byId.set(u.id, nome);
  }
  return byId;
}

/**
 * customFieldId -> {name, fieldKey, dataType}
 *
 * `model=all` e essencial: sem ele a API devolve so os campos de contato, e
 * ficam de fora os 7 de oportunidade — entre eles perfil_do_lead,
 * data_do_agendamento e data_da_reuniao.
 *
 * A identificacao e sempre pelo fieldKey COMPLETO, com o prefixo do modelo.
 * Existe `contact.perfil_do_lead` e `opportunity.perfil_do_lead`: sao campos
 * diferentes que colapsariam num so se a gente cortasse o prefixo.
 */
export async function fetchCustomFields(env) {
  const j = await ghlFetch(env, '/locations/' + env.GHL_LOCATION_ID + '/customFields?model=all');
  const byId = new Map();
  for (const f of j.customFields || []) {
    byId.set(f.id, { name: f.name, fieldKey: f.fieldKey, dataType: f.dataType });
  }
  return byId;
}

/** lostReasonId -> nome do motivo */
export async function fetchLostReasons(env) {
  const j = await ghlFetch(env, '/opportunities/lost-reason?locationId=' + env.GHL_LOCATION_ID);
  const byId = new Map();
  // a chave do retorno e `_id`, nao `id`
  for (const r of j.lostReasons || []) byId.set(r._id || r.id, r.name);
  return byId;
}

/* =========================================================
   Oportunidades
========================================================= */

/**
 * Oportunidades dos pipelines informados, paginadas de 100 em 100.
 *
 * Busca pipeline a pipeline em vez de tudo de uma vez: e a unica forma de
 * excluir Social Selling e os funis de pos-venda na origem, em vez de baixar
 * 3 mil registros para jogar fora depois.
 */
export async function fetchOpportunities(env, pipelineIds, { maxPagesPorPipeline = 120 } = {}) {
  const out = [];
  let pages = 0;
  let truncated = false;

  for (const pid of pipelineIds) {
    let path = '/opportunities/search?location_id=' + env.GHL_LOCATION_ID +
      '&pipeline_id=' + pid + '&limit=100';
    let pagesPipeline = 0;

    while (path && pagesPipeline < maxPagesPorPipeline) {
      const j = await ghlFetch(env, path);
      const batch = j.opportunities || [];
      out.push(...batch);
      pages++;
      pagesPipeline++;

      const meta = j.meta || {};
      if (meta.nextPageUrl && batch.length) {
        path = meta.nextPageUrl;
      } else if (batch.length === 100 && meta.startAfter && meta.startAfterId) {
        path = '/opportunities/search?location_id=' + env.GHL_LOCATION_ID +
          '&pipeline_id=' + pid + '&limit=100' +
          '&startAfter=' + encodeURIComponent(meta.startAfter) +
          '&startAfterId=' + encodeURIComponent(meta.startAfterId);
      } else {
        path = null;
      }
    }

    if (pagesPipeline >= maxPagesPorPipeline) truncated = true;
  }

  return { opportunities: out, pages, truncated };
}

/* =========================================================
   Contatos
========================================================= */

/** Lotes de 500 testados; a API aceita e devolve os 500 com custom fields. */
const LOTE_CONTATOS = 500;

/**
 * Busca SO os contatos das oportunidades do recorte, em lotes, pelo id.
 *
 * O filtro `contains_set` em `id` e o que evita varrer a base inteira: sao
 * 6.768 contatos relevantes num total de 30.738, ou seja 14 requisicoes em
 * vez de 308 — e sem trazer para a memoria 24 mil contatos que nao entram
 * em conta nenhuma.
 */
export async function fetchContactsByIds(env, ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  const out = [];
  let lotes = 0;

  for (let i = 0; i < unicos.length; i += LOTE_CONTATOS) {
    const fatia = unicos.slice(i, i + LOTE_CONTATOS);
    const j = await ghlFetch(env, '/contacts/search', {
      method: 'POST',
      body: {
        locationId: env.GHL_LOCATION_ID,
        pageLimit: fatia.length,
        filters: [{ field: 'id', operator: 'contains_set', value: fatia }],
      },
    });
    out.push(...(j.contacts || []));
    lotes++;
  }

  return { contacts: out, lotes, pedidos: unicos.length };
}
