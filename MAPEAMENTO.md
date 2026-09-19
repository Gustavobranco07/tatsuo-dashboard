# Mapeamento — colunas do dashboard × campos do GHL

Gerado por `node scripts/gerar-mapeamento.mjs`, confrontando a constante
`CAMPOS` de `collector/normalize.js` com a última sondagem da conta.
Para atualizar depois de criar campo novo no CRM: rode `probe-ghl.mjs` e
depois este script.

**A ordem dentro de cada linha importa**: o coletor usa o primeiro candidato
que estiver preenchido e cai para os seguintes.

A identificação é sempre pelo `fieldKey` completo, nunca pelo nome. A conta
tem `contact.perfil_do_lead` e `opportunity.perfil_do_lead` como campos
distintos, e três campos diferentes chamados quase igual ("Nº de
funcionários", "N° de Funcionários", "Número de Funcionários") — cortar o
prefixo ou comparar por nome faria um sobrescrever o outro.

## Custom fields

| Coluna no dashboard | Campo no GHL | Status |
|---|---|---|
| `segmento_empresa` | Segmento da Empresa (`contact.segmento_da_empresa`, TEXT) | ok |
| `nro_funcionarios` | Número de Funcionários (`contact.numero_de_funcionarios`, TEXT)<br>reserva: `contact.nro_de_funcionarios`, `contact.n_de_funcionarios`, `contact.qual_o_n_de_funcionarios`, `contact.quantos_colaboradores_atuam_na_sua_empresa_atualmente` | ok |
| `perfil_do_lead` | Perfil do Lead (`opportunity.perfil_do_lead`, SINGLE_OPTIONS)<br>reserva: `contact.perfil_do_lead` | ok |
| `produto` | Produtos (`opportunity.produtos`, MULTIPLE_OPTIONS)<br>reserva: `contact.produto_adquirido` | ok |
| `closer` | Closer (`opportunity.closer`, SINGLE_OPTIONS) | ok |
| `first_atribution_medium` | First_atribution Medium (`contact.first_atribution_medium`, TEXT) | ok |
| `last_atribution_medium` | Last_atribution Medium (`contact.last_atribution_medium`, TEXT) | ok |
| `first_atribution_campaign` | First_atribution Campaign (`contact.first_atribution_campaign`, TEXT) | ok |
| `last_atribution_campaign` | Last_atribution Campaign (`contact.last_atribution_campaign`, TEXT) | ok |
| `first_atribution_content` | First_atribution Content (`contact.first_atribution_content`, TEXT) | ok |
| `last_atribution_content` | Last_atribution Content (`contact.last_atribution_content`, TEXT) | ok |
| `first_atribution_source` | First_atribution Source (`contact.first_atribution_source`, TEXT) | ok |
| `last_atribution_source` | Last_atribution Source (`contact.last_atribution_source`, TEXT) | ok |
| `data_do_agendamento` | Qual dia fez o agendamento da reunião? (`opportunity.data_do_agendamento`, DATE) | ok |
| `data_da_reuniao` | Para qual dia agendou a reunião? (`opportunity.data_da_reuniao`, DATE) | ok |
| `faturamento` | Faturamento (`contact.faturamento_anual`, TEXT)<br>reserva: `contact.qual_seu_faturamento_anual`, `contact.qual_o_faturamento_da_tua_empresa` | ok |

**Nada pendente**: todo candidato de `CAMPOS` existe na conta.

## Colunas que não dependem de custom field

| Coluna | De onde vem |
|---|---|
| `id_contato` | opportunity.contactId |
| `nome_lead` | contact.contactName |
| `telefone` | contact.phone |
| `email` | contact.email |
| `valor` | opportunity.monetaryValue |
| `nome_pipeline` | nome do pipeline, via pipelineStageId |
| `estagio_pipeline` | nome da etapa, via pipelineStageId |
| `id_pipeline / id_estagio` | ids do CRM, usados para montar o funil |
| `dt_criacao_oportunidade` | opportunity.createdAt |
| `dt_criacao_contato` | contact.dateAdded |
| `status` | opportunity.status |
| `fonte_oportunidade` | opportunity.source |
| `tags` | contact.tags |
| `motivo_perda` | opportunity.lostReasonId, traduzido por /opportunities/lost-reason |
| `closer_id` | opportunity.assignedTo |
| `dt_ultima_mudanca_estagio` | opportunity.lastStageChangeAt |
| `dt_ultima_mudanca_status` | opportunity.lastStatusChangeAt |

## Custom fields do CRM que o dashboard não usa

Estão aqui só para conferir se algum deveria estar sendo usado.

| Campo | fieldKey | Tipo |
|---|---|---|
| Preferred Training Type: (copy) | `contact.contactpreferred_training_type_hzn_copy` | SINGLE_OPTIONS |
| Progresso da Cadência | `opportunity.progresso_da_cadencia` | CHECKBOX |
| Meio de Ativação | `contact.meio_de_ativacao` | MULTIPLE_OPTIONS |
| FITNESS GOAL: | `contact.fitness_goal` | SINGLE_OPTIONS |
| Single Line 821d | `contact.single_line_821d` | TEXT |
| Temperatura do Lead | `contact.temperatura_do_lead` | SINGLE_OPTIONS |
| Melhor período para contato | `contact.melhor_periodo_para_contato` | SINGLE_OPTIONS |
| Principais Queixas | `contact.principais_queixas` | LARGE_TEXT |
| Instagram da Empresa | `contact.instagram_da_empresa` | TEXT |
| Data da Última Interação | `contact.data_da_ltima_interao` | DATE |
| Engajamento | `contact.engajamento` | SINGLE_OPTIONS |
| Qual o faturamento da tua empresa? | `contact.quantas_pessoas_trabalham_na_tua_empresa` | SINGLE_OPTIONS |
| Status Comercial | `contact.status_comercial` | SINGLE_OPTIONS |
| Preferred Training Type: (copy) (copy) | `contact.contactpreferred_training_type_hzn_copy_ili_copy` | SINGLE_OPTIONS |
| PREFERRED TRAINING TYPE: | `contact.preferred_training_type` | SINGLE_OPTIONS |
| Sócios/Decisores da Empresa | `contact.sciosdecisores_da_empresa` | LARGE_TEXT |
| Instagram | `contact.instagram` | TEXT |
| Você é o dono da empresa? | `contact.voce_e_o_dono_da_empresa` | SINGLE_OPTIONS |
| Data da Próxima Reabordagem | `opportunity.data_incio_cadncia` | DATE |

## Motivos de perda cadastrados

- sem perfil
- Sem perfi
- Perdido
- Perdido abaixo bronze
- Duplicado
- Não é o momento
- Nunca Respondeu
- Descartar
- Não tem Interesse
- Contato inválido
- No-show

Oportunidades antigas apontam para motivos já apagados, que a API não
traduz. Essas aparecem como "Motivo removido do CRM"; o id fica em
`motivo_perda_id`.
