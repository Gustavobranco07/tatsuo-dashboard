/**
 * Testes da normalizacao. Nao tocam na rede: validam o join
 * oportunidade + contato -> linha do CSV.
 *
 *   node scripts/test-normalize.mjs
 */

import { buildRow, toSpDateTime, toDateOnly, pickCfValue, CAMPOS, MOTIVO_REMOVIDO } from '../collector/normalize.js';

let falhas = 0;
function check(label, atual, esperado) {
  const ok = JSON.stringify(atual) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? '  ok   ' : '  FALHA') + '  ' + label +
    (ok ? '' : '\n         esperado: ' + JSON.stringify(esperado) +
               '\n         atual:    ' + JSON.stringify(atual)));
}

/* ---------- fixtures ----------
   Reproduzem a conta real: tres campos distintos de numero de funcionarios
   (que colidiriam se a chave fosse o nome) e Perfil do Lead existindo tanto
   em contact quanto em opportunity. */

const cf = (id, name, fieldKey, dataType = 'TEXT') => [id, { name, fieldKey, dataType }];

const cfById = new Map([
  cf('f1', 'Segmento da Empresa', 'contact.segmento_da_empresa'),
  cf('f2', 'Nº de funcionários', 'contact.nro_de_funcionarios', 'SINGLE_OPTIONS'),
  cf('f3', 'Número de Funcionários', 'contact.numero_de_funcionarios'),
  cf('f4', 'N° de Funcionários', 'contact.n_de_funcionarios', 'SINGLE_OPTIONS'),
  cf('f5', 'Perfil do Lead', 'contact.perfil_do_lead', 'SINGLE_OPTIONS'),
  cf('f6', 'First_atribution Medium', 'contact.first_atribution_medium'),
  cf('f7', 'Last_atribution Medium', 'contact.last_atribution_medium'),
  cf('f8', 'First_atribution Campaign', 'contact.first_atribution_campaign'),
  cf('f9', 'Last_atribution Campaign', 'contact.last_atribution_campaign'),
  cf('f10', 'Last_atribution Content', 'contact.last_atribution_content'),
  cf('f11', 'Faturamento', 'contact.faturamento_anual'),
  cf('f12', 'Campo Exotico', 'contact.campo_exotico'),
  // campos de OPORTUNIDADE
  cf('o1', 'Perfil do Lead', 'opportunity.perfil_do_lead', 'SINGLE_OPTIONS'),
  cf('o2', 'Closer', 'opportunity.closer', 'SINGLE_OPTIONS'),
  cf('o3', 'Qual dia fez o agendamento da reunião?', 'opportunity.data_do_agendamento', 'DATE'),
  cf('o4', 'Para qual dia agendou a reunião?', 'opportunity.data_da_reuniao', 'DATE'),
  cf('o5', 'Produtos', 'opportunity.produtos', 'MULTIPLE_OPTIONS'),
]);

const stagesById = new Map([
  ['st9', { estagio: 'Em Negociação', pipeline: 'MQL Imersão MBV - MAIO/2026', pipelineId: 'pp1', position: 5, showInFunnel: true }],
]);

const usersById = new Map([['u1', 'Fulano Atribuido']]);
const lostReasons = new Map([['lr1', 'Não tem Interesse']]);

const contato = {
  id: 'c1',
  contactName: 'Lead Teste',
  phone: '+5517999999999',
  email: 'lead@exemplo.com',
  tags: ['MQL', 'rio preto'],
  dateAdded: '2026-09-01T13:00:00.000Z',
  customFields: [
    { id: 'f1', fieldValueString: 'Alimentação' },
    { id: 'f2', fieldValueString: '25' },
    { id: 'f3', fieldValueString: '40' },
    { id: 'f5', fieldValueString: 'Prata' },
    { id: 'f6', fieldValueString: 'paid_social' },
    { id: 'f7', fieldValueString: 'dm' },
    { id: 'f8', fieldValueString: '[FORMS] Rio Preto Set' },
    { id: 'f9', fieldValueString: 'Organico Bio' },
    { id: 'f10', fieldValueString: 'criativo_a' },
    { id: 'f11', fieldValueString: 'R$ 500.000' },
    { id: 'f12', fieldValueString: 'valor solto' },
  ],
  attributions: [{ medium: 'External Form', utmSessionSource: 'Direct traffic', isFirst: true }],
};

