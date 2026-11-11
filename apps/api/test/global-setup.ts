import { migrate } from '../src/db/migrate.js';

export default async function setup() {
  const url = process.env.DATABASE_URL!;
  if (!url.includes('test')) throw new Error(`refusing to run integration tests against ${url}`);
  await migrate(url);
}
