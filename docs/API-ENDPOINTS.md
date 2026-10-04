# API Financeira — Referência de endpoints

## 1. Objetivo

Esta referência documenta todas as rotas HTTP disponíveis, parâmetros de caminho e query, campos de body, validações, respostas e regras de negócio. O prefixo `/api/v1` é aplicado a todos os endpoints listados, exceto quando indicado.

A API utiliza JSON nas requisições e nas respostas. Todos os valores monetários são representados em **centavos inteiros**. Portanto, `R$ 1.250,50` deve ser enviado como `125050`.

Nenhum endpoint implementa autenticação ou autorização nesta versão. Não exponha a API publicamente sem adicionar esses controles.

## 2. Pré-requisitos

Com a aplicação executando localmente, a URL base é:

```text
http://localhost:3000/api/v1
```

Para iniciar a aplicação localmente (na pasta do projeto):

```bash
npm install
npm run db:migrate
npm run dev
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

### Índice de rotas

Todas as rotas abaixo usam o prefixo `/api/v1`.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | Verifica se a API está disponível. |
| `POST` | `/accounts` | Cria uma conta. |
| `GET` | `/accounts` | Lista e filtra contas. |
| `GET` | `/accounts/:id` | Consulta uma conta pelo ID. |
| `PATCH` | `/accounts/:id` | Atualiza parcialmente uma conta. |
| `POST` | `/ambient` | Cria um ambiente. |
| `GET` | `/ambient` | Lista ambientes. |
| `GET` | `/ambient/:id` | Consulta um ambiente pelo ID. |
| `PATCH` | `/ambient/:id` | Atualiza parcialmente um ambiente. |
| `POST` | `/users` | Cria um usuário vinculado a um ambiente. |
| `GET` | `/users` | Lista usuários. |
| `GET` | `/users/:id` | Consulta um usuário pelo ID. |
| `GET` | `/users/chat/:chat_id` | Consulta um usuário pelo identificador do chat. |
| `PATCH` | `/users/:id` | Atualiza parcialmente um usuário. |
| `DELETE` | `/users/:id` | Exclui um usuário. |
| `POST` | `/transactions` | Registra uma receita ou despesa. |
| `GET` | `/transactions` | Lista e filtra lançamentos, com paginação. |
| `PATCH` | `/transactions/:id` | Atualiza um lançamento. |
| `DELETE` | `/transactions/:id` | Exclui um lançamento. |
| `POST` | `/transfers` | Registra uma transferência entre contas. |
| `PATCH` | `/transfers/:transferId` | Atualiza uma transferência. |
| `DELETE` | `/transfers/:transferId` | Exclui uma transferência. |
| `GET` | `/dashboard/summary` | Consulta totais e saldos do período. |
| `GET` | `/dashboard/expenses-by-category` | Agrupa despesas por categoria. |
| `GET` | `/dashboard/cash-flow` | Consulta o fluxo diário ou mensal. |

Nesta versão não existem `DELETE /accounts/:id` nem `DELETE /ambient/:id`; para contas e ambientes, use `PATCH` com `active: false`. Também não existe `GET /transfers/:transferId`; use o `transferId` retornado na criação para atualizar ou excluir a transferência.

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

Os bodies são validados como objetos estritos: propriedades não listadas para cada operação causam `400 VALIDATION_ERROR`. Strings com regra de trim são armazenadas sem espaços nas extremidades. `null` só é válido quando indicado como opção. Query parameters também são estritos em listagens; parâmetros desconhecidos nessas rotas resultam em `400`.

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

### Ambientes e usuários

Contas e lançamentos são associados diretamente a um ambiente por `ambientId`. Cada usuário também referencia um ambiente existente por `ambientId`. O tipo e o estado ativo pertencem ao ambiente, que também pode ter uma data de pagamento. Esta seção documenta todas as operações disponíveis para esses dois recursos.

Crie primeiro o ambiente:

```http
POST /api/v1/ambient
```

O body aceita os campos abaixo. Retorna `201 Created` com o ambiente criado dentro de `data`.

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `name` | string | Sim | De 1 a 120 caracteres após trim. |
| `type` | string | Sim | `standart`, `vip`, `pro` ou `premium`. |
| `active` | boolean | Não | Padrão `true`. |
| `datepayment` | `YYYY-MM-DD` ou `null` | Não | Data opcional; `null` limpa/informa ausência de data. |

```bash
curl -X POST http://localhost:3000/api/v1/ambient \
  -H 'Content-Type: application/json' \
  -d '{"name":"Plano principal","type":"standart","datepayment":"2026-10-15"}'
