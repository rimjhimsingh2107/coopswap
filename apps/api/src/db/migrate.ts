import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Plain SQL migrations, applied in filename order. We only go forward: if a
// migration is wrong, write a new one (see docs/operations.md).

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(here, '../../../../database/migrations');

export async function migrate(connectionString: string, dir = process.env.MIGRATIONS_DIR ?? DEFAULT_DIR) {
  const client = new pg.Client({ connectionString, application_name: 'migrate' });
  await client.connect();
  const applied: string[] = [];
  try {
    // only one instance migrates at a time; others wait then find nothing to do
    await client.query(`select pg_advisory_lock(hashtext('coopswap:migrations'))`);
    await client.query(`
      create table if not exists schema_migrations (
        version    text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )`);

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'select version, checksum from schema_migrations',
    );
    const done = new Map(rows.map((r) => [r.version, r.checksum]));

    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prev = done.get(file);
      if (prev) {
        if (prev !== checksum) {
          throw new Error(`migration ${file} was modified after being applied`);
        }
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version, checksum) values ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('commit');
        applied.push(file);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    await client.query(`select pg_advisory_unlock(hashtext('coopswap:migrations'))`).catch(() => {});
    await client.end();
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { env } = await import('../config/env.js');
  const applied = await migrate(env.DATABASE_URL);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'nothing to migrate');
}
