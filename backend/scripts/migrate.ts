import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const migrationLockId = 74192301;

async function migrate() {
  const connectionString = process.env.MIGRATION_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL is required. Configure it in backend/.env before migrating.');
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDirectory = resolve(process.cwd(), 'migrations');
    const migrations = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
      .sort();

    if (migrations.length === 0) {
      throw new Error(`No numbered SQL migrations found in ${migrationsDirectory}`);
    }

    for (const name of migrations) {
      const applied = await client.query(
        'SELECT 1 FROM app_schema_migrations WHERE name = $1',
        [name],
      );
      if (applied.rowCount) {
        console.log(`Already applied: ${name}`);
        continue;
      }

      const sql = await readFile(resolve(migrationsDirectory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO app_schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`Applied: ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]).catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});