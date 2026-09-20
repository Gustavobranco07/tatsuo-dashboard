/**
 * Gera MAPEAMENTO.md: o que o dashboard lê, de onde cada coisa vem no GHL e
 * o que ainda está por resolver.
 *
 * A fonte do mapeamento é a constante CAMPOS de collector/normalize.js — não
 * há lista duplicada aqui. Este script só confronta CAMPOS com os campos que
 * existem de fato na conta, segundo a última sondagem.
 *
 *   node scripts/probe-ghl.mjs        # atualiza probe-output/findings.json
 *   node scripts/gerar-mapeamento.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPOS } from '../collector/normalize.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const findings = JSON.parse(readFileSync(resolve(ROOT, 'probe-output/findings.json'), 'utf8'));

const NO_CRM = new Map(
  (findings.customFields || []).map((f) => [f.fieldKey, f])
);

/** Colunas que não vêm de custom field. */
const DO_OBJETO = [
  ['id_contato', 'opportunity.contactId'],
  ['nome_lead', 'contact.contactName'],
  ['telefone', 'contact.phone'],
  ['email', 'contact.email'],
  ['valor', 'opportunity.monetaryValue'],
  ['nome_pipeline', 'nome do pipeline, via pipelineStageId'],
  ['estagio_pipeline', 'nome da etapa, via pipelineStageId'],
  ['id_pipeline / id_estagio', 'ids do CRM, usados para montar o funil'],
  ['dt_criacao_oportunidade', 'opportunity.createdAt'],
  ['dt_criacao_contato', 'contact.dateAdded'],
  ['status', 'opportunity.status'],
  ['fonte_oportunidade', 'opportunity.source'],
  ['tags', 'contact.tags'],
  ['motivo_perda', 'opportunity.lostReasonId, traduzido por /opportunities/lost-reason'],
  ['sdr_id', 'opportunity.assignedTo'],
  ['dt_ultima_mudanca_estagio', 'opportunity.lastStageChangeAt'],
  ['dt_ultima_mudanca_status', 'opportunity.lastStatusChangeAt'],
];

/* ---------- confronto ---------- */

const linhas = [];
const pendentes = [];

for (const [coluna, candidatos] of Object.entries(CAMPOS)) {
  const achados = candidatos.filter((k) => NO_CRM.has(k));
  const faltando = candidatos.filter((k) => !NO_CRM.has(k));

  let status, descricao;
  if (!achados.length) {
    status = '**NÃO EXISTE NO CRM**';
    descricao = candidatos.map((k) => '`' + k + '`').join(', ');
    pendentes.push({ coluna, candidatos });
  } else {
    status = 'ok';
    const principal = NO_CRM.get(achados[0]);
    descricao = principal.name + ' (`' + achados[0] + '`, ' + principal.dataType + ')';
    if (achados.length > 1) {
      descricao += '<br>reserva: ' + achados.slice(1).map((k) => '`' + k + '`').join(', ');
    }
    if (faltando.length) {
      descricao += '<br><em>não existe(m): ' + faltando.map((k) => '`' + k + '`').join(', ') + '</em>';
    }
  }

  linhas.push('| `' + coluna + '` | ' + descricao + ' | ' + status + ' |');
}

/* campos do CRM que ninguém usa */
const usados = new Set(Object.values(CAMPOS).flat());
const naoUsados = (findings.customFields || []).filter((f) => !usados.has(f.fieldKey));

const md = `# Mapeamento — colunas do dashboard × campos do GHL

Gerado por \`node scripts/gerar-mapeamento.mjs\`, confrontando a constante
\`CAMPOS\` de \`collector/normalize.js\` com a última sondagem da conta.
Para atualizar depois de criar campo novo no CRM: rode \`probe-ghl.mjs\` e
depois este script.

**A ordem dentro de cada linha importa**: o coletor usa o primeiro candidato
que estiver preenchido e cai para os seguintes.

A identificação é sempre pelo \`fieldKey\` completo, nunca pelo nome. A conta
tem \`contact.perfil_do_lead\` e \`opportunity.perfil_do_lead\` como campos
distintos, e três campos diferentes chamados quase igual ("Nº de
funcionários", "N° de Funcionários", "Número de Funcionários") — cortar o
prefixo ou comparar por nome faria um sobrescrever o outro.

## Custom fields

| Coluna no dashboard | Campo no GHL | Status |
|---|---|---|
${linhas.join('\n')}

${pendentes.length === 0
  ? '**Nada pendente**: todo candidato de `CAMPOS` existe na conta.'
  : '## Pendentes\n\n' + pendentes.map((p) =>
      '### `' + p.coluna + '`\n\nNenhum destes existe no CRM: ' +
      p.candidatos.map((k) => '`' + k + '`').join(', ') +
      '\n\nSe o dado existe com outro nome, diga qual. Se não existe, diga de onde vinha.\n'
    ).join('\n')}

## Colunas que não dependem de custom field

| Coluna | De onde vem |
|---|---|
${DO_OBJETO.map(([c, o]) => '| `' + c + '` | ' + o + ' |').join('\n')}

## Custom fields do CRM que o dashboard não usa

Estão aqui só para conferir se algum deveria estar sendo usado.

| Campo | fieldKey | Tipo |
|---|---|---|
${naoUsados.map((f) => '| ' + f.name + ' | `' + f.fieldKey + '` | ' + f.dataType + ' |').join('\n')}

## Motivos de perda cadastrados

${(findings.lostReasons || []).length
  ? (findings.lostReasons.map((m) => '- ' + m.nome).join('\n') +
     '\n\nOportunidades antigas apontam para motivos já apagados, que a API não\n' +
     'traduz. Essas aparecem como "Motivo removido do CRM"; o id fica em\n' +
     '`motivo_perda_id`.')
  : '_Rode `probe-ghl.mjs` de novo para listar._'}
`;

writeFileSync(resolve(ROOT, 'MAPEAMENTO.md'), md);

const okCount = Object.keys(CAMPOS).length - pendentes.length;
console.log('MAPEAMENTO.md gerado.');
console.log('  ' + okCount + ' colunas mapeadas em campos que existem na conta');
console.log('  ' + pendentes.length + ' pendentes');
console.log('  ' + naoUsados.length + ' campos do CRM não usados pelo dashboard');
