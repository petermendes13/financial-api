require('dotenv').config();
const { DatabaseClient } = require('../src/db/database');
const { FinancialRepository } = require('../src/db/repository');

const database = new DatabaseClient();
database.migrate();
const repository = new FinancialRepository(database.db);

const existing = repository.listAccounts({ includeInactive: true });
if (existing.length === 0) {
  reposioty.createPainel({name: 'bruno', type: 'standart', active: true, num_tel: '1234', chat_id: '1234'});
  const checking = repository.createAccount({ name: 'Conta corrente', type: 'checking', currency: 'BRL', openingBalanceCents: 150000, active: true });
  const card = repository.createAccount({ name: 'Cartão de crédito', type: 'credit_card', currency: 'BRL', openingBalanceCents: 0, active: true });
  repository.createTransaction({ accountId: checking.id, type: 'income', amountCents: 500000, category: 'salário', description: 'Recebimento mensal', occurredOn: '2026-09-01' });
  repository.createTransaction({ accountId: card.id, type: 'expense', amountCents: 12500, category: 'alimentação', description: 'Mercado', occurredOn: '2026-09-03' });
  repository.createTransaction({ accountId: checking.id, type: 'expense', amountCents: 89000, category: 'moradia', description: 'Aluguel', occurredOn: '2026-09-05' });
  console.log('Seed concluído.', { checkingId: checking.id, cardId: card.id });
} else {
  console.log('Seed ignorado: já existem contas.');
}

database.close();
