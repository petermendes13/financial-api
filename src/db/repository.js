const { randomBytes, randomUUID, scryptSync, timingSafeEqual } = require('node:crypto');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

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

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ambientId: row.ambient_id,
    login: row.login,
    active: Boolean(row.ambient_active),
    num_tel: row.num_tel,
    chat_id: row.chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAmbient(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    active: Boolean(row.active),
    datepayment: row.datepayment,
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
    ambientId: row.ambient_id,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
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
    ambientId: row.ambient_id,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at,
  };
}

class FinancialRepository {
  constructor(db) {
    this.db = db;
  }

  createAccount(input) {
    if (input.ambientId) this.requireAmbient(input.ambientId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO accounts
        (id, name, type, currency, opening_balance_cents, ambient_id, active, created_at, updated_at)
      VALUES
        (@id, @name, @type, @currency, @openingBalanceCents, @ambientId, @active, @now, @now)
    `).run({
      id,
      name: input.name,
      type: input.type,
      currency: input.currency,
      openingBalanceCents: input.openingBalanceCents,
      ambientId: input.ambientId || null,
      active: input.active ? 1 : 0,
      now,
    });
    return this.getAccount(id);
  }

  createUser(input) {
    this.requireAmbient(input.ambientId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users
        (id, name, ambient_id, login, password_hash, num_tel, chat_id, created_at, updated_at)
      VALUES
        (@id, @name, @ambientId, @login, @passwordHash, @num_tel, @chat_id, @now, @now)
    `).run({
      id,
      name: input.name,
      ambientId: input.ambientId,
      login: input.login || null,
      passwordHash: input.senha ? hashPassword(input.senha) : null,
      num_tel: input.num_tel,
      chat_id: input.chat_id,
      now,
    });
    return this.getUser(id);
  }


