import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  listLocations,
  listServerTypes,
  createServer,
  createSshKey,
  waitForServerReady,
} from '../../src/setup-vps/api';

type FetchFn = typeof fetch;

function headerValue(headers: unknown, key: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(key) ?? undefined;
  if (Array.isArray(headers)) {
    const match = headers.find((entry) =>
      Array.isArray(entry) && entry[0]?.toLowerCase() === key.toLowerCase()
    );
    if (!match) return undefined;
    return typeof match[1] === 'string' ? match[1] : undefined;
  }
  if (typeof headers === 'object') {
    const record = headers as Record<string, string | readonly string[]>;
    const value = record[key];
    if (Array.isArray(value)) return value[0];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

describe('setup-vps api', () => {
  let originalFetch: FetchFn;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends auth header and parses locations', async () => {
    let seenUrl = '';
    let seenAuth = '';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuth = headerValue(init?.headers, 'Authorization') || '';
      const body = JSON.stringify({
        locations: [{
          id: 1,
          name: 'fsn1',
          description: 'Falkenstein',
          city: 'Falkenstein',
          country: 'DE',
          network_zone: 'eu-central',
        }],
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as FetchFn;

    const items = await listLocations('token-123');
    expect(seenUrl).toBe('https://api.hetzner.cloud/v1/locations');
    expect(seenAuth).toBe('Bearer token-123');
    expect(items.length).toBe(1);
    expect(items[0]?.name).toBe('fsn1');
  });

  it('parses server types', async () => {
    globalThis.fetch = (async () => {
      const body = JSON.stringify({
        server_types: [{
          id: 10,
          name: 'cpx11',
          description: 'shared',
          cores: 2,
          memory: 2,
          disk: 40,
          prices: [],
        }],
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as FetchFn;

    const items = await listServerTypes('token-123');
    expect(items.length).toBe(1);
    expect(items[0]?.name).toBe('cpx11');
  });

  it('uses error message from api', async () => {
    globalThis.fetch = (async () => {
      const body = JSON.stringify({ error: { message: 'No token' } });
      return new Response(body, { status: 401, statusText: 'Unauthorized', headers: { 'content-type': 'application/json' } });
    }) as unknown as FetchFn;

    let message = '';
    try {
      await listLocations('bad');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe('No token');
  });

  it('creates server with json body', async () => {
    let seenMethod = '';
    let seenBody = '';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      seenMethod = String(init?.method || '');
      seenBody = String(init?.body || '');
      const body = JSON.stringify({
        server: {
          id: 11,
          name: 'changes',
          status: 'running',
          public_net: { ipv4: { ip: '1.2.3.4' }, ipv6: {} },
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as FetchFn;

    await createServer('token-123', {
      name: 'changes',
      server_type: 'cpx11',
      location: 'fsn1',
      image: 'ubuntu-24.04',
      ssh_keys: [1, 2],
    });

    expect(seenMethod).toBe('POST');
    const parsed = JSON.parse(seenBody) as { name: string; server_type: string; ssh_keys: number[] };
    expect(parsed.name).toBe('changes');
    expect(parsed.server_type).toBe('cpx11');
    expect(parsed.ssh_keys.length).toBe(2);
  });

  it('creates ssh key with json body', async () => {
    let seenBody = '';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      seenBody = String(init?.body || '');
      const body = JSON.stringify({ ssh_key: { id: 2, name: 'key', public_key: 'ssh-ed25519 abc' } });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as FetchFn;

    const key = await createSshKey('token-123', 'key', 'ssh-ed25519 abc');
    expect(key.id).toBe(2);
    const parsed = JSON.parse(seenBody) as { name: string; public_key: string };
    expect(parsed.name).toBe('key');
    expect(parsed.public_key).toBe('ssh-ed25519 abc');
  });

  it('waits until server is ready', async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      const server = call < 2
        ? { id: 9, name: 'changes', status: 'starting', public_net: {} }
        : { id: 9, name: 'changes', status: 'running', public_net: { ipv4: { ip: '1.2.3.4' }, ipv6: {} } };
      const body = JSON.stringify({ server });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as FetchFn;

    const ready = await waitForServerReady('token-123', 9, { maxWaitMs: 50, pollMs: 1 });
    expect(ready.status).toBe('running');
    expect(ready.public_net.ipv4?.ip).toBe('1.2.3.4');
  });
});
