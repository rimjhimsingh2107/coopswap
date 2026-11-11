import { pool } from '../../src/db/pool.js';

let tables: string[] | null = null;

export async function resetDb() {
  if (!tables) {
    const { rows } = await pool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`,
    );
    tables = rows.map((r) => `"${r.tablename}"`);
  }
  if (tables.length) await pool.query(`truncate ${tables.join(', ')} restart identity cascade`);
}
