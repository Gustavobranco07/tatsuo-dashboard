/**
 * Converte os objetos crus do GHL nas linhas que o dashboard ja sabe ler.
 *
 * Regra de ouro: cada linha sai com EXATAMENTE os mesmos nomes de campo que
 * os cabecalhos do CSV da planilha. Assim o bloco `RAW = res.data.map(...)`
 * do index.html continua valendo sem uma linha de alteracao.
 *
 * O mapeamento de custom fields esta em CAMPOS, logo abaixo, e espelha o
 * MAPEAMENTO.md. Quando um campo novo for confirmado, e la que se mexe.
 */

import { agruparMotivo } from './motivos-grupos.js';

const TZ = 'America/Sao_Paulo';
const UM_DIA_MS = 86400000;

/* =========================================================
   Datas
========================================================= */

/**
 * Instante -> 'AAAA-MM-DD HH:mm' no fuso de Sao Paulo.
 *
 * Converter aqui (em vez de mandar ISO cru) evita o erro de um dia a menos:
 * o parseDate() do dashboard le os 10 primeiros caracteres como data local,
 * entao a data precisa ja estar no fuso de quem le o painel.
 */
export function toSpDateTime(valor) {
  if (valor === '' || valor === null || valor === undefined) return '';
  const d = new Date(valor);
  if (isNaN(d)) return '';
  return formatar(d, TZ, true);
}

/**
 * Campo do tipo DATE do GHL -> 'AAAA-MM-DD'.
 *
 * Esses campos nao tem hora: o GHL guarda meia-noite UTC. Converter para
 * Sao Paulo devolveria 21:00 do dia ANTERIOR, ou seja, toda reuniao cairia
 * um dia antes do que foi agendado. Por isso a data pura e formatada em UTC.
 */
export function toDateOnly(valor) {
  if (valor === '' || valor === null || valor === undefined) return '';
  const d = new Date(valor);
  if (isNaN(d)) return '';
  return formatar(d, 'UTC', false);
}

