const { z } = require('zod');
const {
  accountSchema,
  userSchema,
  userUpdateSchema,
  authenticationSchema,
  ambientSchema,
  ambientUpdateSchema,
  accountUpdateSchema,
  transactionSchema,
  transactionUpdateSchema,
  transferSchema,
  transferUpdateSchema,
  parseDateRange,
} = require('../validation');

const transactionQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  ambientId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer_in', 'transfer_out']).optional(),
  category: z.string().trim().max(80).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();

const accountQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).default('false'),
  ambientId: z.string().uuid().optional(),
}).strict();

const userQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).default('false'),
  ambientId: z.string().uuid().optional(),
}).strict();

const ambientQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).default('false'),
}).strict();
function validationError(reply, error) {
  return reply.code(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    },
  });
}

function parseBody(schema, request, reply) {
  const result = schema.safeParse(request.body);
  if (!result.success) {
    validationError(reply, result.error);
    return null;
  }
  return result.data;
}

function parseRange(request, reply) {
  const result = parseDateRange(request.query);
  if (!result.success) {
    validationError(reply, result.error);
    return null;
  }
  return result.data;
}

async function apiRoutes(app) {
  const { repository } = app;

  app.get('/health', async () => ({ status: 'ok', service: 'financial-api', timestamp: new Date().toISOString() }));

  app.post('/auth', async (request, reply) => {
    const input = parseBody(authenticationSchema, request, reply);
    if (!input) return;
    return { data: { authenticated: repository.authenticateUser(input.login, input.senha) } };
  });

  app.post('/accounts', async (request, reply) => {
    const input = parseBody(accountSchema, request, reply);
    if (!input) return;
    const account = repository.createAccount(input);
    return reply.code(201).send({ data: account });
  });

  app.post('/users', async (request, reply) => {
    const input = parseBody(userSchema, request, reply);
    if (!input) return;
    const user = repository.createUser(input);
    return reply.code(201).send({ data: user });
  });

  app.post('/ambient', async (request, reply) => {
    const input = parseBody(ambientSchema, request, reply);
    if (!input) return;
    const ambient = repository.createAmbient(input);
    return reply.code(201).send({ data: ambient });
  });

  app.get('/accounts', async (request, reply) => {
    const parsed = accountQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    return { data: repository.listAccounts({
      includeInactive: parsed.data.includeInactive === 'true',
      ambientId: parsed.data.ambientId,
    }) };
  });

  app.get('/users', async (request, reply) => {
    const parsed = userQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    return { data: repository.listUsers({
      includeInactive: parsed.data.includeInactive === 'true',
      ambientId: parsed.data.ambientId,
    }) };
  });

  app.get('/ambient', async (request, reply) => {
    const parsed = ambientQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    return { data: repository.listAmbients({ includeInactive: parsed.data.includeInactive === 'true' }) };
  });

  app.get('/users/chat/:chat_id', async (request, reply) => {
    const user = repository.getUserByChatId(request.params.chat_id);
    if (!user) {
      return reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' } });
    }
    return { data: user };
  });

  app.get('/accounts/:id', async (request, reply) => {
    const account = repository.getAccount(request.params.id);
    if (!account) {
      return reply.code(404).send({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada.' } });
    }
    return { data: account };
  });

  app.get('/users/:id', async (request, reply) => {
    const user = repository.getUser(request.params.id);
    if (!user) {
      return reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' } });
    }
    return { data: user };
  });

  app.get('/ambient/:id', async (request, reply) => {
    const ambient = repository.getAmbient(request.params.id);
    if (!ambient) {
      return reply.code(404).send({ error: { code: 'AMBIENT_NOT_FOUND', message: 'Ambiente não encontrado.' } });
    }
    return { data: ambient };
  });

  app.patch('/accounts/:id', async (request, reply) => {
    const input = parseBody(accountUpdateSchema, request, reply);
    if (!input) return;
    const account = repository.updateAccount(request.params.id, input);
    return { data: account };
  });

  app.patch('/users/:id', async (request, reply) => {
    const input = parseBody(userUpdateSchema, request, reply);
    if (!input) return;
    const user = repository.updateUser(request.params.id, input);
    return { data: user };
  });

  app.delete('/users/:id', async (request, reply) => {
    return { data: repository.deleteUser(request.params.id) };
  });

  app.patch('/ambient/:id', async (request, reply) => {
    const input = parseBody(ambientUpdateSchema, request, reply);
    if (!input) return;
    const ambient = repository.updateAmbient(request.params.id, input);
    return { data: ambient };
  });
  app.post('/transactions', async (request, reply) => {
    const input = parseBody(transactionSchema, request, reply);
    if (!input) return;
    const transaction = repository.createTransaction(input);
    return reply.code(201).send({ data: transaction });
  });

  app.post('/transfers', async (request, reply) => {
    const input = parseBody(transferSchema, request, reply);
    if (!input) return;
    const transfer = repository.createTransfer(input);
    return reply.code(201).send({ data: transfer });
  });

  app.patch('/transfers/:transferId', async (request, reply) => {
    const input = parseBody(transferUpdateSchema, request, reply);
    if (!input) return;
    const transfer = repository.updateTransfer(request.params.transferId, input);
    return { data: transfer };
  });

  app.delete('/transfers/:transferId', async (request, reply) => {
    const result = repository.deleteTransfer(request.params.transferId);
    return { data: result };
  });

  app.get('/transactions', async (request, reply) => {
    const parsed = transactionQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    const result = repository.listTransactions(parsed.data);
    return { data: result.items, pagination: { total: result.total, limit: result.limit, offset: result.offset } };
  });

  app.patch('/transactions/:id', async (request, reply) => {
    const input = parseBody(transactionUpdateSchema, request, reply);
    if (!input) return;
    const transaction = repository.updateTransaction(request.params.id, input);
    return { data: transaction };
  });

  app.delete('/transactions/:id', async (request, reply) => {
    const result = repository.deleteTransaction(request.params.id);
    return { data: result };
  });

  app.get('/dashboard/summary', async (request, reply) => {
    const range = parseRange(request, reply);
    if (!range) return;
    return { data: repository.getDashboardSummary(range) };
  });

  app.get('/dashboard/expenses-by-category', async (request, reply) => {
    const range = parseRange(request, reply);
    if (!range) return;
    return { data: repository.getExpensesByCategory(range) };
  });

  app.get('/dashboard/cash-flow', async (request, reply) => {
    const range = parseRange(request, reply);
    if (!range) return;
    const groupBy = request.query.groupBy || 'day';
    if (!['day', 'month'].includes(groupBy)) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'groupBy deve ser day ou month.' },
      });
    }
    return { data: repository.getCashFlow({ ...range, groupBy }) };
  });
}

module.exports = { apiRoutes };
