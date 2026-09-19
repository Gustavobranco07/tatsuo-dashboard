/**
 * Orquestra a coleta: junta pipelines, usuarios, custom fields, motivos de
 * perda, oportunidades e contatos num snapshot pronto para o dashboard.
 */

import {
  fetchPipelines, fetchUsers, fetchCustomFields, fetchLostReasons,
  fetchOpportunities, fetchContactsByIds, contador,
} from './ghl.js';
import { buildRow } from './normalize.js';

export async function collect(env) {
  const t0 = Date.now();
  contador.chamadas = 0;
  contador.retries = 0;

  // Tudo que nao depende das oportunidades sai junto.
  const [pipes, usersById, cfById, lostReasons] = await Promise.all([
    fetchPipelines(env),
    fetchUsers(env),
    fetchCustomFields(env),
    fetchLostReasons(env),
  ]);

  const oppsRes = await fetchOpportunities(env, pipes.idsUsados);

  // So os contatos que aparecem nas oportunidades do recorte. Buscar a base
  // inteira custaria 308 requisicoes para usar 22% do que viesse.
  const idsContatos = oppsRes.opportunities.map((o) => o.contactId).filter(Boolean);
  const contactsRes = await fetchContactsByIds(env, idsContatos);

  const contactsById = new Map();
  for (const c of contactsRes.contacts) contactsById.set(c.id, c);

  const ctx = { contactsById, stagesById: pipes.byStageId, usersById, cfById, lostReasons };
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
      motivosPerda: lostReasons.size,
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
