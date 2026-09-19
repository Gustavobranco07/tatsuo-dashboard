# Tatsuo Dashboard — integração com a API do GHL

O dashboard deixa de ler os leads da planilha e passa a ler do CRM, sem sair
do GitHub Pages e sem servidor para manter.

```
GitHub Actions (cron ~20 min)  ──token──▶  API do GoHighLevel
        │  normaliza e envia o snapshot
        ▼
   Cloudflare KV
        ▲  lê
Cloudflare Worker  ── confere a senha, resolve CORS
        ▲  fetch + X-Dash-Key
GitHub Pages (index.html)  ◀── planilha de gasto, direto do Sheets
```

**Por que existe o Worker:** uma página estática não pode guardar o token da
private integration (ficaria visível no código-fonte) e o GHL não libera CORS
para o navegador.

**Por que a coleta roda no Actions e não no Worker:** são ~120 requisições e
~2 minutos, muito acima do plano grátis do Workers (50 subrequisições e 10 ms
de CPU por execução). No Actions não há esse limite, e é grátis em
repositório público.

**O que continua igual:** a hospedagem, a URL do dashboard e a planilha de
gasto de anúncio — a API do GHL não expõe investimento de mídia.

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | o dashboard: camada de dados trocada, tela de senha, funil vindo do CRM |
| `collector/ghl.js` | cliente da API: headers, retry, paginação, lotes de contato |
| `collector/normalize.js` | converte o GHL nas colunas que o dashboard já lê |
| `collector/collect.js` | orquestra a coleta e monta o snapshot |
| `collector/coletar.mjs` | entrada: roda a coleta e envia ao KV |
| `worker/src/index.js` | senha, CORS e leitura do KV. Não fala com o GHL |
| `.github/workflows/sync-ghl.yml` | o cron que dispara a coleta |
| `MAPEAMENTO.md` | coluna do dashboard × campo do GHL |
| `scripts/probe-ghl.mjs` | sonda o schema da conta no CRM |
| `scripts/gerar-mapeamento.mjs` | regera o `MAPEAMENTO.md` a partir da sondagem |
| `scripts/gerar-motivos-historicos.mjs` | reconstrói os motivos de perda que a API não traduz |
| `collector/motivos-historicos.js` | resultado dessa reconstrução (gerado, não editar) |
| `collector/motivos-grupos.js` | junta motivos equivalentes (escrito à mão) |
| `scripts/test-normalize.mjs` | 69 testes da normalização, sem rede |
| `scripts/mock-server.mjs` | Worker falso, para testar sem o token |

---

## Passo 1 — credenciais locais

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

Preencha `GHL_TOKEN` e `GHL_LOCATION_ID`. O arquivo está no `.gitignore` e
nunca vai para o GitHub. O `GHL_LOCATION_ID` é o id da sub-conta, que aparece
na URL do CRM: `app.gohighlevel.com/v2/location/<ESSE_ID>/...`.

## Passo 2 — conferir o mapeamento

```bash
node scripts/probe-ghl.mjs
node scripts/gerar-mapeamento.mjs
```

Gera o `MAPEAMENTO.md` com o que casou sozinho e o que precisa de decisão. O
output da sondagem é anônimo: nome, telefone e e-mail saem mascarados.

Rode de novo sempre que criar campo novo no CRM.

## Passo 3 — criar o KV e o Worker

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create DASH_CACHE
```

Copie o `id` devolvido para o `wrangler.toml` e ajuste `ALLOWED_ORIGINS` para
a origem do Pages (`https://gustavobranco07.github.io`, só o domínio, sem
caminho).

```bash
npx wrangler secret put DASH_PASSWORD
npx wrangler deploy
```

O Worker precisa de um segredo só: a senha. Ele nunca fala com o CRM.

Anote a URL devolvida e coloque em `API_URL`, no começo do bloco `CONFIG` do
`index.html`.

