# Documentação da API Financeira

## 1. Objetivo

Esta documentação descreve como consumir a API financeira passo a passo. O fluxo recomendado é criar as contas, registrar os lançamentos, consultar os lançamentos quando necessário e utilizar os endpoints de dashboard para alimentar gráficos e indicadores.

A API utiliza JSON nas requisições e nas respostas. Todos os valores monetários são representados em **centavos inteiros**. Portanto, `R$ 1.250,50` deve ser enviado como `125050`.

## 2. Pré-requisitos

Com a aplicação executando localmente, a URL base é:

```text
http://localhost:3000/api/v1
```

Para iniciar a aplicação:

```bash
cd /home/ubuntu/financial-api
npm install
cp .env.example .env
npm run db:migrate
npm start
```

A API pode ser testada com `curl`, Postman, Insomnia ou qualquer cliente HTTP.

## 3. Padrão geral das requisições

As requisições que possuem corpo devem informar o cabeçalho `Content-Type`:

```http
Content-Type: application/json
```

Exemplo genérico:

```bash
curl -X POST http://localhost:3000/api/v1/endpoint \
  -H 'Content-Type: application/json' \
  -d '{"campo":"valor"}'
```

As respostas de sucesso que retornam um objeto usam o formato:

```json
{
  "data": {}
}
```

As respostas de sucesso que retornam uma lista usam o formato:

```json
{
  "data": []
}
```

Os erros usam o formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": []
  }
}
```

## 4. Fluxo recomendado de integração

A ordem abaixo deve ser utilizada por uma aplicação cliente nova.

| Passo | Ação | Endpoint |
| --- | --- | --- |
| 1 | Verificar se a API está disponível | `GET /health` |
| 2 | Criar as contas financeiras | `POST /accounts` |
| 3 | Guardar os IDs das contas retornados | Resposta do passo 2 |
| 4 | Atualizar dados de uma conta quando necessário | `PATCH /accounts/:id` |
| 5 | Registrar receitas e despesas | `POST /transactions` |
| 6 | Atualizar um lançamento | `PATCH /transactions/:id` |
| 7 | Excluir um lançamento | `DELETE /transactions/:id` |
| 8 | Registrar transferências entre contas | `POST /transfers` |
| 9 | Consultar lançamentos | `GET /transactions` |
| 10 | Alimentar cards de resumo | `GET /dashboard/summary` |
| 11 | Alimentar gráfico por categoria | `GET /dashboard/expenses-by-category` |
| 12 | Alimentar gráfico de evolução | `GET /dashboard/cash-flow` |

O `id` retornado ao criar uma conta deve ser armazenado pelo sistema cliente. Esse ID será utilizado em `accountId`, `fromAccountId` e `toAccountId`.

## 5. Passo 1 — Verificar a disponibilidade da API

### Requisição

```http
GET /api/v1/health
```

Exemplo:

```bash
curl http://localhost:3000/api/v1/health
```

### Resposta `200 OK`

```json
{
  "status": "ok",
  "service": "financial-api",
  "timestamp": "2026-09-12T19:30:00.000Z"
}
```

Esse endpoint não exige autenticação na versão atual e deve ser utilizado pelo monitoramento da aplicação.

## 6. Passo 2 — Criar uma conta financeira

Antes de criar lançamentos, é necessário possuir pelo menos uma conta ativa.

### Endpoint

```http
POST /api/v1/accounts
```

### Corpo da requisição

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `name` | string | Sim | Nome da conta. |
| `type` | string | Sim | Tipo da conta. |
| `currency` | string | Não | Código de três letras. Padrão: `BRL`. |
| `openingBalanceCents` | integer | Não | Saldo inicial em centavos. Padrão: `0`. |
| `active` | boolean | Não | Indica se a conta aceita lançamentos. Padrão: `true`. |

Tipos aceitos para `type`:

```text
cash, checking, savings, credit_card, investment, other
```

### Exemplo

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Conta corrente",
    "type": "checking",
    "currency": "BRL",
    "openingBalanceCents": 150000
  }'
```

### Resposta `201 Created`

