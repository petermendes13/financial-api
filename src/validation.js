const { z } = require('zod');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD.');
const uuid = z.string().uuid('ID deve ser um UUID válido.');
const currency = z.string().regex(/^[A-Z]{3}$/, 'Moeda deve ser um código ISO de três letras.').default('BRL');

const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['cash', 'checking', 'savings', 'credit_card', 'investment', 'other']),
  currency,
  openingBalanceCents: z.number().int().default(0),
  ambientId: uuid.nullable().optional(),
  active: z.boolean().default(true),
}).strict();

const userSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ambientId: uuid,
  num_tel: z.string().trim().min(1).max(20).default('0'),
  chat_id: z.string().trim().min(1).max(100).default('0'),
}).strict();

const ambientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['standart', 'vip', 'pro', 'premium']),
  active: z.boolean().default(true),
  datepayment: isoDate.nullable().optional(),
}).strict();

const accountUpdateSchema = accountSchema.partial().strict().refine(
  (input) => Object.keys(input).length > 0,
  { message: 'Informe pelo menos um campo para atualizar.' },
);

const userUpdateSchema = userSchema.partial().strict().refine(
  (input) => Object.keys(input).length > 0,
  { message: 'Informe pelo menos um campo para atualizar.' },
);
const ambientUpdateSchema = ambientSchema.partial().strict().refine(
  (input) => Object.keys(input).length > 0,
  { message: 'Informe pelo menos um campo para atualizar.' },
);
const transactionSchema = z.object({
  accountId: uuid,
  type: z.enum(['income', 'expense', 'transfer_in', 'transfer_out']),
  amountCents: z.number().int().positive(),
  category: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  occurredOn: isoDate,
  ambientId: uuid.nullable().optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
}).strict();

const transactionUpdateSchema = transactionSchema.partial().strict().refine(
  (input) => Object.keys(input).length > 0,
  { message: 'Informe pelo menos um campo para atualizar.' },
);

const transferSchema = z.object({
  fromAccountId: uuid,
  toAccountId: uuid,
  amountCents: z.number().int().positive(),
  description: z.string().trim().max(500).optional().nullable(),
  occurredOn: isoDate,
}).strict();

const transferUpdateSchema = z.object({
  fromAccountId: uuid,
  toAccountId: uuid,
  amountCents: z.number().int().positive(),
  description: z.string().trim().max(500).optional().nullable(),
  occurredOn: isoDate,
}).partial().strict().refine(
  (input) => Object.keys(input).length > 0,
  { message: 'Informe pelo menos um campo para atualizar.' },
);

const dateRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
  accountId: uuid.optional(),
  ambientId: uuid.optional(),
}).refine(({ from, to }) => from <= to, {
  message: 'A data inicial deve ser menor ou igual à data final.',
  path: ['from'],
});

function parseQuery(schema, query) {
  const parsed = schema.safeParse(query);
  if (!parsed.success) return { success: false, error: parsed.error };
  return { success: true, data: parsed.data };
}

function parseDateRange(query) {
  const parsed = dateRangeSchema.safeParse({
    from: query.from || firstDayOfCurrentMonth(),
    to: query.to || today(),
    accountId: query.accountId,
    ambientId: query.ambientId,
  });
  return parsed;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfCurrentMonth() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

module.exports = {
  accountSchema,
  userSchema,
  ambientSchema,
  accountUpdateSchema,
  userUpdateSchema,
  ambientUpdateSchema,
  transactionSchema,
  transactionUpdateSchema,
  transferSchema,
  transferUpdateSchema,
  dateRangeSchema,
  parseQuery,
  parseDateRange,
  today,
  firstDayOfCurrentMonth,
};
