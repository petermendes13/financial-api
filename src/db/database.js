const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

class DatabaseClient {
  constructor({ filename, migrationsDir } = {}) {
    const databasePath = filename || process.env.DATABASE_PATH || './data/financial.sqlite';
    const resolvedPath = path.isAbsolute(databasePath)
      ? databasePath
      : path.resolve(process.cwd(), databasePath);

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.filename = resolvedPath;
    this.db = new Database(resolvedPath);
    this.migrationsDir = migrationsDir || path.resolve(__dirname, '../../migrations');

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationFiles = fs.readdirSync(this.migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const applied = new Set(
      this.db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id),
    );

    for (const filename of migrationFiles) {
      if (applied.has(filename)) continue;

      const sql = fs.readFileSync(path.join(this.migrationsDir, filename), 'utf8');
      const applyMigration = this.db.transaction(() => {
        this.db.exec(sql);
        this.db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(filename);
      });
      applyMigration();
    }
  }

  close() {
    if (this.db.open) this.db.close();
  }
}

module.exports = { DatabaseClient };
