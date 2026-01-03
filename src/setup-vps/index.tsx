#!/usr/bin/env bun
import React, {useEffect, useMemo, useState} from 'react';
import {render, useApp, useInput, Text} from 'ink';
import {InputScreen} from '../setup/screens/prompt';
import {PassiveScreen, SelectScreen} from '../setup/screens/select';
import type {SelectOption} from '../setup/screens/select';
import {ScreenSection} from '../setup/screens/layout';
import {spinnerFrames, nextSpinnerFrame} from '../setup/shared';
import {runAsync, run} from '../setup/sys';
import {
  createServer,
  listLocations,
  listServerTypes,
  listServers,
  listSshKeys,
  createSshKey,
  powerOnServer,
  waitForServerReady,
  type HetznerLocation,
  type HetznerServerType,
  type HetznerServer,
} from './api';
import {defaultKeyPath, ensureLocalSshKey, listLocalSshKeys, upsertSshConfig} from './ssh';
import {detectGitHubRepo, ghAvailable, ghAuthed, setSecret, setVariable} from './github';
import {generateDeployKey} from '../setup/github-actions';
import {setHostDest} from '../setup/prefs';

type Phase =
  | 'intro'
  | 'token'
  | 'loading'
  | 'location'
  | 'class'
  | 'size'
  | 'name'
  | 'ssh-key'
  | 'dest'
  | 'github'
  | 'confirm'
  | 'running'
  | 'done'
  | 'error';

type CpuClass = 'shared' | 'dedicated';

type RunResult = {
  serverId: number;
  serverName: string;
  serverIp: string;
  sshAlias: string;
  dest: string;
  reusedServer: boolean;
  warnings: string[];
  githubRepo?: string;
};

