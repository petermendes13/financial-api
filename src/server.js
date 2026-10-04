require('dotenv').config();
const { DatabaseClient } = require('./db/database');
const { createApp } = require('./app');

async function start() {
  const database = new DatabaseClient();
  database.migrate();
  const app = createApp({ database, logger: process.env.NODE_ENV !== 'test' });
  const port = Number(process.env.PORT || 3050);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { start };
