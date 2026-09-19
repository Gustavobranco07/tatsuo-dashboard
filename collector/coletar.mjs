#!/usr/bin/env node
/**
 * Entrada da coleta. Roda no GitHub Actions a cada 20 minutos e tambem na
 * mao, para conferir os numeros.
 *
 *   node collector/coletar.mjs --dry-run   # coleta, mostra e grava local
 *   node collector/coletar.mjs             # idem + envia para o KV
 *
 * Credenciais: variaveis de ambiente (no Actions, via secrets) ou
 * worker/.dev.vars (local).
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './collect.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

/* ---------- credenciais ---------- */

function carregarEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(resolve(ROOT, 'worker/.dev.vars'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no Actions nao existe .dev.vars, e normal */ }
  return env;
}

const env = carregarEnv();

for (const obrigatoria of ['GHL_TOKEN', 'GHL_LOCATION_ID']) {
  if (!env[obrigatoria]) {
    console.error('Faltando ' + obrigatoria + '.');
    process.exit(1);
  }
}

/* ---------- coleta ---------- */

console.log('Coletando' + (DRY ? ' (dry-run)' : '') + '...');
const snap = await collect(env);

console.log('\nConcluido em ' + (snap.tookMs / 1000).toFixed(1) + 's');
console.log('contagens: ' + JSON.stringify(snap.counts, null, 2));
console.log('pipelines ignorados: ' + snap.pipelinesIgnorados.join(', '));
if (snap.truncated) console.error('ATENCAO: coleta truncada — teto de paginas atingido.');

const faltando = snap.counts.contatosPedidos - snap.counts.contatosRecebidos;
if (faltando > 0) {
  console.warn('AVISO: ' + faltando + ' contatos pedidos nao voltaram da API.');
}

/* ---------- qualidade ---------- */

const rows = snap.rows;
const COLUNAS = [
  'id_contato', 'nome_lead', 'telefone', 'segmento_empresa', 'nro_funcionarios',
  'perfil_do_lead', 'produto', 'tags', 'nome_pipeline', 'estagio_pipeline',
  'valor', 'dt_criacao_oportunidade', 'status', 'closer', 'fonte_oportunidade',
  'first_atribution_medium', 'last_atribution_medium',
  'first_atribution_campaign', 'last_atribution_campaign',
  'last_atribution_content', 'data_do_agendamento', 'data_da_reuniao',
  'motivo_perda', 'faturamento',
  'cadencia', 'dt_proxima_reabordagem', 'melhor_periodo_contato',
];

console.log('\n' + '='.repeat(64));
console.log('PREENCHIMENTO DAS COLUNAS (' + rows.length + ' linhas)');
console.log('='.repeat(64));
for (const c of COLUNAS) {
  const n = rows.filter((r) => String(r[c] ?? '').trim() !== '').length;
  const barra = '#'.repeat(Math.round(n / rows.length * 30)).padEnd(30, '.');
  console.log('  ' + c.padEnd(28) + barra + ' ' + String(n).padStart(6) +
    '  ' + (n / rows.length * 100).toFixed(1).padStart(5) + '%');
}

/* ---------- grava local ---------- */

mkdirSync(resolve(ROOT, 'probe-output'), { recursive: true });
const caminho = resolve(ROOT, 'probe-output/snapshot.json');
const corpo = JSON.stringify(snap);
writeFileSync(caminho, corpo);
const mb = (statSync(caminho).size / 1024 / 1024).toFixed(2);
console.log('\nsnapshot.json: ' + mb + ' MB   (limite do KV: 25 MB)');

if (DRY) {
  console.log('dry-run: nada enviado para o KV.');
  process.exit(0);
}

/* ---------- envia para o KV ---------- */

for (const obrigatoria of ['CF_ACCOUNT_ID', 'CF_KV_NAMESPACE_ID', 'CF_API_TOKEN']) {
  if (!env[obrigatoria]) {
    console.error('Faltando ' + obrigatoria + ' para enviar ao KV. Use --dry-run para so conferir.');
    process.exit(1);
  }
}

const url = 'https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID +
  '/storage/kv/namespaces/' + env.CF_KV_NAMESPACE_ID + '/values/snapshot:v1';

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: 'Bearer ' + env.CF_API_TOKEN,
    'Content-Type': 'text/plain',
  },
  body: corpo,
});

if (!res.ok) {
  console.error('Falha ao gravar no KV: HTTP ' + res.status + ' ' + (await res.text()).slice(0, 300));
  process.exit(1);
}

console.log('Snapshot enviado para o KV.');