```

Depois crie o usuário com o ID do ambiente retornado. `name` e `ambientId` são obrigatórios; se `num_tel` ou `chat_id` forem omitidos, cada campo recebe a string `"0"`. A rota retorna `201 Created`.

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- |
| `name` | string | Sim | De 1 a 120 caracteres após trim. |
| `ambientId` | UUID | Sim | ID de um ambiente existente. |
| `num_tel` | string | Não | De 1 a 20 caracteres após trim; padrão `"0"`. |
| `chat_id` | string | Não | De 1 a 100 caracteres após trim; padrão `"0"`. |

Objetos de usuário retornam `active`, calculado pelo campo `active` do ambiente associado. Se o ambiente ou o valor estiver ausente/nulo, `active` é retornado como `false`.

```http
POST /api/v1/users
```

```bash
curl -X POST http://localhost:3000/api/v1/users -H 'Content-Type: application/json' -d '{"name":"Bruno","ambientId":"a1b2c3d4-e5f6-4789-8123-456789abcdef","num_tel":"5511999999999","chat_id":"chat-123"}'
```

`GET /api/v1/ambient` e `GET /api/v1/users` aceitam `includeInactive=true` para incluir ambientes inativos e usuários cujo ambiente está inativo. O padrão é `false`. Cada rota de listagem retorna `200 OK` e uma lista em `data`.

Na listagem de usuários, `ambientId` filtra pelo ambiente associado. Ele pode ser combinado com `includeInactive`:

| Query | Tipo | Obrigatório | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `ambientId` | UUID | Não | — | Retorna apenas usuários associados ao ambiente indicado. |
| `includeInactive` | `true` ou `false` | Não | `false` | Com `true`, inclui usuários cujo ambiente está inativo, mantendo o filtro `ambientId` se enviado. |

```bash
curl 'http://localhost:3000/api/v1/users?ambientId=a1b2c3d4-e5f6-4789-8123-456789abcdef&includeInactive=true'
```

| Operação | Parâmetros/body | Resultado |
| --- | --- | --- |
| `GET /api/v1/ambient/:id` | `id` na URL | `200` com o ambiente; se não existir, `404 AMBIENT_NOT_FOUND`. |
| `PATCH /api/v1/ambient/:id` | Um ou mais de `name`, `type`, `active`, `datepayment`; mesmas regras da criação | `200` com o ambiente atualizado. Body vazio retorna `400`; ID desconhecido retorna `404 NOT_FOUND`. |
| `GET /api/v1/users/:id` | `id` na URL | `200` com o usuário; se não existir, `404 USER_NOT_FOUND`. |
| `GET /api/v1/users/chat/:chat_id` | `chat_id` na URL | `200` com o usuário correspondente; sem correspondência, `404 USER_NOT_FOUND`. |
| `PATCH /api/v1/users/:id` | Um ou mais de `name`, `ambientId`, `num_tel`, `chat_id`; mesmas regras da criação | `200` com o usuário atualizado. O ambiente deve existir. |
| `DELETE /api/v1/users/:id` | `id` na URL; sem body | `200` com `{ "id": "<UUID>", "deleted": true }`; usuário desconhecido retorna `404 NOT_FOUND`. |

Exemplo de atualização de usuário:

```bash
curl -X PATCH http://localhost:3000/api/v1/users/123e4567-e89b-12d3-a456-426614174000 -H 'Content-Type: application/json' -d '{"num_tel":"5511888888888","chat_id":"chat-novo"}'
```

Excluir um usuário não exclui o ambiente associado nem contas ou lançamentos: esses recursos se relacionam ao ambiente, não ao usuário.

Não há rota para excluir ambientes. Use `PATCH /ambient/:id` com `{"active":false}` para desativar; usuários desse ambiente deixam de aparecer na listagem padrão, mas continuam acessíveis com `includeInactive=true`.

## 6. Passo 2 — Criar uma conta financeira

Antes de criar lançamentos, é necessário possuir pelo menos uma conta ativa.

### Endpoint

```http
POST /api/v1/accounts
```

### Corpo da requisição

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `name` | string | Sim | De 1 a 120 caracteres após trim. |
| `type` | string | Sim | `cash`, `checking`, `savings`, `credit_card`, `investment` ou `other`. |
| `currency` | string | Não | Três letras maiúsculas; padrão `BRL`. |
| `openingBalanceCents` | integer | Não | Saldo inicial em centavos; padrão `0`. Pode ser negativo. |
| `ambientId` | UUID ou `null` | Não | ID de ambiente existente; padrão `null`. |
| `active` | boolean | Não | Indica se aceita lançamentos; padrão `true`. |

### Exemplo

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Conta corrente",
    "type": "checking",
    "currency": "BRL",
    "openingBalanceCents": 150000,
    "ambientId": "a1b2c3d4-e5f6-4789-8123-456789abcdef"
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
    "ambientId": "a1b2c3d4-e5f6-4789-8123-456789abcdef",
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

Parâmetros aceitos:

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `includeInactive` | `true` ou `false` | Não | Inclui contas inativas. Padrão: `false`. |
| `ambientId` | UUID | Não | Filtra contas pelo ambiente associado. |

Exemplo: `GET /api/v1/accounts?ambientId=<UUID>&includeInactive=true`.

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
      "ambientId": "a1b2c3d4-e5f6-4789-8123-456789abcdef",
      "active": true,
      "createdAt": "2026-09-12T19:30:00.000Z",
      "updatedAt": "2026-09-12T19:30:00.000Z"
    }
  ]
}
```

