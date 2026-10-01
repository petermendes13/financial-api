const { z } = require('zod');
const {
  accountSchema,
  painelSchema,
  painelUpdateSchema,
  accountUpdateSchema,
  transactionSchema,
  transactionUpdateSchema,
  transferSchema,
  transferUpdateSchema,
  parseDateRange,
} = require('../validation');

const transactionQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  painelId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer_in', 'transfer_out']).optional(),
  category: z.string().trim().max(80).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();

const accountQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).default('false'),
  painelId: z.string().uuid().optional(),
}).strict();

const painelQuerySchema = z.object({
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

  app.post('/accounts', async (request, reply) => {
    const input = parseBody(accountSchema, request, reply);
    if (!input) return;
    const account = repository.createAccount(input);
    return reply.code(201).send({ data: account });
  });

  app.post('/painel', async (request, reply) => {
    const input = parseBody(painelSchema, request, reply);
    if (!input) return;
    const painel = repository.createPainel(input);
    return reply.code(201).send({ data: painel });
  });
  app.get('/accounts', async (request, reply) => {
    const parsed = accountQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    return { data: repository.listAccounts({
      includeInactive: parsed.data.includeInactive === 'true',
      painelId: parsed.data.painelId,
    }) };
  });

  app.get('/painel', async (request, reply) => {
    const parsed = painelQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    return { data: repository.listPainels({ includeInactive: parsed.data.includeInactive === 'true' }) };
  });

  app.get('/painel/chat/:chat_id', async (request, reply) => {
    const painel = repository.getPainelByChatId(request.params.chat_id);
    if (!painel) {
      return reply.code(404).send({ error: { code: 'PAINEL_NOT_FOUND', message: 'Painel não encontrado.' } });
    }
    return { data: painel };
  });

  app.get('/accounts/:id', async (request, reply) => {
    const account = repository.getAccount(request.params.id);
    if (!account) {
      return reply.code(404).send({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada.' } });
    }
    return { data: account };
  });

  app.get('/painel/:id', async (request, reply) => {
    const painel = repository.getPainel(request.params.id);
    if (!painel) {
      return reply.code(404).send({ error: { code: 'PAINEL_NOT_FOUND', message: 'Painel não encontrada.' } });
    }
    return { data: painel };
  });
  app.patch('/accounts/:id', async (request, reply) => {
    const input = parseBody(accountUpdateSchema, request, reply);
    if (!input) return;
    const account = repository.updateAccount(request.params.id, input);
    return { data: account };
  });

  app.patch('/painel/:id', async (request, reply) => {
    const input = parseBody(painelUpdateSchema, request, reply);
    if (!input) return;
    const painel = repository.updatePainel(request.params.id, input);
    return { data: painel };
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
