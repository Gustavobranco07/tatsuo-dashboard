/**
 * Orquestra a coleta: junta pipelines, usuarios, custom fields, motivos de
 * perda, oportunidades e contatos num snapshot pronto para o dashboard.
 */

import {
  fetchPipelines, fetchUsers, fetchCustomFields, fetchLostReasons,
  fetchOpportunities, fetchContactsByIds, contador,
} from './ghl.js';
import { buildRow } from './normalize.js';
import { MOTIVOS_HISTORICOS } from './motivos-historicos.js';
import { agruparMotivo } from './motivos-grupos.js';

/**
 * Junta os motivos de perda que a API conhece com os históricos.
 *
 * A API só devolve os motivos cadastrados hoje; oportunidades antigas
 * apontam para motivos já apagados, que ela não traduz. O mapa histórico
 * cobre esses.
 *
 * A API entra POR ÚLTIMO de propósito: se um motivo foi renomeado no CRM,
 * é o nome novo que deve aparecer, não o que a planilha registrou na época.
 */
export function mesclarMotivos(daApi, historicos = MOTIVOS_HISTORICOS) {
  const mapa = new Map(Object.entries(historicos));
  for (const [id, nome] of daApi) mapa.set(id, nome);
  return mapa;
}

/**
 * Quais GRUPOS de motivo ainda estão em uso no CRM.
 *
 * O critério é: basta um membro do grupo estar cadastrado hoje. "Fora de
 * perfil" junta cinco grafias, das quais duas ("sem perfil" e "Sem perfi")
 * continuam cadastradas — então o grupo inteiro conta como existente.
 *
 * Sem essa regra a aba "existentes" mostraria 353 das 3.601 perdas; com ela,
 * mostra 3.232, que é o que responde "quais motivos o time usa hoje".
 */
export function gruposAtivos(daApi) {
  const ativos = new Set();
  for (const nome of daApi.values()) ativos.add(agruparMotivo(nome));
  return ativos;
}

export async function collect(env) {
  const t0 = Date.now();
  contador.chamadas = 0;
  contador.retries = 0;

  // Tudo que nao depende das oportunidades sai junto.
  const [pipes, usersById, cfById, motivosDaApi] = await Promise.all([
    fetchPipelines(env),
    fetchUsers(env),
    fetchCustomFields(env),
    fetchLostReasons(env),
  ]);

  const lostReasons = mesclarMotivos(motivosDaApi);
  const ativos = gruposAtivos(motivosDaApi);

  const oppsRes = await fetchOpportunities(env, pipes.idsUsados);

  // So os contatos que aparecem nas oportunidades do recorte. Buscar a base
  // inteira custaria 308 requisicoes para usar 22% do que viesse.
  const idsContatos = oppsRes.opportunities.map((o) => o.contactId).filter(Boolean);
  const contactsRes = await fetchContactsByIds(env, idsContatos);

  const contactsById = new Map();
  for (const c of contactsRes.contacts) contactsById.set(c.id, c);

  const ctx = { contactsById, stagesById: pipes.byStageId, usersById, cfById, lostReasons, gruposAtivos: ativos };
  const rows = oppsRes.opportunities.map((o) => buildRow(o, ctx));

  return {
    generatedAt: new Date().toISOString(),
    tookMs: Date.now() - t0,
    counts: {
      oportunidades: rows.length,
      contatosPedidos: contactsRes.pedidos,
      contatosRecebidos: contactsRes.contacts.length,
      paginasOportunidades: oppsRes.pages,
      lotesContatos: contactsRes.lotes,
      requisicoes: contador.chamadas,
      retries: contador.retries,
      pipelinesUsados: pipes.idsUsados.length,
      customFields: cfById.size,
      usuarios: usersById.size,
      motivosPerdaApi: motivosDaApi.size,
      motivosPerdaTotal: lostReasons.size,
      gruposMotivoAtivos: ativos.size,
      estagios: pipes.byStageId.size,
    },
    pipelinesIgnorados: pipes.ignorados,
    truncated: oppsRes.truncated,
    /* A estrutura dos pipelines viaja junto: e com ela que o dashboard monta
       o funil (ordem por `position`, participacao por `showInFunnel`), em vez
       de uma lista fixa no codigo. */
    pipelines: pipes.pipelines,
    rows,
  };
}