```json
{
  "data": {
    "id": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "name": "Conta corrente",
    "type": "checking",
    "currency": "BRL",
    "openingBalanceCents": 150000,
    "active": true,
    "createdAt": "2026-09-12T19:30:00.000Z",
    "updatedAt": "2026-09-12T19:30:00.000Z"
  }
}
```

Guarde o valor de `data.id`. Ele será usado nos próximos passos.

## 7. Passo 3 — Listar contas

### Endpoint

```http
GET /api/v1/accounts
```

Por padrão, somente contas ativas são retornadas.

### Exemplo

```bash
curl http://localhost:3000/api/v1/accounts
```

Para incluir contas inativas:

```bash
curl 'http://localhost:3000/api/v1/accounts?includeInactive=true'
```

### Resposta `200 OK`

```json
{
  "data": [
    {
      "id": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
      "name": "Conta corrente",
      "type": "checking",
      "currency": "BRL",
      "openingBalanceCents": 150000,
      "active": true,
      "createdAt": "2026-09-12T19:30:00.000Z",
      "updatedAt": "2026-09-12T19:30:00.000Z"
    }
  ]
}
```

### Atualizar dados da conta

Use `PATCH` para alterar somente os campos necessários. O campo `id` da URL é o ID retornado na criação da conta.

```http
PATCH /api/v1/accounts/:id
```

Campos aceitos: `name`, `type`, `currency`, `openingBalanceCents` e `active`. Pelo menos um campo deve ser enviado.

Exemplo:

```bash
curl -X PATCH http://localhost:3000/api/v1/accounts/d91b76df-918f-4b5e-ac6d-0e8597e12acf \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Conta corrente principal",
    "active": true
  }'
```

Resposta `200 OK`:

```json
{
  "data": {
    "id": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "name": "Conta corrente principal",
    "type": "checking",
    "currency": "BRL",
    "openingBalanceCents": 150000,
    "active": true,
    "createdAt": "2026-09-12T19:30:00.000Z",
    "updatedAt": "2026-09-13T00:00:00.000Z"
  }
}
```

A alteração de `openingBalanceCents` modifica o saldo inicial usado nos cálculos de saldo. Em produção, essa alteração deve ser permitida somente a usuários autorizados.

## 8. Passo 4 — Criar receita ou despesa

Use este endpoint para registrar uma entrada ou uma saída financeira em uma conta.

### Endpoint

```http
POST /api/v1/transactions
```

### Corpo da requisição

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `accountId` | UUID | Sim | ID da conta existente. |
| `type` | string | Sim | `income`, `expense`, `transfer_in` ou `transfer_out`. |
| `amountCents` | integer positivo | Sim | Valor em centavos. |
| `category` | string | Não | Categoria do lançamento. |
| `description` | string | Não | Descrição livre. |
| `occurredOn` | `YYYY-MM-DD` | Sim | Data em que ocorreu. |
| `metadata` | objeto | Não | Dados adicionais do lançamento. |

Para uma receita, use `type: "income"`. Para uma despesa, use `type: "expense"`.

### Exemplo de receita

```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H 'Content-Type: application/json' \
  -d '{
    "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "type": "income",
    "amountCents": 500000,
    "category": "salário",
    "description": "Recebimento mensal",
    "occurredOn": "2026-09-01"
  }'
```

### Exemplo de despesa

```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H 'Content-Type: application/json' \
  -d '{
    "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "type": "expense",
    "amountCents": 12550,
    "category": "alimentação",
    "description": "Supermercado",
    "occurredOn": "2026-09-03",
    "metadata": {
      "paymentMethod": "debit_card"
    }
  }'
```

### Resposta `201 Created`

```json
{
  "data": {
    "id": "c1e7fd2e-a282-44ea-9acf-7f28c9e8d5d1",
    "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "accountName": "Conta corrente",
    "type": "expense",
    "amountCents": 12550,
    "category": "alimentação",
    "description": "Supermercado",
    "occurredOn": "2026-09-03",
    "metadata": {
      "paymentMethod": "debit_card"
    },
    "createdAt": "2026-09-12T19:30:00.000Z"
  }
}
```