  createAmbient(input) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO ambient (id, name, type, active, datepayment, created_at, updated_at)
      VALUES (@id, @name, @type, @active, @datepayment, @now, @now)
    `).run({
      id,
      name: input.name,
      type: input.type,
      active: input.active ? 1 : 0,
      datepayment: input.datepayment || null,
      now,
    });
    return this.getAmbient(id);
  }

  listAccounts({ includeInactive = false, ambientId } = {}) {
    const filters = [];
    const params = {};
    if (!includeInactive) filters.push('active = 1');
    if (ambientId) {
      filters.push('ambient_id = @ambientId');
      params.ambientId = ambientId;
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT * FROM accounts ${where}
      ORDER BY active DESC, name ASC
    `).all(params).map(toAccount);
  }
 

  listUsers({ includeInactive = false, ambientId } = {}) {
    const filters = [];
    const params = {};
    if (!includeInactive) filters.push('ambient.active = 1');
    if (ambientId) {
      filters.push('users.ambient_id = @ambientId');
      params.ambientId = ambientId;
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT users.*, ambient.active AS ambient_active FROM users
      JOIN ambient ON ambient.id = users.ambient_id
      ${where}
      ORDER BY ambient.active DESC, users.name ASC
    `).all(params).map(toUser);
  }

  listAmbients({ includeInactive = false } = {}) {
    const sql = includeInactive
      ? 'SELECT * FROM ambient ORDER BY active DESC, name ASC'
      : 'SELECT * FROM ambient WHERE active = 1 ORDER BY name ASC';
    const ambients = this.db.prepare(sql).all().map((row) => ({ ...toAmbient(row), users: [] }));
    if (ambients.length === 0) return ambients;

    const users = this.db.prepare(`
      SELECT users.*, ambient.active AS ambient_active
      FROM users
      JOIN ambient ON ambient.id = users.ambient_id
      ${includeInactive ? '' : 'WHERE ambient.active = 1'}
      ORDER BY users.name ASC
    `).all().map(toUser);
    const usersByAmbientId = new Map(ambients.map((ambient) => [ambient.id, []]));

    for (const user of users) {
      usersByAmbientId.get(user.ambientId)?.push(user);
    }

    return ambients.map((ambient) => ({
      ...ambient,
      users: usersByAmbientId.get(ambient.id),
    }));
  }

  getAccount(id) {
    return toAccount(this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id));
  }
  
  getUser(id) {
    return toUser(this.db.prepare(`
      SELECT users.*, ambient.active AS ambient_active
      FROM users
      LEFT JOIN ambient ON ambient.id = users.ambient_id
      WHERE users.id = ?
    `).get(id));
  }

  getUserByChatId(chatId) {
    return toUser(this.db.prepare(`
      SELECT users.*, ambient.active AS ambient_active
      FROM users
      LEFT JOIN ambient ON ambient.id = users.ambient_id
      WHERE users.chat_id = ?
    `).get(chatId));
  }

  authenticateUser(login, password) {
    const user = this.db.prepare('SELECT password_hash FROM users WHERE login = ?').get(login);
    return Boolean(user && verifyPassword(password, user.password_hash));
  }

  getAmbient(id) {
    return toAmbient(this.db.prepare('SELECT * FROM ambient WHERE id = ?').get(id));
  }

  updateAmbient(id, input) {
    this.requireAmbient(id);
    const fields = [];
    const params = { id, updatedAt: new Date().toISOString() };
    for (const key of ['name', 'type', 'datepayment']) {
      if (input[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        params[key] = input[key];
      }
    }
    if (input.active !== undefined) {
      fields.push('active = @active');
      params.active = input.active ? 1 : 0;
    }
    fields.push('updated_at = @updatedAt');
    this.db.prepare(`UPDATE ambient SET ${fields.join(', ')} WHERE id = @id`).run(params);
    return this.getAmbient(id);
  }

  updateUser(id, input) {
    this.requireUser(id);
    const fields = [];
    const params = { id, updatedAt: new Date().toISOString() };
    const columns = {
      name: 'name',
      login: 'login',
      num_tel: 'num_tel',
      chat_id: 'chat_id',
      ambientId: 'ambient_id',
    };

    if (input.ambientId) this.requireAmbient(input.ambientId);

    for (const [key, column] of Object.entries(columns)) {
      if (input[key] !== undefined) {
        fields.push(`${column} = @${key}`);
        params[key] = input[key];
      }
    }
    if (input.senha !== undefined) {
      fields.push('password_hash = @passwordHash');
      params.passwordHash = hashPassword(input.senha);
    }

    fields.push('updated_at = @updatedAt');
    this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = @id`).run(params);
    return this.getUser(id);
  }

  deleteUser(id) {
    this.requireUser(id);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { id, deleted: true };
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
      ambientId: 'ambient_id',
    };

    if (input.ambientId) this.requireAmbient(input.ambientId);

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


  requireUser(id) {
    const user = this.getUser(id);
    if (!user) throw new NotFoundError(`Usuário ${id} não foi encontrado.`);
    return user;
  }
  requireAmbient(id) {
    const ambient = this.getAmbient(id);
    if (!ambient) throw new NotFoundError(`Ambiente ${id} não foi encontrado.`);
    return ambient;
  }
  requireAccount(id) {
    const account = this.getAccount(id);
    if (!account) throw new NotFoundError(`Conta ${id} não encontrada.`);
    return account;
  }

  createTransaction(input) {
    const account = this.requireAccount(input.accountId);
    if (!account.active) throw new ConflictError('Não é possível lançar em uma conta inativa.');
    const ambientId = input.ambientId === undefined ? account.ambientId : input.ambientId;
    if (ambientId) this.requireAmbient(ambientId);

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO transactions
        (id, account_id, type, amount_cents, category, ambient_id, description, occurred_on, metadata_json)
      VALUES
        (@id, @accountId, @type, @amountCents, @category, @ambientId, @description, @occurredOn, @metadataJson)
    `).run({
      id,
      accountId: input.accountId,
      type: input.type,
      amountCents: input.amountCents,
      category: input.category || null,
      ambientId: ambientId || null,
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
          (id, account_id, type, amount_cents, category, ambient_id, description, occurred_on, metadata_json)
        VALUES
          (@id, @accountId, @type, @amountCents, @category, @ambientId, @description, @occurredOn, @metadataJson)
      `);
      const common = {
        amountCents: input.amountCents,
        category: 'transfer',
        ambientId: null,
        description: input.description || 'Transferência entre contas',
        occurredOn: input.occurredOn,
        metadataJson: JSON.stringify({ transferId }),
      };
      insert.run({ ...common, ambientId: from.ambientId, id: randomUUID(), accountId: from.id, type: 'transfer_out' });
      insert.run({ ...common, ambientId: to.ambientId, id: randomUUID(), accountId: to.id, type: 'transfer_in' });
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
      ambientId: 'ambient_id',
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
    if (input.ambientId) this.requireAmbient(input.ambientId);

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

  listTransactions({ accountId, ambientId, type, category, from, to, limit, offset }) {
    const filters = [];
    const params = {};
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    if (ambientId) { filters.push('t.ambient_id = @ambientId'); params.ambientId = ambientId; }
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

  getDashboardSummary({ from, to, accountId, ambientId }) {
    const filters = ['t.occurred_on >= @from', 't.occurred_on <= @to'];
    const params = { from, to };
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    if (ambientId) { filters.push('t.ambient_id = @ambientId'); params.ambientId = ambientId; }
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

    const balanceFilters = ['a.active = 1'];
    const balanceParams = { to };
    if (accountId) { balanceFilters.push('a.id = @accountId'); balanceParams.accountId = accountId; }
    if (ambientId) { balanceFilters.push('a.ambient_id = @ambientId'); balanceParams.ambientId = ambientId; }
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
      WHERE ${balanceFilters.join(' AND ')}
      GROUP BY a.id, a.name, a.currency, a.opening_balance_cents
      ORDER BY a.name ASC
    `).all(balanceParams);

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

  getExpensesByCategory({ from, to, accountId, ambientId }) {
    const filters = ["t.type = 'expense'", 't.occurred_on >= @from', 't.occurred_on <= @to'];
    const params = { from, to };
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    if (ambientId) { filters.push('t.ambient_id = @ambientId'); params.ambientId = ambientId; }
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

  getCashFlow({ from, to, accountId, ambientId, groupBy }) {
    const filters = ['t.occurred_on >= @from', 't.occurred_on <= @to'];
    const params = { from, to };
    if (accountId) { filters.push('t.account_id = @accountId'); params.accountId = accountId; }
    if (ambientId) { filters.push('t.ambient_id = @ambientId'); params.ambientId = ambientId; }
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
