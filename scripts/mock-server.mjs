/**
 * Servidor local que finge ser o Worker, para testar o dashboard inteiro
 * sem precisar do token do GHL.
 *
 *   node scripts/mock-server.mjs     ->  http://localhost:8787
 *   senha: teste
 *
 * Gera oportunidades falsas no formato cru do GHL e passa pela MESMA
 * normalizacao que o Worker usa, entao o que o navegador recebe e
 * identico em forma ao que vai vir da producao.
 *
 * Serve o dashboard.html real, so trocando a constante API_URL por /data
 * (mesma origem, sem CORS) — que e exatamente o que o deploy faz.
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRow } from '../collector/normalize.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8787;
const SENHA = 'teste';

/* =========================================================
   Dados falsos no formato cru do GHL
========================================================= */

const PIPELINES = [
  { id: 'pp1', nome: 'Comercial Rio Preto', estagios: ['Lead', 'ClaudIA', 'Tentando Contato', 'Em Contato', 'Apresentação Agendada', 'Em Negociação', 'Boca do Gol', 'Venda'] },
  { id: 'pp2', nome: 'Diagnóstico', estagios: ['Lead', 'Em Contato', 'Apresentação Agendada', 'Em Negociação', 'Venda', 'Standby'] },
];

const stagesById = new Map();
for (const p of PIPELINES) {
  p.estagios.forEach((nome, i) => {
    stagesById.set(p.id + '_s' + i, { estagio: nome, pipeline: p.nome, pipelineId: p.id, ordem: i });
  });
}

const usersById = new Map([
  ['u1', 'Ana Closer'], ['u2', 'Bruno Closer'], ['u3', 'Carla Closer'],
]);

const cfEntry = (id, name, chave, dataType = 'TEXT') => [id, {
  name, fieldKey: 'contact.' + chave, chave, dataType,
}];

const cfById = new Map([
  cfEntry('cf1', 'Segmento da Empresa', 'segmento_da_empresa'),
  cfEntry('cf2', 'Nº de funcionários', 'nro_de_funcionarios', 'SINGLE_OPTIONS'),
  cfEntry('cf3', 'Perfil do Lead', 'perfil_do_lead', 'SINGLE_OPTIONS'),
  cfEntry('cf4', 'Data do Agendamento', 'data_do_agendamento', 'DATE'),
  cfEntry('cf5', 'Data da Reuniao', 'data_da_reuniao', 'DATE'),
  cfEntry('cf6', 'First_atribution Medium', 'first_atribution_medium'),
  cfEntry('cf7', 'Last_atribution Medium', 'last_atribution_medium'),
  cfEntry('cf8', 'First_atribution Campaign', 'first_atribution_campaign'),
  cfEntry('cf9', 'Last_atribution Campaign', 'last_atribution_campaign'),
  cfEntry('cf10', 'Last_atribution Content', 'last_atribution_content'),
]);

const SEGMENTOS = ['Alimentação', 'Varejo', 'Serviços', 'Indústria', 'Saúde', 'Educação'];
const CAMPANHAS = ['[FORMS] Rio Preto Set', 'LP Rio Preto Ago', '[FORMS] Diagnóstico Set', 'Remarketing Geral', 'Organico Bio'];
const CRIATIVOS = ['criativo_video_a', 'criativo_estatico_b', 'carrossel_c', 'reels_d'];
const MEDIUMS = ['paid_social', 'ppc', 'social', 'dm', '', 'organic'];
const TAGS_MQL = ['MQL', 'Q-MQL', 'N-MQL'];
const TIERS = ['Ouro', 'Prata', 'Bronze', ''];

/* PRNG com semente: os mesmos dados a cada execucao, entao a comparacao
   visual entre duas rodadas tem sentido. */
let seed = 42;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;

