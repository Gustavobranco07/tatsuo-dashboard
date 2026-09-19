/**
 * Agrupamento dos motivos de perda.
 *
 * A conta acumulou 38 motivos distintos, muitos deles a mesma coisa escrita
 * de outro jeito ("Achou caro" e "Não tem o valor do investimento") ou com
 * erro de digitação ("Sem perfi"). Este mapa junta os equivalentes.
 *
 * ESTE ARQUIVO É ESCRITO À MÃO, ao contrário de motivos-historicos.js, que
 * é gerado. Aqui não há dado a reconstruir: é uma decisão de taxonomia, e
 * precisa ficar legível e fácil de corrigir.
 *
 * Nome que não estiver em nenhum grupo passa intacto — motivo novo criado no
 * CRM aparece sozinho no painel em vez de sumir.
 *
 * Agrupamento revisado e aprovado pelo Gabriel. Quatro junções que eu havia
 * sugerido foram recusadas, de propósito:
 *   - "Perdido abaixo bronze" NÃO entra em Fora de perfil: é vocabulário de
 *     tier, e ele quer acompanhar separado.
 *   - "Bloqueou nosso contato." NÃO entra em Nunca respondeu: bloquear é
 *     recusa ativa, não silêncio.
 *   - "Perdido" fica sozinho.
 *   - "Tem compromisso nessa data." NÃO entra em Localização: o problema foi
 *     a data, não o lugar.
 */

export const GRUPOS_MOTIVOS = {
  'Fora de perfil': [
    'Não tem perfil para evento.',
    'Fora de perfil',
    'Sem perfil',
    'Sem perfi',          // erro de digitação, cadastrado assim no CRM
    'sem perfil',
  ],

  'Contato inválido': [
    'Contato incorreto',
    'Contato inválido',
    'SEM NUMERO',
  ],

  'Não tem interesse': [
    'Não tem interesse.',
    'Não tem Interesse',
  ],

  'Nunca respondeu': [
    'Sem retorno. Não responde.',
    'Não conseguimos contato',
    'Nunca Respondeu',
  ],

  'Preço / investimento': [
    'Não tem o valor do investimento',
    'Achou caro',
    'Preço / investimento',
  ],

  'Não é o momento': [
    'não quer investir no momento',
    'Não é o momento',
  ],

  'Localização / distância': [
    'Não estará na cidade no dia 11/10.',
    'Reside em outra cidade.',
    'Deslocação de local, não consegue ficar fora.',
    'Reside no Rio de Janeiro, não se atentou ao local.',
    'Distância',
  ],

  'Descartar / teste': [
    'Descartar',
    'Não é Verdadeiro',
    'TESTE',
  ],

  'No-show': [
    'No-show',
    'NO SHOW',
  ],
};

/** nome original -> nome canônico do grupo */
const CANONICO = new Map();
for (const [grupo, membros] of Object.entries(GRUPOS_MOTIVOS)) {
  for (const m of membros) CANONICO.set(m, grupo);
}

/** Devolve o nome do grupo, ou o próprio nome quando não há grupo. */
export function agruparMotivo(nome) {
  if (!nome) return '';
  return CANONICO.get(nome) || nome;
}
