#!/usr/bin/env node
/**
 * Reconstrói o mapa de motivos de perda que a API do GHL não sabe traduzir.
 *
 * O problema: /opportunities/lost-reason devolve só os motivos cadastrados
 * hoje. Oportunidades antigas apontam para motivos já apagados ou
 * renomeados, e nem esse endpoint nem GET /opportunities/{id} devolvem o
 * nome deles — sobra um ObjectId cru.
 *
 * A saída: a planilha que alimentava o dashboard antes da integração tem uma
 * coluna `motivo_perda` em TEXTO. Cruzando por `id_oportunidade` com o
 * snapshot do CRM, dá para descobrir a que nome cada id corresponde.
 *
 * Gera collector/motivos-historicos.js. Precisa de um snapshot em
 * probe-output/snapshot.json (rode collector/coletar.mjs --dry-run antes).
 *
 *   node scripts/gerar-motivos-historicos.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CSV_LEADS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQT0oSarkKLYUFQPj8VMkpf06iFbSLe6syaSWy68U-5pC_ElFJ6Szv4AIThT9iYlDN_TGGwGVwRhCX3/pub?gid=0&single=true&output=csv';

/** CSV com aspas e vírgulas dentro de campo — parser mínimo, sem dependência. */
function parseCsv(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/* ---------- planilha ---------- */

console.log('Baixando a planilha...');
const linhas = parseCsv(await fetch(CSV_LEADS).then((r) => r.text()));
const cab = linhas[0];
const iOpp = cab.indexOf('id_oportunidade');
const iMotivo = cab.indexOf('motivo_perda');

if (iOpp === -1 || iMotivo === -1) {
  console.error('A planilha não tem as colunas id_oportunidade e motivo_perda.');
  process.exit(1);
}

const textoPorOportunidade = new Map();
for (let i = 1; i < linhas.length; i++) {
  const l = linhas[i];
  const id = (l[iOpp] || '').trim();
  const motivo = (l[iMotivo] || '').trim();
  if (id && motivo) textoPorOportunidade.set(id, motivo);
}
console.log('  ' + textoPorOportunidade.size + ' oportunidades com motivo em texto');

/* ---------- snapshot ---------- */

let snap;
try {
  snap = JSON.parse(readFileSync(resolve(ROOT, 'probe-output/snapshot.json'), 'utf8'));
} catch {
  console.error('Faltou probe-output/snapshot.json. Rode antes:');
  console.error('  node collector/coletar.mjs --dry-run');
  process.exit(1);
}

/* ---------- cruzamento ---------- */

// id do motivo -> { texto -> quantas vezes }
const votos = new Map();
for (const row of snap.rows) {
  if (!row.motivo_perda_id) continue;
  const texto = textoPorOportunidade.get(row.id_oportunidade);
  if (!texto) continue;
  if (!votos.has(row.motivo_perda_id)) votos.set(row.motivo_perda_id, new Map());
  const m = votos.get(row.motivo_perda_id);
  m.set(texto, (m.get(texto) || 0) + 1);
}

// volume de cada id no CRM, para ordenar e relatar
const volume = new Map();
for (const row of snap.rows) {
  if (row.motivo_perda_id) volume.set(row.motivo_perda_id, (volume.get(row.motivo_perda_id) || 0) + 1);
}

const ambiguos = [];
const mapa = [];
for (const [id, textos] of votos) {
  const ordenados = [...textos].sort((a, b) => b[1] - a[1]);
  if (ordenados.length > 1) ambiguos.push({ id, textos: ordenados });
  mapa.push({ id, nome: ordenados[0][0], confirmacoes: ordenados[0][1], volume: volume.get(id) || 0 });
}
mapa.sort((a, b) => b.volume - a.volume);

console.log('\n  ' + mapa.length + ' ids reconstruídos, cobrindo ' +
  mapa.reduce((a, m) => a + m.volume, 0) + ' oportunidades');

if (ambiguos.length) {
  console.warn('\n  ATENÇÃO: ' + ambiguos.length + ' id(s) apareceram com mais de um texto.');
  console.warn('  O mais frequente foi escolhido, mas vale conferir:');
  for (const a of ambiguos) {
    console.warn('    ' + a.id + ': ' + a.textos.map(([t, n]) => '"' + t + '" (' + n + ')').join(' | '));
  }
} else {
  console.log('  Nenhuma ambiguidade: cada id apareceu sempre com o mesmo texto.');
}

const semTexto = [...volume.keys()].filter((id) => !votos.has(id));
if (semTexto.length) {
  const vol = semTexto.reduce((a, id) => a + volume.get(id), 0);
  console.log('\n  ' + semTexto.length + ' id(s) sem correspondência na planilha (' +
    vol + ' oportunidades) — continuam como "Motivo removido do CRM".');
}

/* ---------- arquivo ---------- */

const hoje = new Date().toISOString().slice(0, 10);

const notaAmbiguidade = ambiguos.length
  ? ` * ${ambiguos.length} id(s) apareceram com mais de uma grafia na planilha e\n` +
    ` * ficaram com a mais frequente:\n` +
    ambiguos.map((a) =>
      ` *   ${a.id}\n` +
      a.textos.map(([t, n]) => ` *     ${String(n).padStart(4)}x ${JSON.stringify(t)}`).join('\n')
    ).join('\n') + '\n' +
    ` * Os dois são conhecidos pela API, então na prática o nome dela vence e\n` +
    ` * estas entradas nunca são usadas.\n`
  : ' * Cada id apareceu sempre com o mesmo texto, sem ambiguidade.\n';

const conteudo = `/**
 * Motivos de perda que a API do GHL não consegue mais traduzir.
 *
 * /opportunities/lost-reason devolve apenas os motivos cadastrados no
 * momento. Oportunidades antigas apontam para motivos que foram apagados ou
 * renomeados no CRM, e a API não expõe o nome deles em lugar nenhum — nem
 * nesse endpoint, nem em GET /opportunities/{id}.
 *
 * Este mapa foi reconstruído cruzando o snapshot do CRM com a coluna
 * \`motivo_perda\` da planilha que alimentava o dashboard antes da
 * integração, por \`id_oportunidade\`.
 *
${notaAmbiguidade} *
 * NÃO editar à mão: gerado por scripts/gerar-motivos-historicos.mjs
 * em ${hoje}.
 *
 * O que vem da API sempre vence — este mapa só preenche o que ela não sabe.
 * Motivo renomeado no CRM continua aparecendo com o nome novo.
 */

export const MOTIVOS_HISTORICOS = {
${mapa.map((m) =>
  '  // ' + String(m.volume).padStart(4) + ' oportunidades' +
  (m.confirmacoes < m.volume ? ', ' + m.confirmacoes + ' confirmadas pela planilha' : '') +
  '\n  ' + JSON.stringify(m.id) + ': ' + JSON.stringify(m.nome) + ','
).join('\n')}
};
`;

writeFileSync(resolve(ROOT, 'collector/motivos-historicos.js'), conteudo);
console.log('\ncollector/motivos-historicos.js gerado com ' + mapa.length + ' entradas.');
