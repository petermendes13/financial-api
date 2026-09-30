const { randomUUID } = require('node:crypto');

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

function toPainel(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    active: Boolean(row.active),
    num_tel: row.num_tel,
    chat_id: row.chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    openingBalanceCents: row.opening_balance_cents,
    painelId: row.painel_id,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
<<<<<<< HEAD
  };
}

=======
  };}
>>>>>>> ca80c94377b491822a99be0471c06a18e9d61ec8
function toTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    type: row.type,
    amountCents: row.amount_cents,
    category: row.category,
    description: row.description,
    occurredOn: row.occurred_on,
    painelId: row.painel_id,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at,
  };
}

class FinancialRepository {
  constructor(db) {
    this.db = db;
  }

  createAccount(input) {
    if (input.painelId) this.requirePainel(input.painelId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO accounts
        (id, name, type, currency, opening_balance_cents, painel_id, active, created_at, updated_at)
      VALUES
        (@id, @name, @type, @currency, @openingBalanceCents, @painelId, @active, @now, @now)
    `).run({
      id,
      name: input.name,
      type: input.type,
      currency: input.currency,
      openingBalanceCents: input.openingBalanceCents,
      painelId: input.painelId || null,
      active: input.active ? 1 : 0,
      now,
    });
    return this.getAccount(id);
  }

  createPainel(input) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO painel
        (id, name, type, active, num_tel, chat_id, created_at, updated_at)
      VALUES
        (@id, @name, @type, @active, @num_tel, @chat_id, @now, @now)
    `).run({
      id,
      name: input.name,
      type: input.type,
      num_tel: input.num_tel,
      chat_id: input.chat_id,
      active: input.active ? 1 : 0,
      now,
    });
    return this.getPainel(id);
  }



  listAccounts({ includeInactive = false, painelId } = {}) {
    const filters = [];
    const params = {};
    if (!includeInactive) filters.push('active = 1');
    if (painelId) {
      filters.push('painel_id = @painelId');
      params.painelId = painelId;
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT * FROM accounts ${where}
      ORDER BY active DESC, name ASC
    `).all(params).map(toAccount);
  }
 

  listPainels({ includeInactive = false } = {}) {
    const sql = includeInactive
      ? 'SELECT * FROM painel ORDER BY active DESC, name ASC'
      : 'SELECT * FROM painel WHERE active = 1 ORDER BY name ASC';
    return this.db.prepare(sql).all().map(toPainel);
  }

  getAccount(id) {
    return toAccount(this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id));
  }
  
  getPainel(id) {
    return toPainel(this.db.prepare('SELECT * FROM painel WHERE id = ?').get(id));
  }

	

  updatePainel(id, input) {
    this.requirePainel(id);
    const fields = [];
    const params = { id, updatedAt: new Date().toISOString() };
    const columns = {
      name: 'name',
      type: 'type',
      num_tel: 'num_tel',
      chat_id: 'chat_id',
    };

    for (const [key, column] of Object.entries(columns)) {
      if (input[key] !== undefined) {
        fields.push(`${column} = @${key}`);
        params[key] = input[key];
      }
    }
    if (input.active !== undefined) {
      fields.push('active = @active');
      params.active = input.active ? 1 : 0;
    }

    fields.push('updated_at = @updatedAt');
    this.db.prepare(`UPDATE painel SET ${fields.join(', ')} WHERE id = @id`).run(params);
    return this.getPainel(id);
  }



  updateAccount(id, input) {
    this.requireAccount(id);
    const fields = [];
    const params = { id, updatedAt: new Date().toISOString() };
    const columns = {
      name: 'name',
      type: 'type',
      currency: 'currency',
      openingBalanceCents: 'opening_balance_cents',
      painelId: 'painel_id',
    };

    if (input.painelId) this.requirePainel(input.painelId);

    for (const [key, column] of Object.entries(columns)) {
      if (input[key] !== undefined) {
        fields.push(`${column} = @${key}`);
        params[key] = input[key];
      }
    }
    if (input.active !== undefined) {
      fields.push('active = @active');
      params.active = input.active ? 1 : 0;
    }

    fields.push('updated_at = @updatedAt');
    this.db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = @id`).run(params);
    return this.getAccount(id);
  }


