import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface Instance {
  url: string;
  proc: ChildProcess;
}

// boots real api processes, each with its own pg pool and redis connections
export async function startInstances(n: number, basePort = 4100): Promise<Instance[]> {
  const instances = Array.from({ length: n }, (_, i) => {
    const port = basePort + i;
    const proc = spawn(path.join(apiRoot, 'node_modules/.bin/tsx'), ['--conditions=development', 'src/server.ts'], {
      cwd: apiRoot,
      env: { ...process.env, PORT: String(port), INSTANCE_ID: `test-api-${i}`, DATABASE_POOL_MAX: '10', DISABLE_JOBS: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    proc.stderr?.on('data', (d) => process.stderr.write(`[api-${i}] ${d}`));
    return { url: `http://localhost:${port}`, proc };
  });

  const deadline = Date.now() + 20_000;
  for (const inst of instances) {
    for (;;) {
      try {
        const r = await fetch(`${inst.url}/readyz`);
        if (r.ok) break;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error(`${inst.url} didn't start`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return instances;
}

export async function stopInstances(instances: Instance[]) {
  await Promise.all(
    instances.map(
      (i) =>
        new Promise<void>((resolve) => {
          if (i.proc.exitCode !== null) return resolve();
          i.proc.once('exit', () => resolve());
          i.proc.kill('SIGTERM');
        }),
    ),
  );
}

// minimal fetch based client: a session cookie + csrf token, usable against any instance
export class RemoteUser {
  cookie = '';
  csrf = '';
  id = '';

  async request(base: string, method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(method !== 'GET' ? { 'x-csrf-token': this.csrf } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [name] = pair!.split('=');
      this.cookie = [...this.cookie.split('; ').filter((x) => x && !x.startsWith(`${name}=`)), pair].join('; ');
      if (name === 'cs_csrf') this.csrf = pair!.slice(name.length + 1);
    }
    const json = res.status === 204 ? null : await res.json();
    return { status: res.status, body: json, headers: res.headers };
  }

  async signUp(base: string, email: string) {
    await this.request(base, 'GET', '/api/auth/csrf');
    const r = await this.request(base, 'POST', '/api/auth/signup', { email, password: 'correct horse battery', displayName: email.split('@')[0] });
    if (r.status !== 201) throw new Error(`signup ${r.status}`);
    this.id = r.body.data.id;
    return this;
  }
}
