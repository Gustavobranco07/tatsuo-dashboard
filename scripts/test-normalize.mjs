/**
 * Testes da normalizacao. Nao tocam na rede: validam o join
 * oportunidade + contato -> linha do CSV.
 *
 *   node scripts/test-normalize.mjs
 */

import { buildRow, toSpDateTime, toDateOnly, pickCfValue, CAMPOS, MOTIVO_REMOVIDO } from '../collector/normalize.js';
import { mesclarMotivos, gruposAtivos } from '../collector/collect.js';
import { MOTIVOS_HISTORICOS } from '../collector/motivos-historicos.js';
import { GRUPOS_MOTIVOS, agruparMotivo } from '../collector/motivos-grupos.js';

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
check('closer vem do custom field', row.closer, 'Pedro Henrique');
check('sdr vem do assignedTo, e nao do custom field de closer', row.sdr, 'Fulano Atribuido');
const semCloserCf = buildRow({ ...oportunidade, customFields: [] }, ctx);
/* Sem o custom field o closer fica vazio DE PROPOSITO. Se caisse para o
   assignedTo, todo SDR viraria closer de si mesmo e a aba de closers mediria
   o time inteiro em vez dos poucos casos reais. */
check('sem custom field, closer fica vazio (nao cai para o assignedTo)', semCloserCf.closer, '');
check('sem custom field, o sdr continua vindo do assignedTo', semCloserCf.sdr, 'Fulano Atribuido');
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
// 'Não tem Interesse' é membro do grupo 'Não tem interesse'
check('id vira o nome canonico do grupo', perdida.motivo_perda, 'Não tem interesse');
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
check('sdr sem assignedTo vira vazio', semContato.sdr, '');

console.log('\nmotivos de perda: API + historico');
{
  const daApi = new Map([['vivo', 'Nome Atual'], ['so-api', 'So na API']]);
  const hist = { 'vivo': 'Nome Antigo', 'so-hist': 'So no historico' };
  const m = mesclarMotivos(daApi, hist);
  check('historico preenche o que a API nao conhece', m.get('so-hist'), 'So no historico');
  check('API vence o historico quando os dois conhecem o id', m.get('vivo'), 'Nome Atual');
  check('id so da API continua vindo', m.get('so-api'), 'So na API');
  check('id que ninguem conhece nao aparece', m.has('fantasma'), false);

  const desconhecido = buildRow({ ...oportunidade, lostReasonId: 'fantasma' }, { ...ctx, lostReasons: m });
  check('id desconhecido pelos dois cai no rotulo generico',
    desconhecido.motivo_perda, MOTIVO_REMOVIDO);
}

console.log('\nagrupamento de motivos equivalentes');
check('grafia diferente cai no mesmo grupo',
  ['Sem perfi', 'sem perfil', 'Fora de perfil', 'Não tem perfil para evento.'].map(agruparMotivo),
  ['Fora de perfil', 'Fora de perfil', 'Fora de perfil', 'Fora de perfil']);
check('semantica equivalente cai no mesmo grupo',
  ['Achou caro', 'Não tem o valor do investimento'].map(agruparMotivo),
  ['Preço / investimento', 'Preço / investimento']);
check('motivo fora de qualquer grupo passa intacto',
  agruparMotivo('Motivo inventado agora'), 'Motivo inventado agora');
check('vazio continua vazio', agruparMotivo(''), '');
check('separados de proposito continuam separados',
  ['Perdido abaixo bronze', 'Bloqueou nosso contato.', 'Perdido', 'Tem compromisso nessa data.'].map(agruparMotivo),
  ['Perdido abaixo bronze', 'Bloqueou nosso contato.', 'Perdido', 'Tem compromisso nessa data.']);
check('nenhum nome aparece em dois grupos ao mesmo tempo', (() => {
  const vistos = new Set(), repetidos = [];
  for (const membros of Object.values(GRUPOS_MOTIVOS)) {
    for (const m of membros) { if (vistos.has(m)) repetidos.push(m); vistos.add(m); }
  }
  return repetidos;
})(), []);

console.log('\ngrupo ativo: basta um membro cadastrado no CRM');
{
  // no CRM real, 'Sem perfi' e 'sem perfil' estão cadastrados, mas
  // 'Não tem perfil para evento.' (o membro de maior volume) não está
  const daApi = new Map([['id1', 'Sem perfi'], ['id2', 'Duplicado']]);
  const ativos = gruposAtivos(daApi);
  check('grupo inteiro conta como ativo por causa de um membro',
    ativos.has('Fora de perfil'), true);
  check('grupo sem nenhum membro cadastrado nao e ativo',
    ativos.has('Preço / investimento'), false);

  const lr = new Map([['zzz', 'Não tem perfil para evento.']]);
  const r = buildRow({ ...oportunidade, lostReasonId: 'zzz' }, { ...ctx, lostReasons: lr, gruposAtivos: ativos });
  check('linha de membro nao cadastrado herda o ativo do grupo',
    [r.motivo_perda, r.motivo_ativo], ['Fora de perfil', true]);
}

console.log('\nmapa historico congelado no repositorio');
check('tem entradas', Object.keys(MOTIVOS_HISTORICOS).length > 0, true);
check('nenhum nome vazio',
  Object.entries(MOTIVOS_HISTORICOS).filter(([, v]) => !String(v).trim()).map(([k]) => k), []);
check('todas as chaves parecem ObjectId',
  Object.keys(MOTIVOS_HISTORICOS).filter((k) => !/^[0-9a-f]{24}$/.test(k)), []);

console.log('\ncampos novos, ainda sem uso na tela');
check('cadencia', CAMPOS.cadencia, ['opportunity.progresso_da_cadencia']);
check('dt_proxima_reabordagem', CAMPOS.dt_proxima_reabordagem, ['opportunity.data_incio_cadncia']);
check('melhor_periodo_contato', CAMPOS.melhor_periodo_contato, ['contact.melhor_periodo_para_contato']);
check('saem vazios quando o CRM nao tem o dado',
  [row.cadencia, row.dt_proxima_reabordagem, row.melhor_periodo_contato], ['', '', '']);

console.log('\nconsistencia do mapa');
check('toda coluna de CAMPOS tem ao menos um candidato',
  Object.entries(CAMPOS).filter(([, v]) => !v.length).map(([k]) => k), []);
check('toda chave de CAMPOS tem prefixo de modelo',
  Object.values(CAMPOS).flat().filter((k) => !/^(contact|opportunity)\./.test(k)), []);

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'todos os testes passaram') + '\n');
process.exit(falhas ? 1 : 0);