### Consultar conta por ID

```http
GET /api/v1/accounts/:id
```

Substitua `:id` pelo UUID da conta. A resposta `200` contém a conta em `data`; se o ID não existir, a API retorna `404` com o código `ACCOUNT_NOT_FOUND`.

### Atualizar dados da conta

Use `PATCH` para alterar somente os campos necessários. O campo `id` da URL é o ID retornado na criação da conta.

```http
PATCH /api/v1/accounts/:id
```

Campos aceitos: `name`, `type`, `currency`, `openingBalanceCents`, `ambientId` e `active`, com as mesmas regras da criação. `ambientId: null` remove a associação ao ambiente. Pelo menos um campo deve ser enviado; body vazio ou propriedade desconhecida resulta em `400 VALIDATION_ERROR`.

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
    "ambientId": "a1b2c3d4-e5f6-4789-8123-456789abcdef",
    "active": true,
    "createdAt": "2026-09-12T19:30:00.000Z",
    "updatedAt": "2026-09-13T00:00:00.000Z"
  }
}
```

A alteração de `openingBalanceCents` modifica o saldo inicial usado nos cálculos de saldo. Em produção, essa alteração deve ser permitida somente a usuários autorizados.

Não há rota para excluir contas. Use `PATCH /accounts/:id` com `{"active":false}` para desativar; uma conta inativa não aceita lançamentos nem pode ser usada em novas transferências.

## 8. Passo 4 — Criar receita ou despesa

Use este endpoint para registrar uma entrada ou uma saída financeira em uma conta.

### Endpoint

```http
POST /api/v1/transactions
```

### Corpo da requisição

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `accountId` | UUID | Sim | ID de uma conta existente e ativa. |
| `ambientId` | UUID ou `null` | Não | Ambiente existente; se omitido, herda o ambiente da conta. `null` remove o vínculo. |
| `type` | string | Sim | `income`, `expense`, `transfer_in` ou `transfer_out`. Use `/transfers` para transferências entre contas. |
| `amountCents` | integer positivo | Sim | Valor em centavos, maior que zero. |
| `category` | string ou `null` | Não | Até 80 caracteres após trim. |
| `description` | string ou `null` | Não | Até 500 caracteres após trim. |
| `occurredOn` | `YYYY-MM-DD` | Sim | Data do lançamento. |
| `metadata` | objeto ou `null` | Não | Objeto JSON livre para informações adicionais. |

Para uma receita, use `type: "income"`. Para uma despesa, use `type: "expense"`.

### Exemplo de receita

```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H 'Content-Type: application/json' \
  -d '{
    "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
    "ambientId": "a1b2c3d4-e5f6-4789-8123-456789abcdef",
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
    "ambientId": "a1b2c3d4-e5f6-4789-8123-456789abcdef",
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

O sentido do lançamento é definido por `type`; `amountCents` deve sempre ser positivo. Conta inexistente ou ambiente inexistente resulta em `404 NOT_FOUND`; conta inativa resulta em `409 CONFLICT`.

Embora o schema de lançamento aceite `transfer_in` e `transfer_out`, eles não criam uma transferência vinculada com `transferId`. Para operações entre contas, use sempre `POST /transfers`; lançamentos de transferência não podem ser alterados ou excluídos individualmente.