function gerarRows(qtd = 420) {
  const ctx = { contactsById: new Map(), stagesById, usersById, cfById };
  const rows = [];

  for (let i = 0; i < qtd; i++) {
    const pipe = pick(PIPELINES);
    const stageIdx = int(0, pipe.estagios.length - 1);
    const stageId = pipe.id + '_s' + stageIdx;

    // distribui entre os ultimos 5 meses
    const diasAtras = int(0, 150);
    const criado = new Date(Date.now() - diasAtras * 86400000);

    const temReuniao = stageIdx >= 4 || rnd() < 0.2;
    const agendada = temReuniao ? new Date(criado.getTime() + int(1, 10) * 86400000) : null;
    const realizada = temReuniao && rnd() < 0.7 ? new Date(agendada.getTime() + int(0, 3) * 86400000) : null;

    const tier = pick(TIERS);
    const tags = [pick(TAGS_MQL)];
    if (tier) tags.push(tier);
    if (pipe.id === 'pp1') tags.push('rio preto');

    const campanha = pick(CAMPANHAS);
    const medium = pick(MEDIUMS);

    const contato = {
      id: 'c' + i,
      contactName: 'Lead Demo ' + i,
      phone: '+551799999' + String(i).padStart(4, '0'),
      email: 'lead' + i + '@exemplo.com',
      tags,
      dateAdded: criado.toISOString(),
      customFields: [
        { id: 'cf1', value: pick(SEGMENTOS) },
        { id: 'cf2', value: String(int(1, 300)) },
        ...(tier ? [{ id: 'cf3', value: tier }] : []),
        ...(agendada ? [{ id: 'cf4', value: agendada.toISOString() }] : []),
        ...(realizada ? [{ id: 'cf5', value: realizada.toISOString() }] : []),
        { id: 'cf6', value: medium },
        { id: 'cf7', value: medium },
        { id: 'cf8', value: campanha },
        { id: 'cf9', value: campanha },
        { id: 'cf10', value: pick(CRIATIVOS) },
      ],
    };
    ctx.contactsById.set(contato.id, contato);

    const venceu = pipe.estagios[stageIdx] === 'Venda';
    const opp = {
      id: 'o' + i,
      contactId: contato.id,
      name: contato.contactName,
      pipelineStageId: stageId,
      status: venceu ? 'won' : (rnd() < 0.12 ? 'lost' : 'open'),
      source: medium ? 'Facebook Ads' : 'Manychat',
      monetaryValue: venceu ? int(3, 40) * 1000 : (rnd() < 0.5 ? int(3, 40) * 1000 : 0),
      assignedTo: pick(['u1', 'u2', 'u3']),
      createdAt: criado.toISOString(),
      lastStageChangeAt: new Date(criado.getTime() + int(0, 20) * 86400000).toISOString(),
      lastStatusChangeAt: new Date(criado.getTime() + int(0, 20) * 86400000).toISOString(),
      updatedAt: new Date(criado.getTime() + int(0, 25) * 86400000).toISOString(),
      customFields: [],
    };

    rows.push(buildRow(opp, ctx));
  }

  return rows;
}

/* Se existir uma coleta real (probe-output/snapshot.json, gerado por
   coleta-real.mjs), serve ela. Senao, gera dados falsos. Assim o mesmo
   servidor serve para testar sem o CRM e para conferir os numeros reais. */
let SNAPSHOT;
try {
  SNAPSHOT = JSON.parse(readFileSync(resolve(ROOT, 'probe-output/snapshot.json'), 'utf8'));
  console.log('usando a coleta REAL: ' + SNAPSHOT.rows.length + ' oportunidades');
} catch {
  const ROWS = gerarRows();
  SNAPSHOT = {
    generatedAt: new Date(Date.now() - 4 * 60000).toISOString(),
    tookMs: 3200,
    counts: { oportunidades: ROWS.length, contatos: ROWS.length, customFields: cfById.size, usuarios: usersById.size, estagios: stagesById.size },
    rows: ROWS,
  };
  console.log('usando dados FALSOS: ' + ROWS.length + ' oportunidades');
}

/* =========================================================
   Servidor
========================================================= */

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);

  if (url.pathname === '/data') {
    const key = req.headers['x-dash-key'] || url.searchParams.get('k') || '';
    if (key !== SENHA) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'nao autorizado' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(SNAPSHOT));
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    let html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    // aponta o dashboard para este servidor (mesma origem)
    html = html.replace(/const API_URL = '[^']*';/, "const API_URL = '/data';");
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  res.writeHead(404);
  res.end('nao encontrado');
});

server.listen(PORT, () => {
  console.log('mock do Worker em http://localhost:' + PORT);
  console.log('senha: ' + SENHA);

});
