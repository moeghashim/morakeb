const HETZNER_API = 'https://api.hetzner.cloud/v1';

export type HetznerLocation = {
  id: number;
  name: string;
  description: string;
  city: string;
  country: string;
  network_zone: string;
};

export type HetznerPrice = {
  net: string;
  gross: string;
};

export type HetznerServerTypePrice = {
  location: string;
  price_hourly: HetznerPrice;
  price_monthly: HetznerPrice;
};

export type HetznerServerType = {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  cpu_type?: string;
  storage_type?: string;
  prices: HetznerServerTypePrice[];
};

export type HetznerServer = {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4?: { ip: string };
    ipv6?: { ip: string };
  };
};

export type HetznerSshKey = {
  id: number;
  name: string;
  fingerprint?: string;
  public_key?: string;
};

type HetznerError = {
  error?: { message?: string };
};

async function hetznerFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(`${HETZNER_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!resp.ok) {
    let message = `${resp.status} ${resp.statusText}`;
    try {
      const body = (await resp.json()) as HetznerError;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return (await resp.json()) as T;
}

export async function listLocations(token: string): Promise<HetznerLocation[]> {
  const data = await hetznerFetch<{ locations: HetznerLocation[] }>('/locations', token);
  return data.locations;
}

export async function listServerTypes(token: string): Promise<HetznerServerType[]> {
  const data = await hetznerFetch<{ server_types: HetznerServerType[] }>('/server_types', token);
  return data.server_types;
}

export async function listServers(token: string): Promise<HetznerServer[]> {
  const data = await hetznerFetch<{ servers: HetznerServer[] }>('/servers', token);
  return data.servers;
}

export async function getServer(token: string, id: number): Promise<HetznerServer> {
  const data = await hetznerFetch<{ server: HetznerServer }>(`/servers/${id}`, token);
  return data.server;
}

export async function createServer(
  token: string,
  input: {
    name: string;
    server_type: string;
    location: string;
    image: string;
    ssh_keys: number[];
  },
): Promise<HetznerServer> {
  const data = await hetznerFetch<{ server: HetznerServer }>(
    '/servers',
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data.server;
}

export async function powerOnServer(token: string, id: number): Promise<void> {
  await hetznerFetch(`/servers/${id}/actions/poweron`, token, { method: 'POST' });
}

export async function listSshKeys(token: string): Promise<HetznerSshKey[]> {
  const data = await hetznerFetch<{ ssh_keys: HetznerSshKey[] }>('/ssh_keys', token);
  return data.ssh_keys;
}

export async function createSshKey(
  token: string,
  name: string,
  publicKey: string,
): Promise<HetznerSshKey> {
  const data = await hetznerFetch<{ ssh_key: HetznerSshKey }>(
    '/ssh_keys',
    token,
    { method: 'POST', body: JSON.stringify({ name, public_key: publicKey }) },
  );
  return data.ssh_key;
}

export async function waitForServerReady(
  token: string,
  id: number,
  opts: { maxWaitMs: number; pollMs: number },
): Promise<HetznerServer> {
  const start = Date.now();
  while (Date.now() - start < opts.maxWaitMs) {
    const server = await getServer(token, id);
    const ip = server.public_net?.ipv4?.ip;
    if (server.status === 'running' && ip) return server;
    await new Promise((r) => setTimeout(r, opts.pollMs));
  }
  throw new Error('Server did not become ready in time');
}
