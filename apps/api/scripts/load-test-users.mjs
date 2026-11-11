// Creates N verified users straight in the database and prints them as JSON,
// so k6 doesn't have to go through email verification. Load test only.
//   node apps/api/scripts/load-test-users.mjs 200 > tests/load/users.json
import pg from 'pg';
import argon2 from 'argon2';

const n = Number(process.argv[2] ?? 100);
const password = 'load-test-password-123';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();
const hash = await argon2.hash(password, { type: argon2.argon2id });
const run = Date.now().toString(36);
const users = [];
for (let i = 0; i < n; i++) {
  const email = `load-${run}-${i}@loadtest.coopswap.dev`;
  const { rows } = await client.query(
    `insert into users (email, password_hash, email_verified_at) values ($1, $2, now()) returning id`,
    [email, hash],
  );
  await client.query(`insert into profiles (user_id, display_name) values ($1, $2)`, [rows[0].id, `Load ${i}`]);
  await client.query(`insert into user_settings (user_id, email_on_message, email_on_booking) values ($1, false, false)`, [rows[0].id]);
  users.push({ id: rows[0].id, email, password });
}
await client.end();
process.stdout.write(JSON.stringify(users));
