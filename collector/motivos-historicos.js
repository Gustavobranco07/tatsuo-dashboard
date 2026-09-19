/**
 * Motivos de perda que a API do GHL não consegue mais traduzir.
 *
 * /opportunities/lost-reason devolve apenas os motivos cadastrados no
 * momento. Oportunidades antigas apontam para motivos que foram apagados ou
 * renomeados no CRM, e a API não expõe o nome deles em lugar nenhum — nem
 * nesse endpoint, nem em GET /opportunities/{id}.
 *
 * Este mapa foi reconstruído cruzando o snapshot do CRM com a coluna
 * `motivo_perda` da planilha que alimentava o dashboard antes da
 * integração, por `id_oportunidade`.
 *
 * 2 id(s) apareceram com mais de uma grafia na planilha e
 * ficaram com a mais frequente:
 *   6a737fbc5fef8a3c93c87f08
 *       12x "duplicado"
 *        9x "Duplicado"
 *   6a6b501de35bd89f0e9f5a12
 *       27x "Sem interesse"
 *       19x "Não tem Interesse"
 * Os dois são conhecidos pela API, então na prática o nome dela vence e
 * estas entradas nunca são usadas.
 *
 * NÃO editar à mão: gerado por scripts/gerar-motivos-historicos.mjs
 * em 2026-09-19.
 *
 * O que vem da API sempre vence — este mapa só preenche o que ela não sabe.
 * Motivo renomeado no CRM continua aparecendo com o nome novo.
 */

export const MOTIVOS_HISTORICOS = {
  // 1453 oportunidades, 1423 confirmadas pela planilha
  "68dedc9820f8d311c5dcc037": "Não tem perfil para evento.",
  //  738 oportunidades, 721 confirmadas pela planilha
  "6a6b501df16ac658fe91068f": "Fora de perfil",
  //  197 oportunidades, 127 confirmadas pela planilha
  "68e68f8c5485fcd44698781f": "Sem retorno. Não responde.",
  //  192 oportunidades, 179 confirmadas pela planilha
  "68daf565331c092a007bc8b0": "Não tem interesse.",
  //  130 oportunidades, 123 confirmadas pela planilha
  "68dd5c42e8e49635ca990d1b": "Contato incorreto",
  //  102 oportunidades
  "6a6b501d0112ef5d6c0ba6b6": "Contato inválido",
  //   55 oportunidades
  "6a0358e5a63a7aa66cd34ba9": "SEM NUMERO",
  //   53 oportunidades
  "6a84b086d395843fc8df0333": "Sem perfil",
  //   46 oportunidades, 27 confirmadas pela planilha
  "6a6b501de35bd89f0e9f5a12": "Sem interesse",
  //   44 oportunidades, 13 confirmadas pela planilha
  "68dc1847937a86fdc4c19ed5": "Tem compromisso nessa data.",
  //   43 oportunidades, 23 confirmadas pela planilha
  "68c9aa5c8cf6d439ef370fe8": "Duplicado",
  //   38 oportunidades
  "6a723ceb4a6c175c796955cd": "não quer investir no momento",
  //   37 oportunidades, 21 confirmadas pela planilha
  "68dd371875459e779cc8f2bf": "Não tem o valor do investimento",
  //   36 oportunidades, 31 confirmadas pela planilha
  "68e556c51dcaad16ffbcb070": "Informou que não poderá participar, sem expor motivo.",
  //   36 oportunidades, 29 confirmadas pela planilha
  "68decbe9d117b29257ee673b": "Achou caro",
  //   33 oportunidades
  "6aa29ad92aedddfe0824bcf2": "Sem perfi",
  //   26 oportunidades, 25 confirmadas pela planilha
  "6aa01c80c034ff99515fcb1f": "Perdido abaixo bronze",
  //   24 oportunidades
  "6a9ef1775c21f532c5806a3d": "Descartar",
  //   22 oportunidades, 12 confirmadas pela planilha
  "6a737fbc5fef8a3c93c87f08": "duplicado",
  //   19 oportunidades
  "6aa01cad25c70ecadde52a0f": "Perdido",
  //   19 oportunidades, 18 confirmadas pela planilha
  "68e52bd09b0a3872c2607a8a": "Bloqueou nosso contato.",
  //   17 oportunidades
  "6a50fd440559dc2df84d352b": "Não é o momento",
  //   17 oportunidades, 2 confirmadas pela planilha
  "68d3fa7a18091044eef5bf8d": "Não estará na cidade no dia 11/10.",
  //   14 oportunidades, 11 confirmadas pela planilha
  "68dc150508177c715081de0f": "Reside em outra cidade.",
  //   13 oportunidades
  "6aa29aeb2aedddfe0824bd33": "sem perfil",
  //   12 oportunidades, 10 confirmadas pela planilha
  "6a6b501d89db2f66b445bdfe": "Não conseguimos contato",
  //   11 oportunidades
  "6a6b501d23f20667c36d8ca5": "Preço / investimento",
  //    6 oportunidades
  "6a31b6f7ae5c010b3ecc6941": "Deslocação de local, não consegue ficar fora.",
  //    6 oportunidades, 5 confirmadas pela planilha
  "6a22ebcaad462b25f48fb041": "TESTE",
  //    6 oportunidades
  "6a51010b05cd039d5079d081": "Não é Verdadeiro",
  //    5 oportunidades
  "6a9ef178704bf54d0379e275": "Não é o momento",
  //    3 oportunidades
  "6a6b501d15351fa26eb744e9": "No-show",
  //    3 oportunidades
  "6a2add16a71c9a130866aef8": "Quer parceria com Helio",
  //    2 oportunidades, 1 confirmadas pela planilha
  "68c812edb51bef9933fd9ca4": "Reside no Rio de Janeiro, não se atentou ao local.",
  //    2 oportunidades
  "6a22bc5cd2ade01ae0c3b0bd": "Problema entre os sócios",
  //    1 oportunidades
  "6a9ef177f314a50b70324377": "Nunca Respondeu",
  //    1 oportunidades
  "6a57c5802b0564d00efedf65": "Deseja evento Online",
  //    1 oportunidades
  "6a6b501d7aa950805a816f9f": "Distância",
  //    1 oportunidades
  "6a3049e2f3cdd19c336d3751": "NO SHOW",
};