Não envie valores negativos. O sentido do lançamento é definido pelo campo `type`.

### Atualizar uma transação

Use `PATCH` para alterar parcialmente um lançamento existente. O ID pode ser obtido no retorno do `POST /transactions` ou na listagem de transações.

```http
PATCH /api/v1/transactions/:id
```

Campos aceitos: `accountId`, `type`, `amountCents`, `category`, `description`, `occurredOn` e `metadata`. Envie pelo menos um campo.

Exemplo:

```bash
curl -X PATCH http://localhost:3000/api/v1/transactions/c1e7fd2e-a282-44ea-9acf-7f28c9e8d5d1 \
  -H 'Content-Type: application/json' \
  -d '{
    "amountCents": 14500,
    "category": "alimentação",
    "description": "Supermercado atualizado"
  }'
```

Resposta `200 OK`:

```json
{
  "data": {
    "id": "c1e7fd2e-a282-44ea-9acf-7f28c9e8d5d1",
    "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "accountName": "Conta corrente principal",
    "type": "expense",
    "amountCents": 14500,
    "category": "alimentação",
    "description": "Supermercado atualizado",
    "occurredOn": "2026-09-03",
    "metadata": null,
    "createdAt": "2026-09-12T19:30:00.000Z"
  }
}
```

### Excluir uma transação

Use `DELETE` somente quando o lançamento realmente não deve mais existir. Essa operação remove o registro do SQLite e altera os saldos e os indicadores do dashboard.

```http
DELETE /api/v1/transactions/:id
```

Exemplo:

```bash
curl -X DELETE http://localhost:3000/api/v1/transactions/c1e7fd2e-a282-44ea-9acf-7f28c9e8d5d1
```

Resposta `200 OK`:

```json
{
  "data": {
    "id": "c1e7fd2e-a282-44ea-9acf-7f28c9e8d5d1",
    "deleted": true
  }
}
```

Transações do tipo `transfer_in` e `transfer_out` não podem ser atualizadas ou excluídas individualmente, pois formam duas pontas de uma transferência. A API retorna `409 CONFLICT` nesses casos para evitar inconsistência entre contas.

## 9. Passo 5 — Criar transferência entre contas

Use este endpoint quando o dinheiro mudar de uma conta para outra. Não crie manualmente apenas um lançamento, porque a transferência precisa gerar as duas pontas.

### Endpoint

```http
POST /api/v1/transfers
```

### Corpo da requisição

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `fromAccountId` | UUID | Sim | Conta de origem. |
| `toAccountId` | UUID | Sim | Conta de destino. |
| `amountCents` | integer positivo | Sim | Valor transferido em centavos. |
| `description` | string | Não | Descrição da transferência. |
| `occurredOn` | `YYYY-MM-DD` | Sim | Data da transferência. |

### Exemplo

```bash
curl -X POST http://localhost:3000/api/v1/transfers \
  -H 'Content-Type: application/json' \
  -d '{
    "fromAccountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "toAccountId": "5011efd3-4e64-4c08-a97b-479291d8c1fb",
    "amountCents": 30000,
    "description": "Reserva mensal",
    "occurredOn": "2026-09-10"
  }'
```

### Resposta `201 Created`

```json
{
  "data": {
    "transferId": "2accc208-f1c2-4c74-a7e3-f82f1e0c21a",
    "fromAccountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "toAccountId": "5011efd3-4e64-4c08-a97b-479291d8c1fb",
    "amountCents": 30000,
    "occurredOn": "2026-09-10"
  }
}
```

A API grava `transfer_out` na conta de origem e `transfer_in` na conta de destino dentro da mesma transação. Se uma das gravações falhar, nenhuma das duas é mantida.

## 10. Passo 6 — Consultar lançamentos

### Endpoint

```http
GET /api/v1/transactions
```

### Parâmetros de consulta

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `accountId` | UUID | Não | Filtra por conta. |
| `type` | string | Não | Filtra por tipo de lançamento. |
| `category` | string | Não | Filtra por categoria. |
| `from` | `YYYY-MM-DD` | Não | Data inicial. |
| `to` | `YYYY-MM-DD` | Não | Data final. |
| `limit` | integer | Não | Quantidade por página. Padrão `50`, máximo `200`. |
| `offset` | integer | Não | Quantidade de registros ignorados. Padrão `0`. |

