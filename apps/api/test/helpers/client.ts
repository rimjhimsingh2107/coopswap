import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/db/pool.js';

let app: Express | null = null;
export const getApp = () => (app ??= createApp());

// A supertest agent that keeps cookies and sends the csrf header, like the browser would.
export class TestClient {
  agent: ReturnType<typeof request.agent>;
  csrf = '';
  userId = '';

  constructor(server: Express = getApp()) {
    this.agent = request.agent(server);
  }

  async init() {
    const res = await this.agent.get('/api/auth/csrf');
    this.csrf = res.body.data.token;
    return this;
  }

  get(path: string) {
    return this.agent.get(path);
  }
  post(path: string, body?: object, headers: Record<string, string> = {}) {
    return this.agent.post(path).set('x-csrf-token', this.csrf).set(headers).send(body);
  }
  patch(path: string, body?: object) {
    return this.agent.patch(path).set('x-csrf-token', this.csrf).send(body);
  }
  delete(path: string, body?: object) {
    return this.agent.delete(path).set('x-csrf-token', this.csrf).send(body);
  }
}

let n = 0;
export async function signedUpClient(opts: { verified?: boolean; email?: string; name?: string } = {}) {
  const c = await new TestClient().init();
  const email = opts.email ?? `student${++n}-${Date.now()}@northeastern.edu`;
  const res = await c.post('/api/auth/signup', {
    email,
    password: 'correct horse battery',
    displayName: opts.name ?? `Student ${n}`,
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  c.userId = res.body.data.id;
  if (opts.verified !== false) {
    await pool.query('update users set email_verified_at = now() where id = $1', [c.userId]);
  }
  return c;
}
