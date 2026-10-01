const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { DatabaseClient } = require('../src/db/database');
const { createApp } = require('../src/app');

let app;
let database;
let tempDir;

function payload(response) {
  return response.body.data;
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-api-'));
  database = new DatabaseClient({ filename: path.join(tempDir, 'test.sqlite') });
  database.migrate();
  app = createApp({ database, logger: false });
  await app.ready();
});

test.after(async () => {
  await app.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('health check', async () => {
  const response = await request(app.server).get('/api/v1/health').expect(200);
  assert.equal(response.body.status, 'ok');
});

test('associa painel a contas e transações e filtra consultas por painel', async () => {
  const painel = payload(await request(app.server)
    .post('/api/v1/painel')
    .send({ name: 'Painel integração', type: 'standart', num_tel: '5511999999999', chat_id: 'chat-1' })
    .expect(201));

  const painelByChatId = await request(app.server)
    .get('/api/v1/painel/chat/chat-1')
    .expect(200);
  assert.deepEqual(painelByChatId.body.data, painel);

  const missingPainel = await request(app.server)
    .get('/api/v1/painel/chat/chat-ausente')
    .expect(404);
  assert.equal(missingPainel.body.error.code, 'PAINEL_NOT_FOUND');

  const account = payload(await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Conta do painel', type: 'checking', painelId: painel.id })
    .expect(201));
  assert.equal(account.painelId, painel.id);

  const transaction = payload(await request(app.server)
    .post('/api/v1/transactions')
    .send({
      accountId: account.id,
      painelId: painel.id,
      type: 'income',
      amountCents: 5000,
      occurredOn: '2026-09-20',
    })
    .expect(201));
  assert.equal(transaction.painelId, painel.id);

  const accounts = await request(app.server)
    .get(`/api/v1/accounts?painelId=${painel.id}`)
    .expect(200);
  assert.deepEqual(accounts.body.data.map((item) => item.id), [account.id]);

  const transactions = await request(app.server)
    .get(`/api/v1/transactions?painelId=${painel.id}`)
    .expect(200);
  assert.deepEqual(transactions.body.data.map((item) => item.id), [transaction.id]);
});

test('cria contas, lançamento e consulta resumo', async () => {
  const accountResponse = await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Conta principal', type: 'checking', currency: 'BRL', openingBalanceCents: 100000 })
    .expect(201);
  const account = payload(accountResponse);
  assert.equal(account.openingBalanceCents, 100000);

  await request(app.server)
    .post('/api/v1/transactions')
    .send({
      accountId: account.id,
      type: 'income',
      amountCents: 500000,
      category: 'salário',
      occurredOn: '2026-09-01',
    })
    .expect(201);

  await request(app.server)
    .post('/api/v1/transactions')
    .send({
      accountId: account.id,
      type: 'expense',
      amountCents: 12500,
      category: 'alimentação',
      occurredOn: '2026-09-02',
    })
    .expect(201);

  const summaryResponse = await request(app.server)
    .get('/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30')
    .expect(200);
  const summary = payload(summaryResponse);
  assert.equal(summary.incomeCents, 500000);
  assert.equal(summary.expenseCents, 12500);
  assert.equal(summary.netCents, 487500);
  assert.equal(summary.balances[0].balanceCents, 587500);
});

test('cria transferência atômica e retorna fluxo de caixa mensal', async () => {
  const first = payload(await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Origem', type: 'checking' }).expect(201));
  const second = payload(await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Destino', type: 'savings' }).expect(201));

  const transferResponse = await request(app.server)
    .post('/api/v1/transfers')
    .send({
      fromAccountId: first.id,
      toAccountId: second.id,
      amountCents: 30000,
      occurredOn: '2026-09-10',
    })
    .expect(201);
  assert.equal(transferResponse.body.data.amountCents, 30000);

  const transactionsResponse = await request(app.server)
    .get(`/api/v1/transactions?from=2026-09-01&to=2026-09-30&limit=10`)
    .expect(200);
  assert.equal(transactionsResponse.body.pagination.total, 4);

  const flowResponse = await request(app.server)
    .get('/api/v1/dashboard/cash-flow?from=2026-09-01&to=2026-09-30&groupBy=month')
    .expect(200);
  assert.equal(flowResponse.body.data[0].period, '2026-09');
  assert.equal(flowResponse.body.data[0].transferCents, 60000);
});

test('rejeita payload inválido e conta inexistente', async () => {
  const invalid = await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: '', type: 'invalid' })
    .expect(400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  const missing = await request(app.server)
    .post('/api/v1/transactions')
    .send({ accountId: '00000000-0000-0000-0000-000000000000', type: 'expense', amountCents: 10, occurredOn: '2026-09-01' })
    .expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});

test('atualiza conta e transação e exclui transação', async () => {
  const account = payload(await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Conta para editar', type: 'cash' }).expect(201));

  const updatedAccount = payload(await request(app.server)
    .patch(`/api/v1/accounts/${account.id}`)
    .send({ name: 'Caixa atualizado', openingBalanceCents: 25000 })
    .expect(200));
  assert.equal(updatedAccount.name, 'Caixa atualizado');
  assert.equal(updatedAccount.openingBalanceCents, 25000);

  const transaction = payload(await request(app.server)
    .post('/api/v1/transactions')
    .send({
      accountId: account.id,
      type: 'expense',
      amountCents: 1000,
      category: 'antiga',
      description: 'Descrição antiga',
      occurredOn: '2026-09-12',
    }).expect(201));

  const updatedTransaction = payload(await request(app.server)
    .patch(`/api/v1/transactions/${transaction.id}`)
    .send({ amountCents: 2500, category: 'nova', description: 'Descrição atualizada' })
    .expect(200));
  assert.equal(updatedTransaction.amountCents, 2500);
  assert.equal(updatedTransaction.category, 'nova');

  const deleted = payload(await request(app.server)
    .delete(`/api/v1/transactions/${transaction.id}`)
    .expect(200));
  assert.equal(deleted.deleted, true);

  const remaining = await request(app.server)
    .get(`/api/v1/transactions?accountId=${account.id}`)
    .expect(200);
  assert.equal(remaining.body.pagination.total, 0);
});