  requirePainel(id) {
    const painel = this.getPainel(id);
    if (!painel) throw new NotFoundError(`Painel ${id} não foi encontrado.`);
    return painel;
  }
  requireAccount(id) {
    const account = this.getAccount(id);
    if (!account) throw new NotFoundError(`Conta ${id} não encontrada.`);
    return account;
  }

  createTransaction(input) {
    const account = this.requireAccount(input.accountId);
    if (!account.active) throw new ConflictError('Não é possível lançar em uma conta inativa.');
    const painelId = input.painelId === undefined ? account.painelId : input.painelId;
    if (painelId) this.requirePainel(painelId);

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO transactions
        (id, account_id, type, amount_cents, category, painel_id, description, occurred_on, metadata_json)
      VALUES
        (@id, @accountId, @type, @amountCents, @category, @painelId, @description, @occurredOn, @metadataJson)
    `).run({
      id,
      accountId: input.accountId,
      type: input.type,
      amountCents: input.amountCents,
      category: input.category || null,
      painelId: painelId || null,
      description: input.description || null,
      occurredOn: input.occurredOn,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    return this.getTransaction(id);
  }

  createTransfer(input) {
    if (input.fromAccountId === input.toAccountId) {
      throw new ConflictError('A conta de origem e a conta de destino devem ser diferentes.');
    }

    const from = this.requireAccount(input.fromAccountId);
    const to = this.requireAccount(input.toAccountId);
    if (!from.active || !to.active) {
      throw new ConflictError('As contas de uma transferência precisam estar ativas.');
    }

    const create = this.db.transaction(() => {
      const transferId = randomUUID();
      const insert = this.db.prepare(`
        INSERT INTO transactions
          (id, account_id, type, amount_cents, category, painel_id, description, occurred_on, metadata_json)
        VALUES
          (@id, @accountId, @type, @amountCents, @category, @painelId, @description, @occurredOn, @metadataJson)
      `);
      const common = {
        amountCents: input.amountCents,
        category: 'transfer',
        painelId: null,
        description: input.description || 'Transferência entre contas',
        occurredOn: input.occurredOn,
        metadataJson: JSON.stringify({ transferId }),
      };
      insert.run({ ...common, painelId: from.painelId, id: randomUUID(), accountId: from.id, type: 'transfer_out' });
      insert.run({ ...common, painelId: to.painelId, id: randomUUID(), accountId: to.id, type: 'transfer_in' });
      return transferId;
    });

    const transferId = create();
    return { transferId, fromAccountId: from.id, toAccountId: to.id, amountCents: input.amountCents, occurredOn: input.occurredOn };
  }

  getTransferRows(transferId) {
    const rows = this.db.prepare(`
      SELECT t.*, a.name AS account_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE json_extract(t.metadata_json, '$.transferId') = ?
    `).all(transferId);

    if (rows.length === 0) {
      throw new NotFoundError(`Transferência ${transferId} não encontrada.`);
    }

    const from = rows.find((row) => row.type === 'transfer_out');
    const to = rows.find((row) => row.type === 'transfer_in');

    if (rows.length !== 2 || !from || !to) {
      throw new ConflictError('A transferência não possui os dois lançamentos esperados.');
    }

    return { from, to };
  }

  getTransfer(transferId) {
    const { from, to } = this.getTransferRows(transferId);

    return {
      transferId,
      fromAccountId: from.account_id,
      toAccountId: to.account_id,
      amountCents: from.amount_cents,
      description: from.description,
      occurredOn: from.occurred_on,
    };
  }

  updateTransfer(transferId, input) {
    const update = this.db.transaction(() => {
      const { from, to } = this.getTransferRows(transferId);

      const fromAccount = input.fromAccountId !== undefined
        ? this.requireAccount(input.fromAccountId)
        : null;
      const toAccount = input.toAccountId !== undefined
        ? this.requireAccount(input.toAccountId)
        : null;

      const fromAccountId = fromAccount ? fromAccount.id : from.account_id;
      const toAccountId = toAccount ? toAccount.id : to.account_id;

      if (fromAccountId === toAccountId) {
        throw new ConflictError('A conta de origem e a conta de destino devem ser diferentes.');
      }
      if (fromAccount && !fromAccount.active) {
        throw new ConflictError('A conta de origem precisa estar ativa.');
      }
      if (toAccount && !toAccount.active) {
        throw new ConflictError('A conta de destino precisa estar ativa.');
      }

      const sharedUpdates = {};
      if (input.amountCents !== undefined) sharedUpdates.amount_cents = input.amountCents;
      if (input.description !== undefined) sharedUpdates.description = input.description;
      if (input.occurredOn !== undefined) sharedUpdates.occurred_on = input.occurredOn;

      for (const row of [from, to]) {
        const fields = [];
        const params = { id: row.id };

        for (const [column, value] of Object.entries(sharedUpdates)) {
          fields.push(`${column} = @${column}`);
          params[column] = value;
        }

        if (row.type === 'transfer_out' && fromAccount) {
          fields.push('account_id = @accountId');
          params.accountId = fromAccount.id;
        }
        if (row.type === 'transfer_in' && toAccount) {
          fields.push('account_id = @accountId');
          params.accountId = toAccount.id;
        }

        if (fields.length > 0) {
          this.db.prepare(
            `UPDATE transactions SET ${fields.join(', ')} WHERE id = @id`
          ).run(params);
        }
      }
    });

    update();
    return this.getTransfer(transferId);
  }

  deleteTransfer(transferId) {
    const remove = this.db.transaction(() => {
      const { from, to } = this.getTransferRows(transferId);
      this.db.prepare('DELETE FROM transactions WHERE id IN (?, ?)').run(from.id, to.id);
    });

    remove();
    return { transferId, deleted: true };
  }

  getTransaction(id) {
    return toTransaction(this.db.prepare(`
      SELECT t.*, a.name AS account_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ?
    `).get(id));
  }

  updateTransaction(id, input) {
    const existing = this.getTransaction(id);
    if (!existing) throw new NotFoundError(`Transação ${id} não encontrada.`);
    if (existing.type === 'transfer_in' || existing.type === 'transfer_out') {
      throw new ConflictError('Transferências devem ser alteradas ou excluídas pelo fluxo de transferência.');
    }
    if (input.type === 'transfer_in' || input.type === 'transfer_out') {
      throw new ConflictError('Não é possível transformar um lançamento comum em transferência.');
    }

    const fields = [];
    const params = { id };
    const values = {
      accountId: 'account_id',
      painelId: 'painel_id',
      type: 'type',
      amountCents: 'amount_cents',
      category: 'category',
      description: 'description',
      occurredOn: 'occurred_on',
    };

    if (input.accountId !== undefined) {
      const account = this.requireAccount(input.accountId);
      if (!account.active) throw new ConflictError('Não é possível mover a transação para uma conta inativa.');
    }
    if (input.painelId) this.requirePainel(input.painelId);

    for (const [key, column] of Object.entries(values)) {
      if (input[key] !== undefined) {
        fields.push(`${column} = @${key}`);
        params[key] = input[key];
      }
    }
    if (input.metadata !== undefined) {
      fields.push('metadata_json = @metadataJson');
      params.metadataJson = input.metadata === null ? null : JSON.stringify(input.metadata);
    }

    this.db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = @id`).run(params);
    return this.getTransaction(id);
  }

  deleteTransaction(id) {
    const existing = this.getTransaction(id);
    if (!existing) throw new NotFoundError(`Transação ${id} não encontrada.`);
    if (existing.type === 'transfer_in' || existing.type === 'transfer_out') {
      throw new ConflictError('Transferências devem ser alteradas ou excluídas pelo fluxo de transferência.');
    }

    this.db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return { id, deleted: true };
  }

  listTransactions({ accountId, painelId, type, category, from, to, limit, offset }) {
    const filters = [];
    const params = {};
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    if (painelId) { filters.push('t.painel_id = @painelId'); params.painelId = painelId; }
    if (type) { filters.push('t.type = @type'); params.type = type; }
    if (category) { filters.push('LOWER(t.category) = LOWER(@category)'); params.category = category; }
    if (from) { filters.push('t.occurred_on >= @from'); params.from = from; }
    if (to) { filters.push('t.occurred_on <= @to'); params.to = to; }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT t.*, a.name AS account_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      ${where}
      ORDER BY t.occurred_on DESC, t.created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });
    const total = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM transactions t
      ${where}
    `).get(params).count;
    return { items: rows.map(toTransaction), total, limit, offset };
  }

  getDashboardSummary({ from, to, accountId }) {
    const filters = ['t.occurred_on >= @from', 't.occurred_on <= @to'];
    const params = { from, to };
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    const where = filters.join(' AND ');
    const totals = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
        COALESCE(SUM(CASE WHEN type = 'transfer_in' THEN amount_cents ELSE 0 END), 0) AS transfer_in_cents,
        COALESCE(SUM(CASE WHEN type = 'transfer_out' THEN amount_cents ELSE 0 END), 0) AS transfer_out_cents,
        COUNT(*) AS transaction_count
      FROM transactions t
      WHERE ${where}
    `).get(params);

    const accountFilter = accountId ? 'AND a.id = @accountId' : '';
    const balances = this.db.prepare(`
      SELECT
        a.id AS account_id,
        a.name,
        a.currency,
        a.opening_balance_cents
          + COALESCE(SUM(CASE WHEN t.type IN ('income', 'transfer_in') THEN t.amount_cents
                              WHEN t.type IN ('expense', 'transfer_out') THEN -t.amount_cents
                              ELSE 0 END), 0) AS balance_cents
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id AND t.occurred_on <= @to
      WHERE a.active = 1 ${accountFilter}
      GROUP BY a.id, a.name, a.currency, a.opening_balance_cents
      ORDER BY a.name ASC
    `).all({ to, accountId });

    return {
      period: { from, to },
      incomeCents: totals.income_cents,
      expenseCents: totals.expense_cents,
      netCents: totals.income_cents - totals.expense_cents,
      transferInCents: totals.transfer_in_cents,
      transferOutCents: totals.transfer_out_cents,
      transactionCount: totals.transaction_count,
      balances: balances.map((row) => ({
        accountId: row.account_id,
        name: row.name,
        currency: row.currency,
        balanceCents: row.balance_cents,
      })),
    };
  }

  getExpensesByCategory({ from, to, accountId }) {
    const filters = ["t.type = 'expense'", 't.occurred_on >= @from', 't.occurred_on <= @to'];
    const params = { from, to };
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    const rows = this.db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(t.category), ''), 'Sem categoria') AS category,
             SUM(t.amount_cents) AS amount_cents,
             COUNT(*) AS transaction_count
      FROM transactions t
      WHERE ${filters.join(' AND ')}
      GROUP BY COALESCE(NULLIF(TRIM(t.category), ''), 'Sem categoria')
      ORDER BY amount_cents DESC
    `).all(params);
    return rows.map((row) => ({ category: row.category, amountCents: row.amount_cents, transactionCount: row.transaction_count }));
  }

  getCashFlow({ from, to, accountId, groupBy }) {
    const filters = ['t.occurred_on >= @from', 't.occurred_on <= @to'];
    const params = { from, to };
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    const periodExpression = groupBy === 'month'
      ? "substr(t.occurred_on, 1, 7)"
      : 't.occurred_on';
    const rows = this.db.prepare(`
      SELECT ${periodExpression} AS period,
             COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
             COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense_cents,
             COALESCE(SUM(CASE WHEN t.type IN ('transfer_in', 'transfer_out') THEN t.amount_cents ELSE 0 END), 0) AS transfer_cents
      FROM transactions t
      WHERE ${filters.join(' AND ')}
      GROUP BY ${periodExpression}
      ORDER BY period ASC
    `).all(params);
    return rows.map((row) => ({
      period: row.period,
      incomeCents: row.income_cents,
      expenseCents: row.expense_cents,
      transferCents: row.transfer_cents,
      netCents: row.income_cents - row.expense_cents,
    }));
  }
}

module.exports = { FinancialRepository, NotFoundError, ConflictError };
