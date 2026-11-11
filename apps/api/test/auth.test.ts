import { describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db/pool.js';
import * as mailer from '../src/lib/mailer.js';
import { TestClient, signedUpClient } from './helpers/client.js';

function captureMail() {
  const sent: mailer.Mail[] = [];
  vi.spyOn(mailer, 'sendMail').mockImplementation(async (m) => {
    sent.push(m);
  });
  const tokenFrom = (m: mailer.Mail | undefined) => /token=([\w-]+)/.exec(m?.text ?? '')?.[1] ?? '';
  return { sent, tokenFrom };
}

describe('auth', () => {
  it('signs up, starts a session and requires email verification', async () => {
    const mail = captureMail();
    const c = await new TestClient().init();
    const res = await c.post('/api/auth/signup', {
      email: 'Alex@Northeastern.edu',
      password: 'correct horse battery',
      displayName: 'Alex',
    });
    expect(res.status).toBe(201);

    const session = await c.get('/api/auth/session');
    expect(session.body.data).toMatchObject({ email: 'alex@northeastern.edu', emailVerified: false });

    const token = mail.tokenFrom(mail.sent[0]);
    expect(token.length).toBeGreaterThan(20);
    expect((await c.post('/api/auth/verify-email', { token })).status).toBe(200);
    // second use of the same link fails
    expect((await c.post('/api/auth/verify-email', { token })).status).toBe(400);

    const me = await c.get('/api/me');
    expect(me.body.data.emailVerified).toBe(true);
    expect(me.body.data.verifiedDomains).toEqual(['northeastern.edu']);
  });

  it('rejects duplicate emails regardless of case', async () => {
    await signedUpClient({ email: 'dup@example.com' });
    const c = await new TestClient().init();
    const res = await c.post('/api/auth/signup', {
      email: 'DUP@example.com',
      password: 'correct horse battery',
      displayName: 'x',
    });
    expect(res.status).toBe(409);
  });

  it('gives the same error for wrong password and unknown email', async () => {
    await signedUpClient({ email: 'known@example.com' });
    const c = await new TestClient().init();
    const wrong = await c.post('/api/auth/signin', { email: 'known@example.com', password: 'nope nope nope' });
    const unknown = await c.post('/api/auth/signin', { email: 'ghost@example.com', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('blocks mutating requests without the csrf header', async () => {
    const c = await new TestClient().init();
    const res = await c.agent.post('/api/auth/signin').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    const crossOrigin = await c
      .post('/api/auth/signin', { email: 'a@b.co', password: 'x' }, { origin: 'https://evil.example' });
    expect(crossOrigin.status).toBe(403);
  });

  it('password reset invalidates old sessions and is enumeration safe', async () => {
    const mail = captureMail();
    const c = await signedUpClient({ email: 'reset@example.com' });
    mail.sent.length = 0;

    const anon = await new TestClient().init();
    expect((await anon.post('/api/auth/forgot-password', { email: 'nobody@example.com' })).status).toBe(202);
    expect(mail.sent).toHaveLength(0);
    expect((await anon.post('/api/auth/forgot-password', { email: 'reset@example.com' })).status).toBe(202);

    const token = mail.tokenFrom(mail.sent[0]);
    const r = await anon.post('/api/auth/reset-password', { token, password: 'a brand new password' });
    expect(r.status).toBe(200);

    expect((await c.get('/api/me')).status).toBe(401);
    const signin = await anon.post('/api/auth/signin', { email: 'reset@example.com', password: 'a brand new password' });
    expect(signin.status).toBe(200);
  });

  it('links a university email only after the link is clicked', async () => {
    const mail = captureMail();
    const c = await signedUpClient({ email: 'person@gmail.com' });
    expect((await c.post('/api/auth/university', { email: 'person@gmail.com' })).status).toBe(400);

    expect((await c.post('/api/auth/university', { email: 'p.erson@northeastern.edu' })).status).toBe(202);
    expect((await c.get('/api/me')).body.data.verifiedDomains).toEqual([]);

    const token = mail.tokenFrom(mail.sent.at(-1));
    // someone else's session can't redeem it
    const other = await signedUpClient();
    expect((await other.post('/api/auth/university/confirm', { token })).status).toBe(400);
    // and trying didn't burn it
    expect((await c.post('/api/auth/university/confirm', { token })).status).toBe(200);
    expect((await c.get('/api/me')).body.data.verifiedDomains).toEqual(['northeastern.edu']);
  });

  it('deletes an account by anonymising it', async () => {
    const c = await signedUpClient({ email: 'leaving@example.com', name: 'Leaving Person' });
    const bad = await c.delete('/api/me', { password: 'correct horse battery', confirm: 'yes' });
    expect(bad.status).toBe(400);
    const res = await c.delete('/api/me', { password: 'correct horse battery', confirm: 'delete my account' });
    expect(res.status).toBe(204);

    const { rows } = await pool.query('select u.email, u.password_hash, p.display_name from users u join profiles p on p.user_id = u.id where u.id = $1', [c.userId]);
    expect(rows[0].email).not.toContain('leaving');
    expect(rows[0].password_hash).toBeNull();
    expect(rows[0].display_name).toBe('Deleted user');
    expect((await c.get('/api/me')).status).toBe(401);
    expect((await c.get(`/api/users/${c.userId}`)).status).toBe(404);
  });
});
