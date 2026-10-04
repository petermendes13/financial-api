# Financial API

API REST em **Node.js + Fastify** para receber lançamentos financeiros, persistir os dados em um arquivo SQLite e expor consultas agregadas para dashboards. A aplicação usa uma camada de repositório separada do servidor HTTP, deixando a troca do adaptador SQLite por PostgreSQL concentrada em `src/db`.

## Documentação detalhada dos endpoints

Consulte o [guia passo a passo de requisições](docs/API-ENDPOINTS.md) para ver a ordem recomendada de integração, parâmetros, corpos JSON, respostas, códigos HTTP e exemplos completos com `curl`.

## Escopo implementado

A API oferece:

- cadastro e consulta de contas financeiras;
- lançamentos de entrada, saída e transferências;
- transferência entre duas contas em uma única transação SQLite;
- filtros e paginação de lançamentos;
- resumo de dashboard com receitas, despesas, resultado líquido e saldos por conta;
- despesas agrupadas por categoria;
- fluxo de caixa agrupado por dia ou mês;
- migrações SQL versionadas;
- testes de integração com banco temporário.

> Todos os valores monetários são enviados e retornados em **centavos inteiros**. Por exemplo, `R$ 125,50` é representado como `12550`. Essa decisão evita erros de arredondamento e é compatível com o uso de `BIGINT` no PostgreSQL.

## Requisitos

- Node.js 20 ou superior;
- npm.

## Execução

```bash
cd /home/ubuntu/financial-api
cp .env.example .env
npm install
npm run db:migrate
npm start
```

Por padrão, o servidor escuta em `http://localhost:3000` e cria o banco em `data/financial.sqlite`.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

Para carregar dados demonstrativos:

```bash
npm run db:seed
```

Para executar os testes:

```bash
npm test
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP. |
| `HOST` | `0.0.0.0` | Interface de escuta. |
| `DATABASE_PATH` | `./data/financial.sqlite` | Caminho do arquivo SQLite. |
| `CORS_ORIGIN` | `*` | Origem permitida pelo CORS; restringir em produção. |
| `NODE_ENV` | `development` | Em `production`, mensagens internas não são expostas ao cliente. |

## Endpoints

Todos os endpoints de negócio usam o prefixo `/api/v1`.

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Health check. |
| `POST` | `/api/v1/accounts` | Cria uma conta. |
| `GET` | `/api/v1/accounts` | Lista contas ativas; use `?includeInactive=true` para incluir inativas. |
| `GET` | `/api/v1/accounts/:id` | Consulta uma conta. |
| `PATCH` | `/api/v1/accounts/:id` | Atualiza parcialmente uma conta. |
| `POST` | `/api/v1/ambient` | Cria um ambiente. |
| `GET` | `/api/v1/ambient` | Lista ambientes. |
| `GET` | `/api/v1/ambient/:id` | Consulta um ambiente. |
| `PATCH` | `/api/v1/ambient/:id` | Atualiza parcialmente um ambiente. |
| `POST` | `/api/v1/users` | Cria um usuário vinculado a um ambiente. |
| `GET` | `/api/v1/users` | Lista usuários. |
| `GET` | `/api/v1/users/:id` | Consulta um usuário. |
| `PATCH` | `/api/v1/users/:id` | Atualiza parcialmente um usuário. |
| `POST` | `/api/v1/transactions` | Cria entrada, saída ou lançamento de transferência. |
| `GET` | `/api/v1/transactions` | Lista lançamentos com filtros e paginação. |
| `PATCH` | `/api/v1/transactions/:id` | Atualiza parcialmente uma transação comum. |
| `DELETE` | `/api/v1/transactions/:id` | Exclui uma transação comum. |
| `POST` | `/api/v1/transfers` | Cria saída e entrada vinculadas em uma operação atômica. |
| `GET` | `/api/v1/dashboard/summary` | Totais do período e saldos por conta. |
| `GET` | `/api/v1/dashboard/expenses-by-category` | Despesas agrupadas por categoria. |
| `GET` | `/api/v1/dashboard/cash-flow` | Série temporal diária ou mensal. |

### Criar conta

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H 'content-type: application/json' \
  -d '{
    "name": "Conta corrente",
    "type": "checking",
    "currency": "BRL",
    "openingBalanceCents": 150000
  }'
```