function SetupVpsApp(): React.ReactElement {
  const {exit} = useApp();
  const [phase, setPhase] = useState<Phase>('intro');
  const [tokenInput, setTokenInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [locations, setLocations] = useState<HetznerLocation[]>([]);
  const [serverTypes, setServerTypes] = useState<HetznerServerType[]>([]);
  const [location, setLocation] = useState<HetznerLocation | null>(null);
  const [cpuClass, setCpuClass] = useState<CpuClass>('shared');
  const [serverType, setServerType] = useState<HetznerServerType | null>(null);
  const [serverName, setServerName] = useState('changes');
  const [dest, setDest] = useState('/opt/changes');
  const [keyPath, setKeyPath] = useState(defaultKeyPath());
  const [githubOptIn, setGithubOptIn] = useState(false);
  const [ghReady, setGhReady] = useState(false);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [spinner, setSpinner] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);

  const preferredShared = ['cpx12', 'cpx32', 'cpx42'];
  const preferredDedicated = ['ccx13', 'ccx23', 'ccx33'];

  const locOptions = useMemo(() => {
    return locations
      .slice()
      .sort((a, b) => a.city.localeCompare(b.city))
      .map((loc) => ({
        label: `${loc.city} (${loc.name})`,
        value: String(loc.id),
      }));
  }, [locations]);

  const sizeOptions = useMemo(() => {
    if (!location) return [];
    const filtered = serverTypes.filter((t) => {
      if (cpuClass === 'shared') return t.cpu_type === 'shared' || t.name.startsWith('cpx');
      return t.cpu_type === 'dedicated' || t.name.startsWith('ccx');
    });
    const available = filtered.filter((t) => hasLocationPrice(t, location.name));
    const preferred = cpuClass === 'shared' ? preferredShared : preferredDedicated;
    const ordered: HetznerServerType[] = [];
    const added = new Set<string>();
    for (const name of preferred) {
      const item = available.find((t) => t.name === name);
      if (item) {
        ordered.push(item);
        added.add(item.name);
      }
    }
    for (const item of available) {
      if (!added.has(item.name)) ordered.push(item);
    }
    return ordered.map((t) => {
      const price = priceForLocation(t, location.name);
      const priceLabel = price ? `EUR ${price}/mo` : 'price n/a';
      const label = `${t.name} - ${t.cores} vCPU, ${t.memory} GB RAM, ${t.disk} GB SSD - ${priceLabel}`;
      return { label, value: String(t.id) };
    });
  }, [serverTypes, cpuClass, location]);

  useInput((input, key) => {
    if (input.toLowerCase() === 'q') {
      exit();
      return;
    }
    if (phase === 'confirm' && key.return) {
      setPhase('running');
      return;
    }
    if (phase === 'done' && key.return) {
      exit();
      return;
    }
    if (phase === 'error' && key.return) {
      exit();
      return;
    }
    if (key.escape || key.leftArrow) {
      switch (phase) {
        case 'intro':
          exit();
          return;
        case 'token':
          setPhase('intro');
          return;
        case 'location':
          setPhase('token');
          return;
        case 'class':
          setPhase('location');
          return;
        case 'size':
          setPhase('class');
          return;
        case 'name':
          setPhase('size');
          return;
        case 'ssh-key':
          setPhase('name');
          return;
        case 'dest':
          setPhase('ssh-key');
          return;
        case 'github':
          setPhase('dest');
          return;
        case 'confirm':
          setPhase('github');
          return;
        default:
          return;
      }
    }
  });

  useEffect(() => {
    if (phase !== 'loading') return;
    let cancelled = false;
    const load = async () => {
      try {
        const apiToken = token || process.env.HETZNER_API_TOKEN || '';
        if (!apiToken) {
          throw new Error('Hetzner API token is required');
        }
        const [locs, types] = await Promise.all([
          listLocations(apiToken),
          listServerTypes(apiToken),
        ]);
        if (cancelled) return;
        setLocations(locs);
        setServerTypes(types);
        setPhase('location');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load Hetzner data');
        setPhase('error');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [phase, token]);

  useEffect(() => {
    if (phase !== 'github') return;
    const ready = ghAvailable();
    const repo = detectGitHubRepo();
    setGhReady(ready && !!repo);
    setGithubRepo(repo ? `${repo.owner}/${repo.name}` : null);
    if (!ready || !repo) {
      setGithubOptIn(false);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'loading' && phase !== 'running') return;
    const timer = setInterval(() => setSpinner((s) => nextSpinnerFrame(s)), 100);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    let cancelled = false;
    const run = async () => {
      try {
        const apiToken = token || process.env.HETZNER_API_TOKEN || '';
        if (!apiToken) throw new Error('Hetzner API token is required');
        if (!location || !serverType) throw new Error('Missing server details');

        const warnings: string[] = [];

        setCurrentStep('Preparing SSH key');
        const { publicKey } = ensureLocalSshKey(keyPath, `changes-${serverName}`);

        setCurrentStep('Checking Hetzner SSH keys');
        let keys = await listSshKeys(apiToken);
        const keyName = `changes-${serverName}`;
        const normalizedKey = publicKey.trim();
        let sshKey =
          keys.find((k) => (k.public_key || '').trim() === normalizedKey) ||
          keys.find((k) => k.name === keyName);
        if (!sshKey) {
          try {
            sshKey = await createSshKey(apiToken, keyName, publicKey);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'SSH key error';
            if (/not unique/i.test(msg)) {
              keys = await listSshKeys(apiToken);
              sshKey = keys.find((k) => (k.public_key || '').trim() === normalizedKey);
            }
            if (!sshKey) throw err;
          }
        }

        setCurrentStep('Checking existing servers');
        const servers = await listServers(apiToken);
        let server: HetznerServer | undefined = servers.find((s) => s.name === serverName);
        const reused = !!server;
        if (!server) {
          setCurrentStep('Creating server');
          server = await createServer(apiToken, {
            name: serverName,
            server_type: serverType.name,
            location: location.name,
            image: 'ubuntu-24.04',
            ssh_keys: [sshKey.id],
          });
        } else if (server.status === 'off' || server.status === 'stopped') {
          setCurrentStep('Starting server');
          await powerOnServer(apiToken, server.id);
        }

        setCurrentStep('Waiting for server');
        const ready = await waitForServerReady(apiToken, server.id, {
          maxWaitMs: 10 * 60 * 1000,
          pollMs: 5000,
        });
        const ip = ready.public_net?.ipv4?.ip;
        if (!ip) throw new Error('Server IP not found');

        setCurrentStep('Writing SSH config');
        upsertSshConfig({
          alias: serverName,
          host: ip,
          user: 'root',
          identityFile: keyPath,
        });

        setCurrentStep('Checking SSH connection');
        await ensureSshAccess(serverName, ip);

        setCurrentStep('Checking install path');
        await ensureRemoteWritable(serverName, dest);

        const localCommit = getLocalCommit();
        let skipDeploy = false;
        if (localCommit) {
          setCurrentStep('Checking deploy state');
          const remoteCommit = await readRemoteCommit(serverName, dest);
          if (remoteCommit && remoteCommit === localCommit) {
            skipDeploy = true;
          }
        }

        if (!skipDeploy) {
          setCurrentStep('Deploying app');
          const deploy = await runAsync(`bun run deploy --host ${serverName} --dest ${dest}`);
          if (!deploy.ok) {
            throw new Error(deploy.stderr || 'Deploy failed');
          }
        }

        let githubRepoName: string | undefined;
        if (githubOptIn) {
          if (!ghAvailable()) {
            warnings.push('GitHub CLI not found; skipped GitHub setup');
          } else if (!ghAuthed()) {
            warnings.push('GitHub CLI not authenticated; skipped GitHub setup');
          } else {
            const repo = detectGitHubRepo();
            if (!repo) {
              warnings.push('No GitHub repo found; skipped GitHub setup');
            } else {
              setCurrentStep('Creating deploy key');
              const privateKey = await generateDeployKey(serverName);
              githubRepoName = `${repo.owner}/${repo.name}`;
              setCurrentStep('Setting GitHub secrets');
              const secrets = [
                setSecret(repo, 'DEPLOY_SSH_HOST', ip),
                setSecret(repo, 'DEPLOY_SSH_USER', 'root'),
                setSecret(repo, 'DEPLOY_SSH_KEY', privateKey),
              ];
              if (secrets.some((s) => !s.ok)) {
                warnings.push('Failed to set one or more GitHub secrets');
              }
              setCurrentStep('Setting GitHub variables');
              const vars = [
                setVariable(repo, 'DEPLOY_SSH_ALIAS', serverName),
                setVariable(repo, 'DEPLOY_PATH', dest),
                setVariable(repo, 'DEPLOY_NOTIFY', 'true'),
                setVariable(repo, 'DEPLOY_ENABLED', 'true'),
              ];
              if (vars.some((v) => !v.ok)) {
                warnings.push('Failed to set one or more GitHub variables');
              }
            }
          }
        }

        try {
          await setHostDest(serverName, dest);
        } catch {
          warnings.push('Could not save deploy host and path locally');
        }

        setResult({
          serverId: ready.id,
          serverName,
          serverIp: ip,
          sshAlias: serverName,
          dest,
          reusedServer: reused,
          warnings,
          githubRepo: githubRepoName,
        });

        if (cancelled) return;
        setPhase('done');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Setup failed');
        setPhase('error');
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [phase, token, location, serverType, serverName, dest, githubOptIn]);

  if (phase === 'intro') {
    return (
      <SelectScreen
        title="Setup VPS"
        items={[
          {label: 'Start', value: 'start'},
          {label: 'Exit', value: 'exit'},
        ]}
        hint="Enter to select, Esc to exit"
        onSelect={(item) => {
          if (item.value === 'exit') exit();
          if (item.value === 'start') setPhase('token');
        }}
        description={
          <ScreenSection>
            <Text>Creates a Hetzner VPS and deploys this app.</Text>
            <Text>Costs money. This will create cloud resources.</Text>
          </ScreenSection>
        }
      />
    );
  }

  if (phase === 'token') {
    return (
      <InputScreen
        title="Hetzner Token"
        prompt="Hetzner API token"
        value={tokenInput}
        onChange={setTokenInput}
        onSubmit={(value) => {
          const v = value.trim();
          const envToken = process.env.HETZNER_API_TOKEN || '';
          const resolved = v || envToken;
          if (!resolved) {
            setNotice('Token required. Or set HETZNER_API_TOKEN.');
            return;
          }
          setNotice(null);
          setToken(resolved);
          setPhase('loading');
        }}
        inputKey="vps-token"
        mask="*"
        description={
          <ScreenSection>
            <Text>Enter token or leave blank to use HETZNER_API_TOKEN.</Text>
            <Text>Get a token here:</Text>
            <Text>{'  https://console.hetzner.cloud/projects'}</Text>
            {notice ? <Text color="red">{notice}</Text> : null}
          </ScreenSection>
        }
      />
    );
  }

  if (phase === 'loading') {
    return (
      <PassiveScreen title="Loading" hint="Please wait">
        <Text>Loading Hetzner data {spinnerFrames[spinner]}</Text>
      </PassiveScreen>
    );
  }

  if (phase === 'location') {
    return (
      <SelectScreen
        title="Region"
        items={locOptions}
        hint="Enter to select, Esc to go back"
        onSelect={(item) => {
          const selected = locations.find((l) => String(l.id) === item.value);
          if (selected) {
            setLocation(selected);
            setPhase('class');
          }
        }}
        description={<Text>Select a region for your server.</Text>}
      />
    );
  }

  if (phase === 'class') {
    return (
      <SelectScreen
        title="Server Type"
        items={[
          {label: 'Shared CPU (CPX)', value: 'shared'},
          {label: 'Dedicated CPU (CCX)', value: 'dedicated'},
        ]}
        hint="Enter to select, Esc to go back"
        onSelect={(item) => {
          setCpuClass(item.value as CpuClass);
          setPhase('size');
        }}
        description={<Text>Pick shared or dedicated CPU.</Text>}
      />
    );
  }

  if (phase === 'size') {
    const hasSizes = sizeOptions.length > 0;
    return (
      <SelectScreen
        title="Size"
        items={sizeOptions}
        hint="Enter to select, Esc to go back"
        onSelect={(item) => {
          const selected = serverTypes.find((t) => String(t.id) === item.value);
          if (selected) {
            setServerType(selected);
            setPhase('name');
          }
        }}
        description={
          hasSizes
            ? <Text>Pick a server size.</Text>
            : <Text>No sizes available in this region for this class.</Text>
        }
      />
    );
  }

  if (phase === 'name') {
    return (
      <InputScreen
        title="Server Name"
        prompt="Name"
        value={serverName}
        onChange={setServerName}
        onSubmit={(value) => {
          const v = value.trim();
          if (!v) {
            setNotice('Name required');
            return;
          }
          setNotice(null);
          setServerName(v);
          setPhase('ssh-key');
        }}
        inputKey="vps-name"
        description={
          <ScreenSection>
            <Text>Server name (also used as SSH alias).</Text>
            {notice ? <Text color="red">{notice}</Text> : null}
          </ScreenSection>
        }
      />
    );
  }

  if (phase === 'ssh-key') {
    const keys = listLocalSshKeys();
    const items: SelectOption<string>[] = [];
    items.push({ label: 'Create new key (changes_vps)', value: 'create' });
    for (const key of keys) {
      items.push({ label: `Use existing key: ${key.name}`, value: key.privatePath });
    }
    return (
      <SelectScreen
        title="SSH Key"
        items={items}
        hint="Enter to select, Esc to go back"
        onSelect={(item) => {
          if (item.value === 'create') {
            setKeyPath(defaultKeyPath());
            setPhase('dest');
            return;
          }
          setKeyPath(item.value);
          setPhase('dest');
        }}
        description={
          <ScreenSection>
            <Text>Select an SSH key to use for this server.</Text>
            {keys.length === 0 ? <Text>No local SSH keys found.</Text> : null}
          </ScreenSection>
        }
      />
    );
  }

  if (phase === 'dest') {
    return (
      <InputScreen
        title="Install Path"
        prompt="Path"
        value={dest}
        onChange={setDest}
        onSubmit={(value) => {
          const v = value.trim() || '/opt/changes';
          setDest(v);
          setPhase('github');
        }}
        inputKey="vps-dest"
        description={<Text>Install path on the server.</Text>}
      />
    );
  }

  if (phase === 'github') {
    if (!ghReady) {
      return (
        <SelectScreen
          title="GitHub"
          items={[{label: 'Skip GitHub setup', value: 'skip'}]}
          hint="Enter to continue, Esc to go back"
          onSelect={() => {
            setGithubOptIn(false);
            setPhase('confirm');
          }}
          description={
            <ScreenSection>
              <Text>GitHub setup is not available.</Text>
              <Text>Install gh and make sure a GitHub repo is set.</Text>
            </ScreenSection>
          }
        />
      );
    }
    return (
      <SelectScreen
        title="GitHub"
        items={[
          {label: 'Yes, set GitHub deploy secrets', value: 'yes'},
          {label: 'No, skip GitHub setup', value: 'no'},
        ]}
        hint="Enter to select, Esc to go back"
        onSelect={(item) => {
          setGithubOptIn(item.value === 'yes');
          setPhase('confirm');
        }}
        description={
          <ScreenSection>
            <Text>Repo: {githubRepo}</Text>
            <Text>Opt-in only. Uses gh CLI.</Text>
          </ScreenSection>
        }
      />
    );
  }

  if (phase === 'confirm') {
    const items: SelectOption<'start' | 'back'>[] = [
      {label: 'Start setup', value: 'start'},
      {label: 'Back', value: 'back'},
    ];
    return (
      <SelectScreen
        title="Confirm"
        items={items}
        hint="Enter to select, Esc to go back"
        onSelect={(item) => {
          if (item.value === 'start') setPhase('running');
          if (item.value === 'back') setPhase('github');
        }}
        description={
          <ScreenSection>
            <Text>Server: {serverName}</Text>
            <Text>Region: {location?.city} ({location?.name})</Text>
            <Text>Type: {serverType?.name}</Text>
            <Text>Install path: {dest}</Text>
            <Text>SSH key: {keyPath}</Text>
            <Text>GitHub setup: {githubOptIn ? 'yes' : 'no'}</Text>
          </ScreenSection>
        }
      />
    );
  }

  if (phase === 'running') {
    return (
      <PassiveScreen title="Setting up" hint="Please wait">
        <Text>{currentStep} {spinnerFrames[spinner]}</Text>
      </PassiveScreen>
    );
  }

  if (phase === 'done') {
    const warnings = result?.warnings ?? [];
    return (
      <PassiveScreen title="Done" hint="Enter to exit">
        <Text>Server is ready.</Text>
        {result ? (
          <>
            <Text>IP: {result.serverIp}</Text>
            <Text>SSH: ssh {result.sshAlias}</Text>
            <Text>Path: {result.dest}</Text>
            <Text>Dashboard: bun changes --remote {result.sshAlias}</Text>
            {result.reusedServer ? <Text>Reused existing server.</Text> : null}
            {result.githubRepo ? <Text>GitHub repo: {result.githubRepo}</Text> : null}
          </>
        ) : null}
        {warnings.length > 0 ? (
          <>
            <Text>Warnings:</Text>
            {warnings.map((w) => (
              <Text key={w}>- {w}</Text>
            ))}
          </>
        ) : null}
      </PassiveScreen>
    );
  }

  return (
    <PassiveScreen title="Error" hint="Enter to exit">
      <Text>{error || 'Unknown error'}</Text>
    </PassiveScreen>
  );
}

function priceForLocation(type: HetznerServerType, locationName: string): string | null {
  const entry = type.prices.find((p) => p.location === locationName);
  if (!entry) return null;
  const gross = Number(entry.price_monthly.gross);
  if (!Number.isFinite(gross)) return entry.price_monthly.gross;
  return gross.toFixed(2);
}

function hasLocationPrice(type: HetznerServerType, locationName: string): boolean {
  return type.prices.some((p) => p.location === locationName);
}

function getLocalCommit(): string | null {
  const result = run('git rev-parse HEAD');
  if (!result.ok) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

async function readRemoteCommit(alias: string, destPath: string): Promise<string | null> {
  const cmd = `ssh ${alias} 'bash -lc "test -f ${destPath}/.deploy_commit && cat ${destPath}/.deploy_commit"'`;
  const result = await runAsync(cmd);
  if (!result.ok) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

async function ensureRemoteWritable(alias: string, destPath: string): Promise<void> {
  const cmd = `ssh ${alias} 'bash -lc "mkdir -p ${destPath} && test -w ${destPath}"'`;
  const result = await runAsync(cmd);
  if (!result.ok) {
    throw new Error('Install path is not writable');
  }
}

async function ensureSshAccess(alias: string, hostIp: string): Promise<void> {
  const cmd = `ssh -o StrictHostKeyChecking=accept-new ${alias} "true"`;
  const start = Date.now();
  const timeoutMs = 2 * 60 * 1000;
  let lastError = '';
  while (Date.now() - start < timeoutMs) {
    const result = await runAsync(cmd);
    if (result.ok) return;
    const combined = `${result.stderr}\n${result.stdout}`;
    if (/REMOTE HOST IDENTIFICATION HAS CHANGED!/i.test(combined)) {
      await runAsync(`ssh-keygen -R ${alias}`);
      await runAsync(`ssh-keygen -R ${hostIp}`);
      continue;
    }
    if (/Connection refused|No route to host|Operation timed out|Network is unreachable/i.test(combined)) {
      lastError = combined.trim();
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    throw new Error(combined.trim() || 'SSH failed');
  }
  throw new Error(lastError || 'SSH not ready');
}

const {waitUntilExit} = render(<SetupVpsApp />);
await waitUntilExit;