## Passo 4 — token da Cloudflare para o Actions

No painel da Cloudflare: **My Profile → API Tokens → Create Token**, com a
permissão **Workers KV Storage: Edit** na sua conta.

Anote também o **Account ID** (barra lateral do painel) e o **id do
namespace** criado no passo 3.

## Passo 5 — secrets no GitHub

Em **Settings → Secrets and variables → Actions**:

| Secret | De onde vem |
|---|---|
| `GHL_TOKEN` | a private integration do GHL |
| `GHL_LOCATION_ID` | id da sub-conta |
| `CF_ACCOUNT_ID` | painel da Cloudflare |
| `CF_KV_NAMESPACE_ID` | id do namespace do passo 3 |
| `CF_API_TOKEN` | token do passo 4 |

Depois, na aba **Actions**, rode o workflow `sync-ghl` na mão uma vez
(**Run workflow**) para gerar o primeiro snapshot. A partir daí o cron cuida.

> O GitHub desativa cron de repositório que fica 60 dias sem commit. Se o
> dashboard parar de atualizar depois de um período parado, é isso: basta
> reativar na aba Actions.

---

## Testar sem tocar no CRM

```bash
node scripts/test-normalize.mjs      # 69 testes, sem rede
node scripts/mock-server.mjs         # http://localhost:8787, senha: teste
```

O mock gera 420 oportunidades falsas no formato cru do GHL e as passa pela
mesma normalização do Worker. Se existir uma coleta real em
`probe-output/snapshot.json`, ele serve essa em vez das falsas.

Para gerar essa coleta real sem escrever no KV:

```bash
node collector/coletar.mjs --dry-run
```

Imprime tempo, número de requisições e o preenchimento coluna a coluna — é o
jeito mais rápido de descobrir que um campo do CRM parou de vir.

---

## O funil: dois modos

### Com um pipeline filtrado — o CRM manda

A ordem das etapas sai de `position` e a participação no funil sai de
`showInFunnel`, os dois lidos da API. **Para mudar esse funil, mude a
configuração do pipeline no CRM** — não existe lista de etapas no código.
Etapa com `showInFunnel` desmarcado cai abaixo da divisória "fora do funil"
(hoje: Standby e Base).

### Sem filtro de pipeline — os seis grupos

Os 19 pipelines têm 12 layouts diferentes; somados etapa a etapa dariam 25
degraus. A visão consolidada usa o agrupamento definido em
`GRUPOS_CONSOLIDADOS`, no `index.html`:

| Grupo | Etapas do CRM |
|---|---|
| Lead | Lead, Aplicação |
| Tentando Contato | Tentando Contato, CláudIA, Abordagem, Dia 1 a Dia 7, MQL |
| Em Contato | Em Contato, Em Qualificação |
| Apresentação Agendada | Apresentação Agendada, Entrevista, Entrevista Agendada |
| Fechamento | Em Negociação, Boca do Gol, Aguardando Pagamento, Reunião Realizada, Entrevista Realizada, Fechamento |
| Venda | Venda |

O agrupamento vale para tudo que agrega por etapa: o funil, o gráfico
"Volume atual por estágio" e o filtro de estágio, que passa a oferecer os
grupos. A tabela de leads é a exceção — ali continua aparecendo a etapa real
do CRM ("Dia 3", e não "Tentando Contato"), porque é uma visão de detalhe.

**Etapa nova criada no CRM e não incluída em nenhum grupo** vai para "fora do
funil" e é anunciada no console do navegador. É de propósito: somá-la no
grupo errado falsearia a conversão, e descartá-la faria a soma do funil não
bater com o total.

### Outros dois pontos fixos no código

`STAGE_ALIAS` (no `index.html`) junta grafias diferentes do mesmo passo
("Stand-by"/"Standby", "Negociação"/"Em Negociação") para não duplicar linha.