Tipos de conta aceitos: `cash`, `checking`, `savings`, `credit_card`, `investment` e `other`.

### Criar lançamento

```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H 'content-type: application/json' \
  -d '{
    "accountId": "UUID_DA_CONTA",
    "type": "expense",
    "amountCents": 12550,
    "category": "alimentação",
    "description": "Supermercado",
    "occurredOn": "2026-09-12",
    "metadata": { "source": "mobile" }
  }'
```

Tipos de lançamento: `income`, `expense`, `transfer_in` e `transfer_out`. Para transferências entre contas, prefira o endpoint dedicado abaixo.

### Criar transferência entre contas

```bash
curl -X POST http://localhost:3000/api/v1/transfers \
  -H 'content-type: application/json' \
  -d '{
    "fromAccountId": "UUID_CONTA_ORIGEM",
    "toAccountId": "UUID_CONTA_DESTINO",
    "amountCents": 30000,
    "description": "Reserva mensal",
    "occurredOn": "2026-09-12"
  }'
```

O endpoint grava dois lançamentos dentro da mesma transação: `transfer_out` na origem e `transfer_in` no destino.

### Consultar lançamentos

```bash
curl 'http://localhost:3000/api/v1/transactions?from=2026-09-01&to=2026-09-30&type=expense&limit=50&offset=0'
```

Filtros disponíveis: `accountId`, `type`, `category`, `from`, `to`, `limit` e `offset`. O limite padrão é 50 e o máximo é 200.

### Consultas para dashboard

Resumo do período:

```bash
curl 'http://localhost:3000/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30'
```

Despesas por categoria:

```bash
curl 'http://localhost:3000/api/v1/dashboard/expenses-by-category?from=2026-09-01&to=2026-09-30'
```

Fluxo mensal:

```bash
curl 'http://localhost:3000/api/v1/dashboard/cash-flow?from=2026-01-01&to=2026-12-31&groupBy=month'
```

`from` e `to` são opcionais nas consultas do dashboard. Quando omitidos, o período padrão é o primeiro dia do mês atual até a data atual. `groupBy` aceita `day` ou `month`.

As respostas seguem uma estrutura previsível. Listas retornam `data` e, quando aplicável, `pagination`; erros retornam `error.code`, `error.message` e detalhes de validação.

## Estrutura

```text
src/
  app.js                 # composição do Fastify e tratamento de erros
  server.js              # entrada do processo HTTP
  validation.js          # contratos de entrada e filtros
  routes/api.js          # endpoints REST
  db/database.js         # abertura do SQLite e execução de migrações
  db/repository.js       # persistência e consultas de domínio
migrations/              # SQL versionado
scripts/                 # migração e seed local
test/                    # testes de integração
```

## Migração futura para PostgreSQL

A aplicação já separa o repositório do transporte HTTP e mantém o contrato de dados independente do SQLite. A migração recomendada é:

1. criar um adaptador PostgreSQL com a mesma interface de `FinancialRepository`;
2. trocar `better-sqlite3` por um pool `pg` configurado via `DATABASE_URL`;
3. converter os IDs de `TEXT` para `UUID`, `active` de `INTEGER` para `BOOLEAN` e valores monetários para `BIGINT`;
4. substituir a expressão SQLite de agrupamento mensal (`substr`) por `date_trunc('month', occurred_on)`;
5. executar as migrações em uma janela controlada e validar saldos e totais por período;
6. manter a regra de transferência em transação, com as duas pontas gravadas ou nenhuma gravada.

Os SQLs de consulta específicos do banco estão concentrados em `src/db/repository.js`; portanto, o servidor e os contratos HTTP não precisam ser reescritos. Em produção, também é recomendável adicionar autenticação/autorização, auditoria, chave de idempotência para reenvio de requests e observabilidade antes de expor dados financeiros.
