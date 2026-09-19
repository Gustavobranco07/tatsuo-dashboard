#!/usr/bin/env node
/**
 * Sonda a API v2 do GoHighLevel para descobrir o schema real da conta.
 *
 * Uso:
 *   node scripts/probe-ghl.mjs
 *
 * Credenciais: lidas de worker/.dev.vars (formato CHAVE=valor) ou das
 * variaveis de ambiente GHL_TOKEN e GHL_LOCATION_ID.
 *
 * O output e propositalmente ANONIMO: imprime nomes de campos, tipos e
 * valores distintos de campos de classificacao (pipeline, estagio, tags),
 * mas mascara nome, telefone, e-mail e qualquer texto livre de contato.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

/* ---------- credenciais ---------- */
function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(resolve(ROOT, 'worker/.dev.vars'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sem .dev.vars, segue com process.env */ }
  return env;
}

const ENV = loadEnv();
const TOKEN = ENV.GHL_TOKEN;
const LOCATION = ENV.GHL_LOCATION_ID;

if (!TOKEN || !LOCATION) {
  console.error('Faltando GHL_TOKEN e/ou GHL_LOCATION_ID.');
  console.error('Crie worker/.dev.vars a partir de worker/.dev.vars.example.');
  process.exit(1);
}

/* ---------- cliente ---------- */
async function call(path, { method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : BASE + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Version: VERSION,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* resposta nao-JSON */ }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 600) };
}

/* ---------- anonimizacao ---------- */
const PII_KEYS = /^(name|firstName|lastName|contactName|fullName|email|phone|address\d?|city|postalCode|companyName|website)$/i;

function shape(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.length ? [shape(value[0], depth + 1), '...(' + value.length + ' itens)'] : [];
  }
  if (typeof value === 'object') {
    if (depth > 3) return '{...}';
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = PII_KEYS.test(k) ? '<' + typeof v + ':oculto>' : shape(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return '<ISO date> ' + value;
    return value.length > 60 ? '<string ' + value.length + ' chars>' : value;
  }
  return value;
}

function report(title, result) {
  console.log('\n' + '='.repeat(70) + '\n' + title + '\n' + '='.repeat(70));
  if (!result.ok) {
    console.log('FALHOU  HTTP ' + result.status);
    console.log(result.text);
    return null;
  }
  return result.json;
}

/* ---------- sondas ---------- */
const findings = {};

async function probePipelines() {
  const r = await call('/opportunities/pipelines?locationId=' + LOCATION);
  const j = report('1. PIPELINES  GET /opportunities/pipelines', r);
  if (!j) return;
  const pipes = j.pipelines || [];
  findings.pipelines = pipes.map(p => ({
    id: p.id,
    nome: p.name,
    estagios: (p.stages || []).map(s => s.name),
  }));
  for (const p of findings.pipelines) {
    console.log('\n  ' + p.nome + '  (' + p.id + ')');
    p.estagios.forEach((s, i) => console.log('    ' + (i + 1) + '. ' + s));
  }
}

async function probeCustomFields() {
  // model=all e essencial: sem ele a API devolve so os campos de contato e
  // esconde os 7 de oportunidade (perfil_do_lead, datas de reuniao, closer).
  const r = await call('/locations/' + LOCATION + '/customFields?model=all');
  const j = report('2. CUSTOM FIELDS  GET /locations/{id}/customFields?model=all', r);
  if (!j) return;
  const fields = j.customFields || [];
  findings.customFields = fields.map(f => ({
    id: f.id, name: f.name, fieldKey: f.fieldKey, dataType: f.dataType, model: f.model,
  }));
  const deOportunidade = findings.customFields
    .filter(f => String(f.fieldKey).startsWith('opportunity.')).length;
  console.log('\n  ' + fields.length + ' campos encontrados (' +
    deOportunidade + ' de oportunidade):\n');
  for (const f of findings.customFields) {
    console.log('    ' + String(f.name).padEnd(34) +
      ' key=' + String(f.fieldKey).padEnd(42) +
      ' tipo=' + f.dataType + '  modelo=' + (f.model || '-'));
  }
}

async function probeUsers() {
  const r = await call('/users/?locationId=' + LOCATION);
  const j = report('3. USUARIOS  GET /users/', r);
  if (!j) return;
  const users = j.users || [];
  findings.users = users.map(u => ({ id: u.id, roles: u.roles && u.roles.role }));
  console.log('\n  ' + users.length + ' usuarios (nomes ocultos). Papeis: ' +
    [...new Set(users.map(u => u.roles && u.roles.role).filter(Boolean))].join(', '));
}