`PIPELINES_EXCLUIDOS` (em `collector/ghl.js`) diz quais pipelines ficam fora
da coleta. É uma lista de **exclusão**: pipeline novo entra sozinho.

---

## Origem do lead

`Anúncio` é mídia paga que caiu numa landing page, `Formulário` é Facebook
Lead Ads (reconhecido pelo `[FORMS]` no nome da campanha) e `Orgânico` é
tudo que não teve mídia paga por trás. A função é `classifySource`, no
`index.html`, e a **última regra é uma captura por exclusão** — é por isso
que as exceções acima dela importam tanto.

Duas exceções existem porque sem elas o balde de Anúncio incha:

- `medium = manual` (contato criado à mão no CRM) vai para Orgânico.
- `survey`, `External Form` e `form` **sem campanha e sem conteúdo** vão
  para Orgânico: sem campanha nem criativo não há mídia paga por trás. Com
  campanha seguem as regras normais, então um `survey` com `[FORMS]`
  continua sendo Formulário. A lista está em `MEDIUMS_SEM_MIDIA`.

### O corte de 02/05/2026

Antes dessa data a automação gravava só o `first_atribution` na criação, e o
`last` vinha vazio. Depois dela os dois são gravados, e lead que retorna tem
só o `last` atualizado — então o `last` passa a ser o caminho mais recente.

O detalhe que complica: **a atribuição mora no contato, não na
oportunidade**. Um contato com duas oportunidades faz as duas lerem o mesmo
`last`, e a mais antiga levaria a atribuição da entrada mais recente. Não há
como casar cada oportunidade com a entrada certa — a lista `attributions`
nativa do GHL vem vazia e os custom fields não têm carimbo de data.

A solução é casar por ordem: dentro de cada contato, a oportunidade **mais
recente** usa o `last`, as anteriores usam o `first`. Antes do corte, segue
aceitando qualquer um dos dois, como sempre foi — o objetivo é não
reclassificar histórico.

Isso exige duas passadas no carregamento (`definirOrigens`), porque saber se
uma oportunidade é a mais recente do contato depende de conhecer todas as
dele. Não dá para calcular linha a linha dentro do `map`.

### Campanha e criativo seguem o mesmo lado

No regime novo, `campaign` e `conteudo` saem da **mesma** atribuição que
decidiu a origem. Sem isso a linha se contradiz: aparece como Orgânico
(lido do `last`) e ao mesmo tempo dentro de um criativo pago (lido do
`first`), contando nos dois lugares. Se o lado escolhido não tem campanha ou
criativo, o campo fica vazio.

No regime antigo os dois campos ficam como sempre foram, inclusive com as
prioridades invertidas entre si que já existiam — campanha `first||last` e
criativo `last||first`. É histórico, e não se reclassifica.

A nota abaixo dos cards de origem conta quantos dos leads contados como
Orgânico entraram por mídia paga e voltaram por um canal orgânico. É a
informação que o último toque descarta, e sem ela o número de Orgânico
parece grande demais sem explicação.

---

## Motivos de perda

A tabela "Motivos de perda" fica abaixo do funil e conta **apenas
`status = 'lost'`**. Clicar num motivo filtra a página inteira; o filtro
"Motivo da perda", no topo, faz a mesma coisa.

Tem duas abas:

- **Existentes no CRM** — só os motivos que o time ainda pode escolher hoje.
  Um grupo entra aqui se **pelo menos um** dos motivos que ele junta estiver
  cadastrado; sem essa regra a aba mostraria 353 das 3.601 perdas em vez de
  3.232.
- **Todos** — inclui os motivos já apagados do CRM e a linha "Sem motivo
  registrado", em cinza, para a soma fechar com o total de perdas.

Acima de 10 linhas a lista pagina de 10 em 10. A página volta para a
primeira quando muda a aba ou qualquer filtro.