const ctx = { contactsById: new Map([['c1', contato]]), stagesById, usersById, cfById, lostReasons };

const oportunidade = {
  id: 'o1',
  contactId: 'c1',
  name: 'Lead Teste',
  pipelineId: 'pp1',
  pipelineStageId: 'st9',
  status: 'open',
  source: null,
  monetaryValue: 12500,
  assignedTo: 'u1',
  createdAt: '2026-09-02T02:30:00.000Z',   // 23:30 do dia 01 em Sao Paulo
  lastStageChangeAt: '2026-09-10T12:00:00.000Z',
  lastStatusChangeAt: '2026-09-10T12:00:00.000Z',
  updatedAt: '2026-09-11T12:00:00.000Z',
  lostReasonId: null,
  customFields: [
    { id: 'o1', fieldValueString: 'Ouro' },
    { id: 'o2', fieldValueString: 'Pedro Henrique' },
    { id: 'o3', fieldValueDate: 1776902400000, type: 'date' },   // 2026-04-23 UTC puro
    { id: 'o5', fieldValueArray: ['Imersão MBV', 'Mentoria'] },
  ],
};

/* ---------- testes ---------- */

console.log('\ndatas');
check('instante vira hora local de Sao Paulo (nao adianta um dia)',
  toSpDateTime('2026-09-02T02:30:00.000Z'), '2026-09-01 23:30');
check('vazio vira string vazia', toSpDateTime(''), '');
check('invalido vira string vazia', toSpDateTime('nao-e-data'), '');
check('data pura fica em UTC (nao volta um dia)',
  toDateOnly(1776902400000), '2026-04-23');
check('se data pura fosse convertida para SP daria o dia anterior',
  toSpDateTime(1776902400000).slice(0, 10), '2026-04-22');

console.log('\nleitura de valor de custom field');
check('fieldValueDate (epoch)', pickCfValue({ fieldValueDate: 1776902400000 }), 1776902400000);
check('fieldValueString', pickCfValue({ fieldValueString: 'x' }), 'x');
check('fieldValueArray vira texto', pickCfValue({ fieldValueArray: ['a', 'b'] }), 'a; b');
check('fieldValueNumber', pickCfValue({ fieldValueNumber: 42 }), 42);
check('fieldValueNumber zero nao vira vazio', pickCfValue({ fieldValueNumber: 0 }), 0);
check('selectedOptions', pickCfValue({ selectedOptions: ['a'] }), 'a');

console.log('\nlinha montada');
const row = buildRow(oportunidade, ctx);

check('id_contato', row.id_contato, 'c1');
check('nome_lead', row.nome_lead, 'Lead Teste');
check('estagio_pipeline', row.estagio_pipeline, 'Em Negociação');
check('nome_pipeline', row.nome_pipeline, 'MQL Imersão MBV - MAIO/2026');
check('id_pipeline (para casar com a estrutura do CRM)', row.id_pipeline, 'pp1');
check('id_estagio', row.id_estagio, 'st9');
check('valor e numero', row.valor, 12500);
check('tags viram texto separado por ponto e virgula', row.tags, 'MQL; rio preto');
check('segmento_empresa', row.segmento_empresa, 'Alimentação');
check('dt_criacao_oportunidade em SP', row.dt_criacao_oportunidade, '2026-09-01 23:30');
check('source null nao vira a string "null"', row.fonte_oportunidade, '');
check('faturamento', row.faturamento, 'R$ 500.000');

console.log('\ncampo de oportunidade vence o de contato');
check('perfil_do_lead pega o da oportunidade (Ouro, nao Prata)', row.perfil_do_lead, 'Ouro');
check('closer pega o custom field, nao o assignedTo', row.closer, 'Pedro Henrique');
const semCloserCf = buildRow({ ...oportunidade, customFields: [] }, ctx);
check('sem custom field, closer cai para o usuario atribuido', semCloserCf.closer, 'Fulano Atribuido');
check('sem campo de oportunidade, perfil cai para o do contato', semCloserCf.perfil_do_lead, 'Prata');

