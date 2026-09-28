const Fastify = require('fastify');
const cors = require('@fastify/cors');
const sensible = require('@fastify/sensible');
const { FinancialRepository, NotFoundError, ConflictError } = require('./db/repository');
const { apiRoutes } = require('./routes/api');

function createApp({ database, logger = true } = {}) {
  if (!database) throw new Error('database é obrigatório.');

  const app = Fastify({ logger });
  app.register(sensible);
  app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
  });
  app.decorate('repository', new FinancialRepository(database.db));

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
    }
    if (error instanceof ConflictError) {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: error.message } });
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Registro duplicado.' } });
    }
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return reply.code(400).send({ error: { code: 'INVALID_REFERENCE', message: 'Referência inválida.' } });
    }

    return reply.code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor.' : error.message,
      },
    });
  });

  app.register(apiRoutes, { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    database.close();
  });

  return app;
}

module.exports = { createApp };
