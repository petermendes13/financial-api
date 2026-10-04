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

test('migra painel antigo para users e ambient sem perder relacionamentos', () => {
  const filename = path.join(tempDir, 'legacy.sqlite');
  const legacy = new DatabaseClient({ filename });
  legacy.db.exec(fs.readFileSync(path.join(__dirname, '../migrations/001_initial.sql'), 'utf8'));
  legacy.db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run('001_initial.sql');
  legacy.db.prepare(`
    INSERT INTO painel (id, name, type, active, num_tel, chat_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('legacy-user', 'Usuário antigo', 'vip', 1, '55110000', 'chat-legacy');
  legacy.db.prepare(`
    INSERT INTO accounts (id, name, type, painel_id) VALUES (?, ?, ?, ?)
  `).run('legacy-account', 'Conta antiga', 'checking', 'legacy-user');
  legacy.db.prepare(`
    INSERT INTO transactions (id, account_id, type, amount_cents, occurred_on, painel_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('legacy-transaction', 'legacy-account', 'income', 100, '2026-10-01', 'legacy-user');
  legacy.close();

  const upgraded = new DatabaseClient({ filename });
  upgraded.migrate();
  assert.equal(upgraded.db.prepare('SELECT ambient_id FROM users WHERE id = ?').get('legacy-user').ambient_id, 'legacy-user');
  assert.equal(upgraded.db.prepare('SELECT type FROM ambient WHERE id = ?').get('legacy-user').type, 'vip');
  assert.equal(upgraded.db.prepare('SELECT ambient_id FROM accounts WHERE id = ?').get('legacy-account').ambient_id, 'legacy-user');
  assert.equal(upgraded.db.prepare('SELECT ambient_id FROM transactions WHERE id = ?').get('legacy-transaction').ambient_id, 'legacy-user');
  assert.ok(upgraded.db.pragma('foreign_key_list(accounts)').some((foreignKey) => foreignKey.table === 'ambient'));
  assert.ok(upgraded.db.pragma('foreign_key_list(transactions)').some((foreignKey) => foreignKey.table === 'ambient'));
  assert.deepEqual(upgraded.db.pragma('foreign_key_check'), []);
  upgraded.close();
});

test('associa contas e transações ao ambient e filtra por ambientId', async () => {
  const ambient = payload(await request(app.server)
    .post('/api/v1/ambient')
    .send({ name: 'Ambiente integração', type: 'standart', datepayment: '2026-10-15' })
    .expect(201));
  assert.equal(ambient.active, true);
  assert.equal(ambient.datepayment, '2026-10-15');

  const user = payload(await request(app.server)
    .post('/api/v1/users')
    .send({ name: 'Usuário integração', ambientId: ambient.id, num_tel: '5511999999999', chat_id: 'chat-1' })
    .expect(201));
  assert.equal(user.ambientId, ambient.id);
  assert.equal(user.active, true);

  const ambientList = await request(app.server)
    .get('/api/v1/ambient')
    .expect(200);
  const listedAmbient = ambientList.body.data.find((item) => item.id === ambient.id);
  assert.deepEqual(listedAmbient.users.map((listedUser) => listedUser.id), [user.id]);

  const userById = await request(app.server)
    .get(`/api/v1/users/${user.id}`)
    .expect(200);
  assert.equal(userById.body.data.active, true);

  const userByChatId = await request(app.server)
    .get('/api/v1/users/chat/chat-1')
    .expect(200);
  assert.deepEqual(userByChatId.body.data, user);

  const missingUser = await request(app.server)
    .get('/api/v1/users/chat/chat-ausente')
    .expect(404);
  assert.equal(missingUser.body.error.code, 'USER_NOT_FOUND');

  const account = payload(await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Conta do ambiente', type: 'checking', ambientId: ambient.id })
    .expect(201));
  assert.equal(account.ambientId, ambient.id);

  const transaction = payload(await request(app.server)
    .post('/api/v1/transactions')
    .send({
      accountId: account.id,
      ambientId: ambient.id,
      type: 'income',
      amountCents: 5000,
      occurredOn: '2026-08-20',
    })
    .expect(201));
  assert.equal(transaction.ambientId, ambient.id);

  const accounts = await request(app.server)
    .get(`/api/v1/accounts?ambientId=${ambient.id}`)
    .expect(200);
  assert.deepEqual(accounts.body.data.map((item) => item.id), [account.id]);

  const transactions = await request(app.server)
    .get(`/api/v1/transactions?ambientId=${ambient.id}`)
    .expect(200);
  assert.deepEqual(transactions.body.data.map((item) => item.id), [transaction.id]);
});

test('retorna active false quando o usuário não tem ambiente associado', async () => {
  const userId = 'user-without-ambient';
  const chatId = 'chat-without-ambient';
  database.db.prepare(`
    INSERT INTO users (id, name, num_tel, chat_id)
    VALUES (?, ?, ?, ?)
  `).run(userId, 'Usuário sem ambiente', '0', chatId);

  const byId = await request(app.server)
    .get(`/api/v1/users/${userId}`)
    .expect(200);
  assert.equal(byId.body.data.active, false);

  const byChat = await request(app.server)
    .get(`/api/v1/users/chat/${chatId}`)
    .expect(200);
  assert.equal(byChat.body.data.active, false);
});

test('lista usuários por ambientId e combina com includeInactive', async () => {
  const ambientA = payload(await request(app.server)
    .post('/api/v1/ambient')
    .send({ name: 'Ambiente usuários A', type: 'standart' })
    .expect(201));
  const ambientB = payload(await request(app.server)
    .post('/api/v1/ambient')
    .send({ name: 'Ambiente usuários B', type: 'standart' })
    .expect(201));

  const userA = payload(await request(app.server)
    .post('/api/v1/users')
    .send({ name: 'Usuário ambiente A', ambientId: ambientA.id })
    .expect(201));
  await request(app.server)
    .post('/api/v1/users')
    .send({ name: 'Usuário ambiente B', ambientId: ambientB.id })
    .expect(201);

  const filtered = await request(app.server)
    .get(`/api/v1/users?ambientId=${ambientA.id}`)
    .expect(200);
  assert.deepEqual(filtered.body.data.map((user) => user.id), [userA.id]);

  await request(app.server)
    .patch(`/api/v1/ambient/${ambientA.id}`)
    .send({ active: false })
    .expect(200);

  const activeOnly = await request(app.server)
    .get(`/api/v1/users?ambientId=${ambientA.id}`)
    .expect(200);
  assert.deepEqual(activeOnly.body.data, []);

  const includingInactive = await request(app.server)
    .get(`/api/v1/users?ambientId=${ambientA.id}&includeInactive=true`)
    .expect(200);
  assert.deepEqual(includingInactive.body.data.map((user) => user.id), [userA.id]);
});

test('atualiza ambiente e dados do usuário', async () => {
  const ambient = payload(await request(app.server)
    .post('/api/v1/ambient')
    .send({ name: 'Ambiente para editar', type: 'standart' })
    .expect(201));

  const updatedAmbient = payload(await request(app.server)
    .patch(`/api/v1/ambient/${ambient.id}`)
    .send({ type: 'vip', active: false, datepayment: '2026-11-01' })
    .expect(200));
  assert.equal(updatedAmbient.type, 'vip');
  assert.equal(updatedAmbient.active, false);
  assert.equal(updatedAmbient.datepayment, '2026-11-01');

  const user = payload(await request(app.server)
    .post('/api/v1/users')
    .send({ name: 'Usuário para editar', ambientId: ambient.id, chat_id: 'chat-ambiente-inativo' })
    .expect(201));
  assert.equal(user.num_tel, '0');
  assert.equal(user.chat_id, 'chat-ambiente-inativo');
  assert.equal(user.active, false);

  const inactiveUserById = await request(app.server)
    .get(`/api/v1/users/${user.id}`)
    .expect(200);
  assert.equal(inactiveUserById.body.data.active, false);

  const inactiveUserByChat = await request(app.server)
    .get('/api/v1/users/chat/chat-ambiente-inativo')
    .expect(200);
  assert.equal(inactiveUserByChat.body.data.active, false);

  const updatedUser = payload(await request(app.server)
    .patch(`/api/v1/users/${user.id}`)
    .send({ num_tel: '5511888888888', chat_id: 'chat-novo' })
    .expect(200));

  assert.equal(updatedUser.num_tel, '5511888888888');
  assert.equal(updatedUser.chat_id, 'chat-novo');

  const deletedUser = payload(await request(app.server)
    .delete(`/api/v1/users/${user.id}`)
    .expect(200));
  assert.deepEqual(deletedUser, { id: user.id, deleted: true });

  await request(app.server)
    .get(`/api/v1/users/${user.id}`)
    .expect(404);

  assert.ok(await app.repository.getAmbient(ambient.id));
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
    .get(`/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30&accountId=${account.id}`)
    .expect(200);
  const summary = payload(summaryResponse);
  assert.equal(summary.incomeCents, 500000);
  assert.equal(summary.expenseCents, 12500);
  assert.equal(summary.netCents, 487500);
  assert.equal(summary.balances[0].balanceCents, 587500);
});

test('filtra os dashboards por ambientId', async () => {
  const ambientA = payload(await request(app.server)
    .post('/api/v1/ambient')
    .send({ name: 'Ambiente dashboard A', type: 'standart' })
    .expect(201));
  const ambientB = payload(await request(app.server)
    .post('/api/v1/ambient')
    .send({ name: 'Ambiente dashboard B', type: 'standart' })
    .expect(201));

  const accountA = payload(await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Conta dashboard A', type: 'checking', ambientId: ambientA.id, openingBalanceCents: 100000 })
    .expect(201));
  const accountB = payload(await request(app.server)
    .post('/api/v1/accounts')
    .send({ name: 'Conta dashboard B', type: 'checking', ambientId: ambientB.id })
    .expect(201));

  for (const [account, income, expense, category] of [
    [accountA, 10000, 2000, 'mercado-a'],
    [accountB, 90000, 7000, 'mercado-b'],
  ]) {
    await request(app.server)
      .post('/api/v1/transactions')
      .send({ accountId: account.id, type: 'income', amountCents: income, occurredOn: '2026-10-04' })
      .expect(201);
    await request(app.server)
      .post('/api/v1/transactions')
      .send({ accountId: account.id, type: 'expense', amountCents: expense, category, occurredOn: '2026-10-04' })
      .expect(201);
  }

  const period = `from=2026-10-01&to=2026-10-31&ambientId=${ambientA.id}`;
  const summary = payload(await request(app.server)
    .get(`/api/v1/dashboard/summary?${period}`)
    .expect(200));
  assert.equal(summary.incomeCents, 10000);
  assert.equal(summary.expenseCents, 2000);
  assert.equal(summary.transactionCount, 2);
  assert.deepEqual(summary.balances.map((balance) => balance.accountId), [accountA.id]);

  const expenses = payload(await request(app.server)
    .get(`/api/v1/dashboard/expenses-by-category?${period}`)
    .expect(200));
  assert.deepEqual(expenses, [{ category: 'mercado-a', amountCents: 2000, transactionCount: 1 }]);

  const cashFlow = payload(await request(app.server)
    .get(`/api/v1/dashboard/cash-flow?${period}&groupBy=month`)
    .expect(200));
  assert.deepEqual(cashFlow, [{
    period: '2026-10',
    incomeCents: 10000,
    expenseCents: 2000,
    transferCents: 0,
    netCents: 8000,
  }]);
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
