require('dotenv').config();
const { DatabaseClient } = require('../src/db/database');

const database = new DatabaseClient();
database.migrate();
console.log(`Migrações aplicadas em ${database.filename}`);
database.close();