### Atualizar uma transação

Use `PATCH` para alterar parcialmente um lançamento existente. O ID pode ser obtido no retorno do `POST /transactions` ou na listagem de transações.

```http
PATCH /api/v1/transactions/:id
```

Campos aceitos e regras:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `accountId` | UUID | Conta existente e ativa. Ao alterar a conta, o ambiente do lançamento não muda automaticamente. |
| `ambientId` | UUID ou `null` | Ambiente existente ou `null` para remover a associação. |
| `type` | string | Um dos quatro tipos aceitos na criação; tipos de transferência não podem ser usados para criar/alterar transferências por esta rota. |
| `amountCents` | integer | Maior que zero. |
| `category` | string ou `null` | Até 80 caracteres após trim. |
| `description` | string ou `null` | Até 500 caracteres após trim. |
| `occurredOn` | string | Formato `YYYY-MM-DD`. |
| `metadata` | objeto ou `null` | Objeto JSON livre. |

Envie pelo menos um campo. Propriedade não listada ou body vazio retorna `400 VALIDATION_ERROR`.

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
| `amountCents` | integer positivo | Sim | Valor transferido em centavos, maior que zero. |
| `description` | string ou `null` | Não | Até 500 caracteres após trim. Se omitida, vazia ou `null`, usa `Transferência entre contas`. |
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

As contas devem existir, estar ativas e ser diferentes. Contas iguais ou inativas retornam `409 CONFLICT`; conta inexistente retorna `404 NOT_FOUND`.

### Atualizar transferência

```http
PATCH /api/v1/transfers/:transferId
```

O parâmetro `transferId` é o identificador retornado pelo `POST /transfers`. Envie um ou mais destes campos no corpo JSON:

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `fromAccountId` | UUID | Não | Nova conta de origem. |
| `toAccountId` | UUID | Não | Nova conta de destino. |
| `amountCents` | integer positivo | Não | Novo valor em centavos, maior que zero. |
| `description` | string ou `null` | Não | Até 500 caracteres; `null` limpa a descrição. |
| `occurredOn` | `YYYY-MM-DD` | Não | Nova data da transferência. |

Exemplo:

```bash
curl -X PATCH http://localhost:3000/api/v1/transfers/2accc208-f1c2-4c74-a7e3-f82f1e0c21a \
  -H 'Content-Type: application/json' \
  -d '{"amountCents":35000,"description":"Reserva atualizada"}'
```

A resposta `200` contém em `data` `transferId`, `fromAccountId`, `toAccountId`, `amountCents`, `description` e `occurredOn`. Contas de origem e destino precisam ser diferentes; uma conta substituta deve existir e estar ativa. Conflitos retornam `409 CONFLICT`; transferência ou conta inexistente retorna `404 NOT_FOUND`.

### Excluir transferência

```http
DELETE /api/v1/transfers/:transferId
```

Exclui os dois lançamentos que compõem a transferência. Exemplo:

```bash
curl -X DELETE http://localhost:3000/api/v1/transfers/2accc208-f1c2-4c74-a7e3-f82f1e0c21a
```

Resposta `200 OK`:

```json
{
  "data": {
    "transferId": "2accc208-f1c2-4c74-a7e3-f82f1e0c21a",
    "deleted": true
  }
}
```

## 10. Passo 6 — Consultar lançamentos

### Endpoint

```http
GET /api/v1/transactions
```

### Parâmetros de consulta

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `accountId` | UUID | Não | Filtra por conta. |
| `ambientId` | UUID | Não | Filtra pelo ambiente associado ao lançamento. |
| `type` | string | Não | `income`, `expense`, `transfer_in` ou `transfer_out`. |
| `category` | string | Não | Até 80 caracteres; comparação não diferencia maiúsculas/minúsculas. |
| `from` | `YYYY-MM-DD` | Não | Data inicial inclusiva. |
| `to` | `YYYY-MM-DD` | Não | Data final inclusiva. |
| `limit` | integer | Não | Itens por página; padrão `50`, mínimo `1`, máximo `200`. |
| `offset` | integer | Não | Itens ignorados; padrão `0`, deve ser maior ou igual a zero. |

### Exemplo

```bash
curl 'http://localhost:3000/api/v1/transactions?accountId=d91b76df-918f-4b5e-ac6d-0e8597e12acf&ambientId=a1b2c3d4-e5f6-4789-8123-456789abcdef&from=2026-09-01&to=2026-09-30&type=expense&limit=20&offset=0'
```