function formatar(d, timeZone, comHora) {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(comHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  const data = p.year + '-' + p.month + '-' + p.day;
  return comHora ? data + ' ' + p.hour + ':' + p.minute : data;
}

/* =========================================================
   Mapa de custom fields
========================================================= */

/**
 * Coluna do dashboard -> fieldKeys do GHL a tentar, em ordem de preferencia.
 * Usa a primeira que estiver preenchida.
 *
 * As chaves sao o fieldKey COMPLETO, com prefixo de modelo. E proposital:
 * `contact.perfil_do_lead` e `opportunity.perfil_do_lead` sao campos
 * diferentes, e cortar o prefixo faria um sobrescrever o outro.
 *
 * Ordem confirmada pelo Gabriel em MAPEAMENTO.md.
 */
export const CAMPOS = {
  segmento_empresa: ['contact.segmento_da_empresa'],

  // o que vale e numero_de_funcionarios; os outros 4 sao reserva
  nro_funcionarios: [
    'contact.numero_de_funcionarios',
    'contact.nro_de_funcionarios',
    'contact.n_de_funcionarios',
    'contact.qual_o_n_de_funcionarios',
    'contact.quantos_colaboradores_atuam_na_sua_empresa_atualmente',
  ],

  // Ouro/Prata/Bronze: campo de OPORTUNIDADE, em implantacao agora
  perfil_do_lead: ['opportunity.perfil_do_lead', 'contact.perfil_do_lead'],

  produto: ['opportunity.produtos', 'contact.produto_adquirido'],
  closer: ['opportunity.closer'],

  // Atribuicao: sao custom fields nesta conta, nao o objeto nativo do GHL.
  // Os nomes batem exatamente com as colunas do CSV antigo, o que confirma
  // que a planilha era alimentada a partir deles.
  first_atribution_medium: ['contact.first_atribution_medium'],
  last_atribution_medium: ['contact.last_atribution_medium'],
  first_atribution_campaign: ['contact.first_atribution_campaign'],
  last_atribution_campaign: ['contact.last_atribution_campaign'],
  first_atribution_content: ['contact.first_atribution_content'],
  last_atribution_content: ['contact.last_atribution_content'],
  first_atribution_source: ['contact.first_atribution_source'],
  last_atribution_source: ['contact.last_atribution_source'],

  data_do_agendamento: ['opportunity.data_do_agendamento'],
  data_da_reuniao: ['opportunity.data_da_reuniao'],

  /* ATENÇÃO ao usar: os três campos têm listas de opção incompatíveis entre
     si — uns respondem por mês ("Até R$ 100 mil/mês"), outros por ano
     ("Menos de R$ 1 milhão/ano"). Antes de agrupar num gráfico é preciso
     normalizar para uma escala só. */
  faturamento: [
    'contact.faturamento_anual',
    'contact.qual_seu_faturamento_anual',
    'contact.qual_o_faturamento_da_tua_empresa',
  ],

  /* --- ainda não usados na tela; coletados para as abas de SDR e de perfil
     do lead, para que o dado exista assim que o time começar a preencher --- */

  cadencia: ['opportunity.progresso_da_cadencia'],

  /* A chave `data_incio_cadncia` é resto de uma renomeação: o campo se chama
     "Data da Próxima Reabordagem" e é isso que guarda. NÃO é início de
     cadência — esse marco é a entrada no pipeline, ou seja
     dt_criacao_oportunidade. */
  dt_proxima_reabordagem: ['opportunity.data_incio_cadncia'],

  melhor_periodo_contato: ['contact.melhor_periodo_para_contato'],
};

/** Colunas cujo valor e data pura (sem hora) e nao pode mudar de fuso. */
const COLUNAS_DATA = new Set(['data_do_agendamento', 'data_da_reuniao', 'dt_proxima_reabordagem']);

/** Rotulo para motivo de perda que existe na oportunidade mas nao no CRM. */
export const MOTIVO_REMOVIDO = 'Motivo removido do CRM';

/**
 * lostReasonId -> { nome do grupo, o grupo ainda existe no CRM }
 *
 * O CRM tem 11 motivos cadastrados, mas as oportunidades antigas apontam
 * para ids de motivos ja apagados, que a API nao traduz. Esses caem em
 * MOTIVO_REMOVIDO, que e diferente de "perdeu sem motivo registrado":
 * juntar os dois numa celula vazia esconderia a diferenca.
 */
export function resolverMotivo(lostReasonId, lostReasons, gruposAtivos) {
  if (!lostReasonId) return { nome: '', ativo: false };
  const bruto = lostReasons?.get(lostReasonId);
  if (!bruto) return { nome: MOTIVO_REMOVIDO, ativo: false };
  const nome = agruparMotivo(bruto);
  return { nome, ativo: !!gruposAtivos?.has(nome) };
}

/**
 * Le os customFields de um contato/oportunidade e devolve um objeto indexado
 * pelo fieldKey. Tudo que vier e guardado, inclusive o que ainda nao esta em
 * CAMPOS — e assim que se descobre campo novo sem mexer no codigo.
 */
export function readCustomFields(entity, cfById) {
  const out = {};
  const list = entity?.customFields || entity?.customField || [];

  for (const item of list) {
    const meta = cfById.get(item.id);
    if (!meta) continue;
    const value = pickCfValue(item);
    if (value === '' || value === null || value === undefined) continue;
    out[meta.fieldKey] = value;
  }

  return out;
}

/**
 * O valor de um custom field vem numa chave diferente conforme o tipo, e o
 * GHL nao documenta todas. Campo de data chega em `fieldValueDate` como
 * epoch em milissegundos — sem tratar isso, toda data era descartada.
 */
export function pickCfValue(item) {
  if (item.fieldValueDate !== undefined && item.fieldValueDate !== null) {
    return item.fieldValueDate;
  }
  if (Array.isArray(item.fieldValueArray)) {
    return item.fieldValueArray.filter(Boolean).join('; ');
  }
  if (item.fieldValueNumber !== undefined && item.fieldValueNumber !== null) {
    return item.fieldValueNumber;
  }

  const v = item.fieldValueString ?? item.value ?? item.fieldValue ?? item.selectedOptions;
  if (Array.isArray(v)) return v.filter(Boolean).join('; ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v ?? '';
}

/** Primeiro candidato preenchido, seguindo a ordem de CAMPOS. */
function campo(cf, nome) {
  for (const chave of CAMPOS[nome] || []) {
    const v = cf[chave];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    return COLUNAS_DATA.has(nome) ? normalizarData(v) : String(v).trim();
  }
  return '';
}

/**
 * Data de custom field pode chegar como epoch (numero), ISO ou texto ja
 * digitado. Epoch exatamente em meia-noite UTC e data pura e fica em UTC;
 * qualquer outro instante vai para o fuso de Sao Paulo.
 */
function normalizarData(v) {
  if (typeof v === 'number' || /^\d{13}$/.test(String(v))) {
    const ms = Number(v);
    return ms % UM_DIA_MS === 0 ? toDateOnly(ms) : toSpDateTime(ms);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(s)) return toDateOnly(s);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return toSpDateTime(s);
  return s;
}

/* =========================================================
   Atribuicao nativa (reserva)
========================================================= */

/**
 * Se os custom fields de atribuicao estiverem vazios, cai para o objeto
 * nativo do GHL. Ele traz menos coisa (na maioria dos casos nao tem campanha
 * nem conteudo), mas e melhor que nada para classificar a origem.
 */
function atribuicaoNativa(contact) {
  let first = null;
  let last = null;

  if (Array.isArray(contact?.attributions) && contact.attributions.length) {
    first = contact.attributions.find((a) => a.isFirst) || contact.attributions[0];
    last = contact.attributions[contact.attributions.length - 1];
  } else {
    first = contact?.attributionSource || null;
    last = contact?.lastAttributionSource || null;
    if (last && !Object.keys(last).length) last = null;
  }

  const achatar = (a) => (!a ? { medium: '', campaign: '', content: '', source: '' } : {
    medium: a.medium || a.utmMedium || '',
    campaign: a.campaign || a.utmCampaign || a.campaignName || '',
    content: a.utmContent || a.content || '',
    source: a.utmSource || a.utmSessionSource || a.sessionSource || a.source || a.referrer || '',
  });

  return { first: achatar(first), last: achatar(last || first) };
}

/* =========================================================
   Linha final
========================================================= */

/**
 * Monta a linha no formato do CSV antigo.
 *
 * Os campos extras no fim (ids de pipeline e etapa, sdr_id, datas de
 * mudanca, motivo_perda) nao existiam na planilha. Os ids servem para o
 * dashboard casar a linha com a etapa do CRM sem depender de texto; o resto
 * e para a futura aba de performance do time de vendas.
 */
export function buildRow(opp, ctx) {
  const { contactsById, stagesById, usersById, cfById, lostReasons, gruposAtivos } = ctx;

  const contact = contactsById.get(opp.contactId || opp.contact?.id) || opp.contact || {};
  const stage = stagesById.get(opp.pipelineStageId) || {};

  // custom field da oportunidade vence o do contato quando ambos existem
  const cf = { ...readCustomFields(contact, cfById), ...readCustomFields(opp, cfById) };

  const nativa = atribuicaoNativa(contact);
  const att = (qual, parte) => campo(cf, qual + '_atribution_' + parte) || nativa[qual][parte];

  const tags = [...new Set([...(contact.tags || []), ...(opp.contact?.tags || [])])];
  const motivo = resolverMotivo(opp.lostReasonId, lostReasons, gruposAtivos);

  return {
    /* --- colunas iguais as do CSV de hoje --- */
    id_contato: opp.contactId || contact.id || '',
    id_oportunidade: opp.id || '',
    nome_lead: contact.contactName || contact.name ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') || opp.name || '',
    telefone: contact.phone || '',
    email: contact.email || '',
    segmento_empresa: campo(cf, 'segmento_empresa'),
    fonte_oportunidade: opp.source || contact.source || '',
    nro_funcionarios: campo(cf, 'nro_funcionarios'),
    perfil_do_lead: campo(cf, 'perfil_do_lead'),
    produto: campo(cf, 'produto'),
    tags: tags.join('; '),
    nome_pipeline: stage.pipeline || '',
    estagio_pipeline: stage.estagio || '',
    valor: typeof opp.monetaryValue === 'number' ? opp.monetaryValue : 0,
    dt_criacao_oportunidade: toSpDateTime(opp.createdAt),
    dt_criacao_contato: toSpDateTime(contact.dateAdded || contact.createdAt),
    status: opp.status || '',
    /* SDR e closer sao papeis diferentes e vinham colapsados na mesma coluna.
       O dono da oportunidade (assignedTo) e o SDR: e ele que trabalha o lead
       desde a entrada, e a maioria dos pipelines leva o nome dele. O closer
       vem do custom field `opportunity.closer`, preenchido a mao e recente —
       fica vazio na maior parte da base, e e assim que tem que ficar: cair
       para o assignedTo faria todo SDR aparecer como closer de si mesmo. */
    sdr: usersById.get(opp.assignedTo) || '',
    closer: campo(cf, 'closer'),
    first_atribution_medium: att('first', 'medium'),
    last_atribution_medium: att('last', 'medium'),
    first_atribution_campaign: att('first', 'campaign'),
    last_atribution_campaign: att('last', 'campaign'),
    first_atribution_content: att('first', 'content'),
    last_atribution_content: att('last', 'content'),
    first_atribution_source: att('first', 'source'),
    last_atribution_source: att('last', 'source'),
    data_do_agendamento: campo(cf, 'data_do_agendamento'),
    data_da_reuniao: campo(cf, 'data_da_reuniao'),

    /* --- ligacao com a estrutura do CRM (usada para montar o funil) --- */
    id_pipeline: stage.pipelineId || opp.pipelineId || '',
    id_estagio: opp.pipelineStageId || '',

    /* --- extras para a aba de performance de vendas --- */
    sdr_id: opp.assignedTo || '',
    status_oportunidade: opp.status || '',
    /* O CRM tem 11 motivos cadastrados, mas as oportunidades antigas apontam
       para ~29 ids que nao existem mais (motivos apagados ou renomeados) e
       que a API nao resolve.
       Esses casos viram um rotulo generico em vez de ficarem vazios: "perdeu
       sem motivo registrado" e "perdeu por um motivo que foi apagado" sao
       coisas diferentes, e juntar as duas na mesma celula vazia esconderia
       isso. O id cru continua em motivo_perda_id. */
    motivo_perda: motivo.nome,
    motivo_perda_id: opp.lostReasonId || '',
    /* Grupo ainda em uso no CRM? Basta um dos membros estar cadastrado —
       é o que a aba "Existentes no CRM" do painel usa para separar. */
    motivo_ativo: motivo.ativo,
    faturamento: campo(cf, 'faturamento'),

    /* --- ainda sem uso na tela; existem para as abas de SDR e perfil --- */
    cadencia: campo(cf, 'cadencia'),
    dt_proxima_reabordagem: campo(cf, 'dt_proxima_reabordagem'),
    melhor_periodo_contato: campo(cf, 'melhor_periodo_contato'),

    dt_ultima_mudanca_estagio: toSpDateTime(opp.lastStageChangeAt),
    dt_ultima_mudanca_status: toSpDateTime(opp.lastStatusChangeAt),
    dt_atualizacao: toSpDateTime(opp.updatedAt),
  };
}