console.log('\ncolisao de nomes: 3 campos de funcionarios');
check('usa numero_de_funcionarios (o que vale), nao nro_de_funcionarios',
  row.nro_funcionarios, '40');
const soFallback = buildRow(oportunidade, {
  ...ctx,
  contactsById: new Map([['c1', { ...contato, customFields: [{ id: 'f4', fieldValueString: '100' }] }]]),
});
check('cai para o proximo candidato quando o principal nao existe',
  soFallback.nro_funcionarios, '100');

console.log('\ndatas de reuniao (campos de oportunidade, tipo DATE)');
check('data_do_agendamento sem deslocar o dia', row.data_do_agendamento, '2026-04-23');
check('data_da_reuniao ausente fica vazia', row.data_da_reuniao, '');

console.log('\nmotivo de perda resolvido em nome');
const perdida = buildRow({ ...oportunidade, status: 'lost', lostReasonId: 'lr1' }, ctx);
check('id vira o nome do motivo', perdida.motivo_perda, 'Não tem Interesse');
check('id resolvido tambem guarda o id cru', perdida.motivo_perda_id, 'lr1');
const perdidaDesconhecida = buildRow({ ...oportunidade, lostReasonId: 'xyz' }, ctx);
check('motivo historico vira rotulo generico, nao ObjectId', perdidaDesconhecida.motivo_perda, MOTIVO_REMOVIDO);
check('mas o id fica guardado para diagnostico', perdidaDesconhecida.motivo_perda_id, 'xyz');
check('sem lostReasonId fica vazio (diferente de motivo apagado)', row.motivo_perda, '');

console.log('\natribuicao vem dos custom fields, nao do objeto nativo');
check('first medium', row.first_atribution_medium, 'paid_social');
check('last medium', row.last_atribution_medium, 'dm');
check('first campaign', row.first_atribution_campaign, '[FORMS] Rio Preto Set');
check('last content', row.last_atribution_content, 'criativo_a');

const semAtribCf = buildRow(oportunidade, {
  ...ctx,
  contactsById: new Map([['c1', {
    id: 'c1', contactName: 'X', tags: [], customFields: [],
    attributions: [{ medium: 'External Form', utmSessionSource: 'Direct traffic', isFirst: true }],
  }]]),
});
check('sem custom field, cai para a atribuicao nativa',
  [semAtribCf.first_atribution_medium, semAtribCf.first_atribution_source],
  ['External Form', 'Direct traffic']);

const formatoAntigo = buildRow(oportunidade, {
  ...ctx,
  contactsById: new Map([['c1', {
    id: 'c1', contactName: 'X', tags: [], customFields: [],
    attributionSource: { medium: 'cpc', campaign: 'Antiga' },
    lastAttributionSource: {},
  }]]),
});
check('lastAttributionSource vazio cai para o first',
  [formatoAntigo.first_atribution_medium, formatoAntigo.last_atribution_medium], ['cpc', 'cpc']);

console.log('\ncasos de borda');
const semContato = buildRow({ id: 'o2', contactId: 'inexistente', pipelineStageId: 'desconhecido', status: 'won' }, ctx);
check('oportunidade sem contato nao quebra', semContato.id_contato, 'inexistente');
check('estagio desconhecido vira vazio', semContato.estagio_pipeline, '');
check('valor ausente vira 0', semContato.valor, 0);
check('closer sem nada vira vazio', semContato.closer, '');

console.log('\nconsistencia do mapa');
check('toda coluna de CAMPOS tem ao menos um candidato',
  Object.entries(CAMPOS).filter(([, v]) => !v.length).map(([k]) => k), []);
check('toda chave de CAMPOS tem prefixo de modelo',
  Object.values(CAMPOS).flat().filter((k) => !/^(contact|opportunity)\./.test(k)), []);

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'todos os testes passaram') + '\n');
process.exit(falhas ? 1 : 0);
