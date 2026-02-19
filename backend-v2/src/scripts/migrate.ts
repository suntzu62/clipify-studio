import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../services/database.service.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('migrations');

const MIGRATIONS_TABLE = 'schema_migrations';
// Stable advisory lock ID for this app (any bigint is fine as long as it's consistent).
const MIGRATIONS_LOCK_ID = 948372194857n;

function resolveMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // /src/scripts -> /migrations (dev) AND /dist/scripts -> /migrations (prod)
  return join(here, '../../migrations');
}

export async function runMigrations(): Promise<void> {
  const migrationsDir = resolveMigrationsDir();

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATIONS_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.${MIGRATIONS_TABLE} (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    const entries = await fs.readdir(migrationsDir, { withFileTypes: true }).catch((error: any) => {
      logger.error({ migrationsDir, error: error?.message }, 'Failed to read migrations directory');
      throw error;
    });

    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.sql'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    if (!files.length) {
      logger.warn({ migrationsDir }, 'No migrations found');
      return;
    }

    for (const id of files) {
      const already = await client.query(
        `SELECT 1 FROM public.${MIGRATIONS_TABLE} WHERE id = $1 LIMIT 1`,
        [id]
      );

      if (already.rowCount) {
        continue;
      }

      const fullPath = join(migrationsDir, id);
      const sql = await fs.readFile(fullPath, 'utf8');

      logger.info({ id }, 'Applying migration');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO public.${MIGRATIONS_TABLE} (id) VALUES ($1)`, [id]);
        await client.query('COMMIT');
      } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ id, error: error?.message }, 'Migration failed');
        throw error;
      }
    }

    logger.info({ count: files.length }, 'Migrations complete');
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATIONS_LOCK_ID]);
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'Failed to release advisory lock');
    }
    client.release();
  }
}