Os parâmetros `from` e `to` aceitam datas no formato `YYYY-MM-DD`; `ambientId` filtra os lançamentos associados ao ambiente. Os filtros podem ser combinados. Propriedades de query desconhecidas são rejeitadas com `400 VALIDATION_ERROR`.

### Resposta `200 OK`

```json
{
  "data": [
    {
      "id": "c1e7fd2e-a282-44ea-9acf-7f28c9e8d5d1",
      "accountId": "d91b76df-918f-4b5e-ac6d-0e8597e12acf",
      "accountName": "Conta corrente",
      "ambientId": "a1b2c3d4-e5f6-4789-8123-456789abcdef",
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
| `ambientId` | UUID | Não | Restringe os lançamentos ao ambiente; a lista de saldos inclui somente contas ativas desse ambiente. |

### Exemplo

```bash
curl 'http://localhost:3000/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30&ambientId=a1b2c3d4-e5f6-4789-8123-456789abcdef'
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

`transactionCount` conta todos os tipos de lançamento no período. A lista `balances` inclui somente contas ativas e calcula saldo inicial mais lançamentos até `to`; o saldo não é limitado pelo início `from`. Os filtros `accountId` e `ambientId` podem ser combinados. Quando `ambientId` é informado, os totais usam lançamentos marcados com esse ambiente e os saldos mostram contas associadas a ele.

## 12. Passo 8 — Consultar despesas por categoria

Este endpoint é indicado para gráfico de pizza, barras ou ranking de despesas.

### Endpoint

```http
GET /api/v1/dashboard/expenses-by-category
```

Parâmetros aceitos:

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `from` | `YYYY-MM-DD` | Não | Início do período. Padrão: primeiro dia do mês atual. |
| `to` | `YYYY-MM-DD` | Não | Fim do período. Padrão: data atual. |
| `accountId` | UUID | Não | Restringe as despesas a uma conta. |
| `ambientId` | UUID | Não | Restringe as despesas aos lançamentos associados ao ambiente. |

### Exemplo

```bash
curl 'http://localhost:3000/api/v1/dashboard/expenses-by-category?from=2026-09-01&to=2026-09-30&ambientId=a1b2c3d4-e5f6-4789-8123-456789abcdef'
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

Este endpoint aceita os parâmetros de período `from` e `to` e os filtros opcionais `accountId` e `ambientId` descritos no resumo. Além deles, aceita:

| Parâmetro | Valores | Padrão | Descrição |
| --- | --- | --- | --- |
| `groupBy` | `day` ou `month` | `day` | Define a granularidade da série. |

Se `groupBy` tiver qualquer outro valor, a API retorna `400 VALIDATION_ERROR`.

### Exemplo diário

```bash
curl 'http://localhost:3000/api/v1/dashboard/cash-flow?from=2026-09-01&to=2026-09-30&ambientId=a1b2c3d4-e5f6-4789-8123-456789abcdef&groupBy=day'
```

### Exemplo mensal

```bash
curl 'http://localhost:3000/api/v1/dashboard/cash-flow?from=2026-01-01&to=2026-12-31&groupBy=month'
```

`transferCents` soma os lançamentos `transfer_in` e `transfer_out`. Sem filtro por conta, uma transferência entre duas contas contribui com duas pontas para esse total. `netCents` é calculado como `incomeCents - expenseCents`.

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
| `400` | `VALIDATION_ERROR` | Body ou parâmetro de query inválido. |
| `400` | `INVALID_REFERENCE` | Referência rejeitada pela integridade do banco. |
| `404` | `NOT_FOUND` | Recurso necessário para a operação não existe. |
| `404` | `ACCOUNT_NOT_FOUND`, `USER_NOT_FOUND`, `AMBIENT_NOT_FOUND` | Consulta direta ao recurso correspondente não encontra o ID. |
| `409` | `CONFLICT` | Regra de negócio violada ou registro duplicado. |
| `500` | `INTERNAL_ERROR` | Falha inesperada no servidor. |

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

Erros de domínio usam `{ "error": { "code": "NOT_FOUND" ou "CONFLICT", "message": "..." } }`. IDs de conta, ambiente ou usuário informados em bodies também podem resultar em `404 NOT_FOUND` quando não existirem. Datas são verificadas pelo formato `YYYY-MM-DD`; essa validação não verifica se o dia existe no calendário. Em produção, erros `500` retornam mensagem genérica; em desenvolvimento podem expor a mensagem técnica.

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