### Exemplo

```bash
curl 'http://localhost:3000/api/v1/transactions?accountId=d91b76df-918f-4b5e-ac6d-0e8597e12acf&from=2026-09-01&to=2026-09-30&type=expense&limit=20&offset=0'
```

### Resposta `200 OK`

```json
{
  "data": [
    {
      "id": "c1e7fd2e-a282-44ea-9acf-7f28c9e8d5d1",
      "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
      "accountName": "Conta corrente",
      "type": "expense",
      "amountCents": 12550,
      "category": "alimentação",
      "description": "Supermercado",
      "occurredOn": "2026-09-03",
      "metadata": null,
      "createdAt": "2026-09-12T19:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

Para obter a página seguinte, aumente `offset` pelo valor de `limit`.

## 11. Passo 7 — Consultar o resumo do dashboard

Este endpoint deve alimentar cards como receitas, despesas, saldo líquido, número de lançamentos e saldo atual por conta.

### Endpoint

```http
GET /api/v1/dashboard/summary
```

### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `from` | `YYYY-MM-DD` | Não | Início do período. Padrão: primeiro dia do mês atual. |
| `to` | `YYYY-MM-DD` | Não | Fim do período. Padrão: data atual. |
| `accountId` | UUID | Não | Restringe o resultado a uma conta. |

### Exemplo

```bash
curl 'http://localhost:3000/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30'
```

### Resposta `200 OK`

```json
{
  "data": {
    "period": {
      "from": "2026-09-01",
      "to": "2026-09-30"
    },
    "incomeCents": 500000,
    "expenseCents": 101500,
    "netCents": 398500,
    "transferInCents": 0,
    "transferOutCents": 0,
    "transactionCount": 3,
    "balances": [
      {
        "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
        "name": "Conta corrente",
        "currency": "BRL",
        "balanceCents": 561000
      }
    ]
  }
}
```

`netCents` é calculado como `incomeCents - expenseCents`. Transferências não alteram o patrimônio total, pois representam somente movimentações entre contas.

## 12. Passo 8 — Consultar despesas por categoria

Este endpoint é indicado para gráfico de pizza, barras ou ranking de despesas.

### Endpoint

```http
GET /api/v1/dashboard/expenses-by-category
```

### Exemplo

```bash
curl 'http://localhost:3000/api/v1/dashboard/expenses-by-category?from=2026-09-01&to=2026-09-30'
```

### Resposta `200 OK`

```json
{
  "data": [
    {
      "category": "moradia",
      "amountCents": 89000,
      "transactionCount": 1
    },
    {
      "category": "alimentação",
      "amountCents": 12500,
      "transactionCount": 1
    }
  ]
}
```

Lançamentos sem categoria são agrupados em `Sem categoria`.

## 13. Passo 9 — Consultar fluxo de caixa

Este endpoint deve alimentar um gráfico de linha ou colunas com a evolução financeira.

### Endpoint

```http
GET /api/v1/dashboard/cash-flow
```

### Parâmetros

Além de `from`, `to` e `accountId`, este endpoint aceita:

| Parâmetro | Valores | Padrão | Descrição |
| --- | --- | --- | --- |
| `groupBy` | `day` ou `month` | `day` | Define a granularidade da série. |

### Exemplo diário

```bash
curl 'http://localhost:3000/api/v1/dashboard/cash-flow?from=2026-09-01&to=2026-09-30&groupBy=day'
```

### Exemplo mensal

```bash
curl 'http://localhost:3000/api/v1/dashboard/cash-flow?from=2026-01-01&to=2026-12-31&groupBy=month'
```

### Resposta `200 OK`

```json
{
  "data": [
    {
      "period": "2026-09",
      "incomeCents": 500000,
      "expenseCents": 101500,
      "transferCents": 0,
      "netCents": 398500
    }
  ]
}
```

## 14. Códigos HTTP e tratamento de erros

| Código | Significado | Exemplo |
| --- | --- | --- |
| `200` | Consulta realizada com sucesso. | Dashboard e listagens. |
| `201` | Registro criado com sucesso. | Conta, lançamento ou transferência. |
| `400` | Dados inválidos ou parâmetros incorretos. | Data inválida ou campo ausente. |
| `404` | Recurso não encontrado. | Conta inexistente. |
| `409` | Conflito de regra de negócio. | Transferência para a mesma conta. |
| `500` | Erro inesperado no servidor. | Falha interna não tratada. |

Exemplo de validação inválida:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": [
      {
        "path": ["amountCents"],
        "message": "Number must be greater than 0"
      }
    ]
  }
}
```