Esse filtro exige que a oportunidade esteja perdida. Há um punhado de
oportunidades que foram perdidas, reabertas, e ficaram carregando o
`lostReasonId` antigo — sem essa condição elas apareceriam num filtro de
perda sem estarem perdidas, e a contagem da página não bateria com a da
tabela.

### Por que existe um mapa de motivos no repositório

`/opportunities/lost-reason` devolve só os motivos **cadastrados hoje** (11).
Oportunidades antigas apontam para motivos que foram apagados ou renomeados
no CRM, e a API não expõe o nome deles em lugar nenhum. Sem tratamento, 92%
das perdas apareceriam como um balde genérico.

`collector/motivos-historicos.js` resolve isso. Foi reconstruído cruzando o
snapshot do CRM com a coluna `motivo_perda` **em texto** da planilha antiga,
por `id_oportunidade`, e recupera 3.170 das 3.173 perdas órfãs. Na coleta, o
mapa da API é aplicado **por cima** do histórico: motivo renomeado no CRM
continua aparecendo com o nome novo.

### Agrupamento

A conta acumulou 38 motivos distintos, muitos a mesma coisa escrita de outro
jeito ("Achou caro" / "Não tem o valor do investimento") ou com erro de
digitação ("Sem perfi"). `collector/motivos-grupos.js` junta os equivalentes
e reduz para 19 grupos. Esse arquivo é **escrito à mão** — é taxonomia, não
reconstrução de dado. Motivo que não estiver em nenhum grupo passa intacto,
então motivo novo no CRM aparece sozinho em vez de sumir.

### Reconstrução dos nomes

O arquivo `motivos-historicos.js` é gerado, não se edita à mão:

```bash
node scripts/gerar-motivos-historicos.mjs
```

Precisa de um `probe-output/snapshot.json` (rode `coletar.mjs --dry-run`
antes). Só faz sentido rodar de novo se aparecer "Motivo removido do CRM" em
volume — e note que a planilha vai parar de crescer, então motivos apagados
daqui para frente não terão como ser recuperados.

---

## Durante a migração

Abrir o dashboard com `?src=csv` volta a ler a planilha antiga de leads, para
comparar os dois lado a lado. Quando não precisar mais, dá para remover
`CSV_URL`, `USE_CSV` e a função `rebuildStagesDosDados`.

## Sobre a senha

A senha é conferida **no Worker**, não na página. Quem abrir o link sem ela vê
a tela de acesso e nada mais — nenhum dado sai do CRM. O HTML em si continua
público, porque o GitHub Pages serve arquivo estático; para bloquear a própria
página seria preciso algo como Cloudflare Access, o que implica sair do Pages.

Trocar a senha: `npx wrangler secret put DASH_PASSWORD`. Quem estiver com a
antiga salva no navegador recebe 401 e a tela pede a nova sozinha.

## Quando algo não cruzar

- **Coluna vazia:** rode `probe-ghl.mjs` e `gerar-mapeamento.mjs`. O mapa é a
  constante `CAMPOS`, em `collector/normalize.js`. A identificação é sempre
  pelo `fieldKey` completo, nunca pelo nome — a conta tem
  `contact.perfil_do_lead` e `opportunity.perfil_do_lead` como campos
  diferentes, e três campos distintos chamados quase igual
  ("Nº de funcionários", "N° de Funcionários", "Número de Funcionários").
- **Campos de oportunidade sumindo:** a API só devolve os de contato se a
  consulta não pedir `?model=all`. É um bug fácil de reintroduzir.
- **Motivo de perda vazio:** ver a seção abaixo. Se aparecer "Motivo
  removido do CRM" em volume, é um id novo que caiu fora do mapa — rode
  `gerar-motivos-historicos.mjs` de novo.
- **Coleta incompleta:** o log do workflow mostra `truncated` e a diferença
  entre contatos pedidos e recebidos.
- **Dashboard sem dados depois do deploy:** `curl` no `/health` do Worker
  (não pede senha) diz se existe snapshot no KV e de quando ele é.
