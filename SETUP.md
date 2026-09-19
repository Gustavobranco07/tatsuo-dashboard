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
| `scripts/test-normalize.mjs` | 48 testes da normalização, sem rede |
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
node scripts/test-normalize.mjs      # 48 testes, sem rede
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
- **Motivo de perda vazio:** o CRM tem 11 motivos cadastrados, mas as
  oportunidades antigas apontam para ~29 ids de motivos já apagados, que a
  API não resolve. O id cru fica em `motivo_perda_id`.
- **Coleta incompleta:** o log do workflow mostra `truncated` e a diferença
  entre contatos pedidos e recebidos.
- **Dashboard sem dados depois do deploy:** `curl` no `/health` do Worker
  (não pede senha) diz se existe snapshot no KV e de quando ele é.