## 15. Exemplo completo em sequência

O exemplo abaixo cria duas contas, cria uma receita, registra uma despesa, faz uma transferência e consulta o dashboard.

```bash
BASE_URL=http://localhost:3000/api/v1

# 1. Criar a conta corrente.
ACCOUNT_A=$(curl -s -X POST "$BASE_URL/accounts" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Conta corrente","type":"checking","currency":"BRL"}')

# 2. Extrair o ID da conta A usando jq.
ACCOUNT_A_ID=$(echo "$ACCOUNT_A" | jq -r '.data.id')

# 3. Criar a conta poupança.
ACCOUNT_B=$(curl -s -X POST "$BASE_URL/accounts" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Poupança","type":"savings","currency":"BRL"}')
ACCOUNT_B_ID=$(echo "$ACCOUNT_B" | jq -r '.data.id')

# 4. Registrar uma receita.
curl -s -X POST "$BASE_URL/transactions" \
  -H 'Content-Type: application/json' \
  -d "{\"accountId\":\"$ACCOUNT_A_ID\",\"type\":\"income\",\"amountCents\":500000,\"category\":\"salário\",\"occurredOn\":\"2026-09-01\"}"

# 5. Registrar uma despesa.
curl -s -X POST "$BASE_URL/transactions" \
  -H 'Content-Type: application/json' \
  -d "{\"accountId\":\"$ACCOUNT_A_ID\",\"type\":\"expense\",\"amountCents\":12550,\"category\":\"alimentação\",\"occurredOn\":\"2026-09-03\"}"

# 6. Transferir dinheiro da conta corrente para a poupança.
curl -s -X POST "$BASE_URL/transfers" \
  -H 'Content-Type: application/json' \
  -d "{\"fromAccountId\":\"$ACCOUNT_A_ID\",\"toAccountId\":\"$ACCOUNT_B_ID\",\"amountCents\":30000,\"occurredOn\":\"2026-09-10\"}"

# 7. Consultar os indicadores do mês.
curl -s "$BASE_URL/dashboard/summary?from=2026-09-01&to=2026-09-30"

# 8. Consultar a série mensal.
curl -s "$BASE_URL/dashboard/cash-flow?from=2026-09-01&to=2026-09-30&groupBy=month"
```

## 16. Recomendações para o cliente

O cliente deve validar o status HTTP antes de ler `data`. Em respostas de erro, o cliente deve exibir ou registrar `error.code` e `error.message`.

O cliente deve enviar datas no formato `YYYY-MM-DD`. Horários não devem ser enviados no campo `occurredOn`.

O cliente deve manter os valores em centavos durante os cálculos. A conversão para moeda formatada deve ocorrer apenas na camada de apresentação.

O cliente deve consultar o resumo e os gráficos sempre com o mesmo intervalo de datas para evitar indicadores inconsistentes.

Para telas de listagem, o cliente deve usar `limit` e `offset` e não deve solicitar mais de 200 registros por requisição.

Em produção, a API deve receber autenticação, autorização por usuário ou organização, auditoria e proteção contra reenvio acidental da mesma requisição.

## Referências

[1]: ../README.md "README do projeto Financial API"
[2]: ../migrations/001_initial.sql "Migração inicial do banco de dados"
[3]: ../src/routes/api.js "Rotas HTTP da API"
[4]: ../src/validation.js "Schemas de validação da API"