async function probeOpportunities() {
  const r = await call('/opportunities/search?location_id=' + LOCATION + '&limit=20');
  const j = report('4. OPORTUNIDADES  GET /opportunities/search', r);
  if (!j) return;
  const opps = j.opportunities || [];
  findings.opportunityMeta = j.meta || null;
  console.log('\n  total na conta: ' + ((j.meta && j.meta.total) ?? '?') + '   nesta pagina: ' + opps.length);
  console.log('  meta (paginacao): ' + JSON.stringify(j.meta || {}, null, 2));
  if (opps.length) {
    console.log('\n  estrutura de uma oportunidade:');
    console.log(JSON.stringify(shape(opps[0]), null, 2));
    const keys = new Set();
    for (const o of opps) Object.keys(o).forEach(k => keys.add(k));
    console.log('\n  campos presentes em ao menos uma das ' + opps.length + ':');
    console.log('    ' + [...keys].sort().join(', '));
    console.log('\n  valores distintos de status: ' + [...new Set(opps.map(o => o.status))].join(', '));
    console.log('  valores distintos de source: ' + [...new Set(opps.map(o => o.source).filter(Boolean))].join(', '));
    const withCf = opps.filter(o => (o.customFields || []).length);
    console.log('  oportunidades com customFields preenchidos: ' + withCf.length + '/' + opps.length);
  }
}

async function probeContacts() {
  const r = await call('/contacts/search', {
    method: 'POST',
    body: { locationId: LOCATION, pageLimit: 20 },
  });
  const j = report('5. CONTATOS  POST /contacts/search', r);
  if (!j) return;
  const contacts = j.contacts || [];
  console.log('\n  total na conta: ' + (j.total ?? '?') + '   nesta pagina: ' + contacts.length);
  if (contacts.length) {
    console.log('\n  estrutura de um contato:');
    console.log(JSON.stringify(shape(contacts[0]), null, 2));
    const keys = new Set();
    for (const c of contacts) Object.keys(c).forEach(k => keys.add(k));
    console.log('\n  campos presentes em ao menos um dos ' + contacts.length + ':');
    console.log('    ' + [...keys].sort().join(', '));
    const tags = new Set();
    for (const c of contacts) (c.tags || []).forEach(t => tags.add(t));
    console.log('\n  tags vistas nesta amostra (' + tags.size + '): ' + [...tags].sort().join(' | '));
    const last = contacts[contacts.length - 1];
    console.log('\n  chave de paginacao (searchAfter do ultimo): ' + JSON.stringify(last && last.searchAfter));
    const att = contacts.find(c => (c.attributions && c.attributions.length) || c.attributionSource);
    if (att) {
      console.log('\n  atribuicao (exemplo):');
      console.log(JSON.stringify(shape(att.attributions || att.attributionSource), null, 2));
    } else {
      console.log('\n  ATENCAO: nenhum contato da amostra trouxe dados de atribuicao.');
    }
  }
}

async function probeLostReasons() {
  const r = await call('/opportunities/lost-reason?locationId=' + LOCATION);
  const j = report('7. MOTIVOS DE PERDA  GET /opportunities/lost-reason', r);
  if (!j) return;
  const motivos = j.lostReasons || [];
  // a chave e `_id`, nao `id`
  findings.lostReasons = motivos.map(m => ({ id: m._id || m.id, nome: m.name }));
  console.log('\n  ' + motivos.length + ' motivos cadastrados:');
  for (const m of findings.lostReasons) console.log('    ' + String(m.nome).padEnd(30) + m.id);
  console.log('\n  Obs.: oportunidades antigas podem apontar para motivos ja apagados,');
  console.log('  que nao aparecem aqui e nao tem como ser traduzidos.');
}

async function probeCalendars() {
  const r = await call('/calendars/?locationId=' + LOCATION);
  const j = report('6. CALENDARIOS  GET /calendars/', r);
  if (!j) return;
  const cals = j.calendars || [];
  findings.calendars = cals.map(c => ({ id: c.id, name: c.name, isActive: c.isActive }));
  console.log('\n  ' + cals.length + ' calendarios:');
  for (const c of findings.calendars) {
    console.log('    ' + String(c.name).padEnd(40) + ' ' + c.id + '  ativo=' + c.isActive);
  }
}

/* ---------- execucao ---------- */
console.log('Sondando location ' + LOCATION.slice(0, 6) + '...  (token ' + TOKEN.slice(0, 8) + '...)');

await probePipelines();
await probeCustomFields();
await probeUsers();
await probeOpportunities();
await probeContacts();
await probeCalendars();
await probeLostReasons();

mkdirSync(resolve(ROOT, 'probe-output'), { recursive: true });
writeFileSync(resolve(ROOT, 'probe-output/findings.json'), JSON.stringify(findings, null, 2));
console.log('\n\nMapeamentos salvos em probe-output/findings.json (sem dados pessoais).');
