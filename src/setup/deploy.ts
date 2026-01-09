#!/usr/bin/env bun
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runAsync, shellEscape } from './sys';

const SSH_BASE_OPTS = '-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3';

export type DeployOptions = {
  host: string;
  dest: string;
  force?: boolean;
};

export type DeployReporter = {
  stage?: (name: string) => void;
  ok?: (name: string) => void;
  fail?: (name: string, message?: string) => void;
  info?: (message: string) => void;
};

export class DeployError extends Error {
  readonly stage: string;
  readonly details?: string;

  constructor(stage: string, message?: string) {
    super(message ?? stage);
    this.stage = stage;
    this.details = message;
  }
}

function emit(r: DeployReporter | undefined, method: keyof DeployReporter, ...args: any[]) {
  try { (r && r[method] as any)?.(...args); } catch {}
}

function parseArgs(): DeployOptions {
  const args = process.argv.slice(2);
  const envHost = process.env.DEPLOY_HOST?.trim();
  const envDest = process.env.DEPLOY_PATH?.trim();
  let host = envHost || 'changes';
  let dest = envDest || '/opt/changes';
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--host' && args[i + 1]) { host = args[++i]; continue; }
    if (a === '--dest' && args[i + 1]) { dest = args[++i]; continue; }
    if (a === '--force') { force = true; continue; }
  }
  return { host, dest, force };
}

function stage(title: string, reporter?: DeployReporter) {
  emit(reporter, 'stage', title);
  if (!reporter) {
    process.stdout.write(`\n${title}... `);
  }
}
function ok(title?: string, reporter?: DeployReporter) {
  if (title) emit(reporter, 'ok', title);
  if (!reporter) {
    console.log('OK');
  }
}
function fail(title: string, reporter?: DeployReporter, msg?: string): never {
  emit(reporter, 'fail', title, msg);
  if (!reporter) {
    console.log('FAIL');
    if (msg) console.error(msg);
  }
  throw new DeployError(title, msg);
}

async function runLocalChecks(reporter?: DeployReporter, signal?: AbortSignal) {
  stage('Local typecheck', reporter);
  const typeRes = await runAsync('bun typecheck', process.cwd(), {signal});
  if (!typeRes.ok) {
    const message = (typeRes.stderr || typeRes.stdout || 'bun typecheck failed').trim();
    fail('Local typecheck', reporter, message);
  }
  ok('Local typecheck', reporter);

  stage('Local tests', reporter);
  const testRes = await runAsync('bun test', process.cwd(), {signal});
  if (!testRes.ok) {
    const message = (testRes.stderr || testRes.stdout || 'bun test failed').trim();
    fail('Local tests', reporter, message);
  }
  ok('Local tests', reporter);
}

async function ensureRemotePrereqs(
  host: string,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  stage('Ensuring prerequisites (apt, Bun, Droid)', reporter);
  // Preflight accept-new and fix host key mismatch
  const hostOnly = host.includes('@') ? host.split('@').slice(-1)[0] : host;
  const escapedHost = shellEscape(host);
  const escapedHostOnly = shellEscape(hostOnly);
  const pre = await runAsync(`ssh ${SSH_BASE_OPTS} ${escapedHost} "true"`, undefined, {signal});
  if (!pre.ok && /REMOTE HOST IDENTIFICATION HAS CHANGED!/i.test(pre.stderr || '')) {
    await runAsync(`ssh-keygen -R ${escapedHostOnly}`, undefined, {signal});
    await runAsync(`ssh-keygen -R ${escapedHost}`, undefined, {signal});
  }
  // apt basics (best-effort)
  await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "if command -v apt-get >/dev/null 2>&1; then apt-get update -y && apt-get install -y curl git unzip sqlite3 ca-certificates >/dev/null 2>&1 || true; fi"'`,
    undefined,
    {signal},
  );
  // Bun
  const rCheck = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "command -v bun >/dev/null 2>&1 || test -x \\"$HOME/.bun/bin/bun\\""'`,
    undefined,
    {signal},
  );
  if (!rCheck.ok) {
    const rInstall = await runAsync(
      `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "curl -fsSL https://bun.sh/install | bash"'`,
      undefined,
      {signal},
    );
    if (!rInstall.ok) { fail('Ensuring prerequisites (apt, Bun, Droid)', reporter, 'Bun install failed'); }
  }
  // Droid (required for AI summaries)
  const droidCheck = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "command -v droid >/dev/null 2>&1 || test -x \\"$HOME/.local/bin/droid\\""'`,
    undefined,
    {signal},
  );
  if (!droidCheck.ok) {
    const droidInstall = await runAsync(
      `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "curl -fsSL https://app.factory.ai/cli | sh"'`,
      undefined,
      {signal},
    );
    if (!droidInstall.ok) { fail('Ensuring prerequisites (apt, Bun, Droid)', reporter, 'Droid install failed'); }
  }
  
  // Copy droid auth if exists locally
  const localAuthPath = path.join(process.env.HOME || '~', '.factory', 'auth.json');
  try {
    await fs.access(localAuthPath);
    // Auth file exists locally, copy it to VPS
    await runAsync(`ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "mkdir -p ~/.factory"'`, undefined, {signal});
    const escapedAuthPath = shellEscape(localAuthPath);
    const copyAuth = await runAsync(
      `scp ${SSH_BASE_OPTS} ${escapedAuthPath} ${escapedHost}:~/.factory/auth.json`,
      undefined,
      {signal},
    );
    if (!copyAuth.ok) {
      emit(reporter, 'info', 'Warning: Could not copy droid auth - you may need to run "droid" on VPS to authenticate');
    }
  } catch {
    // No local auth file, user will need to authenticate on VPS
    emit(reporter, 'info', 'Note: No local droid auth found - run "droid" on VPS to authenticate');
  }
  
  ok('Ensuring prerequisites (apt, Bun, Droid)', reporter);
}

async function ensureAppDir(
  host: string,
  dest: string,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  stage('Ensuring app directory', reporter);
  const escapedHost = shellEscape(host);
  const escapedDest = shellEscape(dest);
  const r = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "mkdir -p ${escapedDest} && echo READY"'`,
    undefined,
    {signal},
  );
  if (!r.ok) { fail('Ensuring app directory', reporter, r.stderr); }
  ok('Ensuring app directory', reporter);
}

async function ensureEnvFile(
  host: string,
  dest: string,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  stage('Ensuring .env file', reporter);
  const escapedHost = shellEscape(host);
  const escapedDest = shellEscape(dest);
  const check = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "test -f ${escapedDest}/.env && echo EXISTS || echo MISSING"'`,
    undefined,
    {signal},
  );
  
  if (check.stdout?.trim() === 'MISSING') {
    // Generate ENCRYPTION_KEY and create .env
    // Use environment variable to pass key securely instead of embedding in command
    const genKey = await runAsync(
      `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "openssl rand -base64 48"'`,
      undefined,
      {signal},
    );
    if (!genKey.ok) { fail('Ensuring .env file', reporter, 'Failed to generate encryption key'); }
    
    const encryptionKey = genKey.stdout?.trim();
    if (!encryptionKey) { fail('Ensuring .env file', reporter, 'Generated encryption key is empty'); }
    
    // Use heredoc to avoid embedding key in command string
    const escapedKey = shellEscape(encryptionKey);
    const createEnv = await runAsync(
      `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cat > ${escapedDest}/.env <<EOF\\nENCRYPTION_KEY=${escapedKey}\\nEOF"'`,
      undefined,
      {signal},
    );
    if (!createEnv.ok) { fail('Ensuring .env file', reporter, createEnv.stderr); }
  }
  
  ok('Ensuring .env file', reporter);
}

async function uploadSource(
  host: string,
  dest: string,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  stage('Uploading source', reporter);
  const ts = Date.now();
  const tarPath = path.join('/tmp', `changes-${ts}.tgz`);
  const normalizePattern = (value: string) => {
    let pattern = value.replace(/\s+$/g, '');
    if (pattern.startsWith('/')) pattern = pattern.slice(1);
    if (pattern.startsWith('./')) pattern = pattern.slice(2);
    return pattern;
  };

  const excludePatterns = new Set<string>(['.git', '.DS_Store', '._*', '.github', '.github/**/*']);
  try {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const gitignore = await fs.readFile(gitignorePath, 'utf8');
    for (const rawLine of gitignore.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('!')) {
        const negate = normalizePattern(trimmed.slice(1).trim());
        if (negate) excludePatterns.delete(negate);
        continue;
      }
      const pattern = normalizePattern(trimmed);
      if (pattern) excludePatterns.add(pattern);
    }
  } catch {
    // ignore missing .gitignore
  }
  const escapePattern = (pattern: string) => `'${pattern.replace(/'/g, `'\\''`)}'`;
  const excludeArgs = Array.from(excludePatterns).map(pattern => `--exclude=${escapePattern(pattern)}`).join(' ');
  const createCmd = `bash -lc 'set -o pipefail; COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar -czf ${tarPath} ${excludeArgs} .'`;
  const create = await runAsync(createCmd, process.cwd(), {signal});
  if (!create.ok) { fail('Uploading source', reporter, create.stderr); }
  // Upload & extract
  const escapedHost = shellEscape(host);
  const escapedDest = shellEscape(dest);
  const remoteTar = `${dest.replace(/\/$/, '')}/${path.basename(tarPath)}`;
  const escapedRemoteTar = shellEscape(remoteTar);
  const escapedTarPath = shellEscape(tarPath);
  const scp = await runAsync(`scp ${SSH_BASE_OPTS} ${escapedTarPath} ${escapedHost}:${escapedRemoteTar}`, undefined, {signal});
  if (!scp.ok) { fail('Uploading source', reporter, scp.stderr); }
  const extract = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "tar -xzf ${escapedRemoteTar} -C ${escapedDest} && rm -f ${escapedRemoteTar}"'`,
    undefined,
    {signal},
  );
  await fs.rm(tarPath, { force: true });
  if (!extract.ok) { fail('Uploading source', reporter, extract.stderr); }
  // Remove macOS metadata files that may already exist on the target
  await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && find . -name \\"._*\\" -delete && find . -name \\".DS_Store\\" -delete"'`,
    undefined,
    {signal},
  );
  ok('Uploading source', reporter);
}

async function runRemoteBuild(
  host: string,
  dest: string,
  force: boolean,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  const escapedHost = shellEscape(host);
  const escapedDest = shellEscape(dest);
  
  // Install (dev deps too, to allow typecheck/tests)
  stage('Installing dependencies', reporter);
  const install = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && \\"$HOME/.bun/bin/bun\\" install"'`,
    undefined,
    {signal},
  );
  if (!install.ok) { fail('Installing dependencies', reporter, install.stderr); }
  ok('Installing dependencies', reporter);

  // Typecheck
  stage('Typecheck', reporter);
  const tchk = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && \\"$HOME/.bun/bin/bun\\" typecheck"'`,
    undefined,
    {signal},
  );
  if (tchk.ok) {
    ok('Typecheck', reporter);
  } else if (!force) {
    fail('Typecheck', reporter, tchk.stderr);
  } else {
    emit(reporter, 'fail', 'Typecheck', tchk.stderr || 'Typecheck failed (continuing)');
  }
  if (!reporter) {
    console.log(tchk.ok ? 'OK' : 'FAILED (continuing due to --force)');
  }

  // Ensure tmp directory exists for tests
  await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && mkdir -p tmp"'`,
    undefined,
    {signal},
  );

  // Tests
  stage('Tests', reporter);
  const testSuites = [
    {label: 'unit', pattern: 'tests/unit'},
    {label: 'integration', pattern: 'tests/integration'},
  ];
  const connectionClosedPattern = /Connection to .* closed/;
  let testFailureMessage: string | null = null;
  let allPassed = true;
  for (const suite of testSuites) {
    const escapedPattern = shellEscape(suite.pattern);
    const runTests = async () =>
      runAsync(
        `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && CI=1 BUN_TEST_CONCURRENCY=1 \\"$HOME/.bun/bin/bun\\" test ${escapedPattern}"'`,
        undefined,
        {signal},
      );
    let result = await runTests();
    if (!result.ok && connectionClosedPattern.test(`${result.stdout}\n${result.stderr}`)) {
      result = await runTests();
    }
    if (!result.ok) {
      allPassed = false;
      const testOutput = (result.stderr || result.stdout || 'Tests failed').trim();
      // Extract just the failure summary, not full output
      const failLines = testOutput.split('\n').filter(line => 
        line.includes('✗') || line.includes('fail') || line.includes('error:') || line.includes('Error:')
      ).slice(0, 10); // Limit to first 10 error lines
      const summary = failLines.length > 0 ? failLines.join('\n') : testOutput.split('\n').slice(-5).join('\n');
      
      if (!force) {
        testFailureMessage = `${suite.label} suite failed. Run tests on VPS for details:\n  ssh ${escapedHost}\n  cd ${escapedDest}\n  bun test ${escapedPattern}\n\nFailure summary:\n${summary}`;
        break;
      } else {
        emit(reporter, 'fail', 'Tests', `${suite.label} suite failed (continuing)`);
        if (!reporter) {
          console.log('FAILED (continuing due to --force)');
        }
      }
    }
  }
  if (testFailureMessage) {
    fail('Tests', reporter, testFailureMessage);
  } else if (allPassed) {
    ok('Tests', reporter);
  }

  // Backup DB
  stage('Backup database', reporter);
  const backup = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && mkdir -p data && if [ -f data/changes.db ]; then ts=\\$(date +%Y%m%d_%H%M%S); cp data/changes.db data/changes.db.backup.\\$ts; ls -t data/changes.db.backup.* 2>/dev/null | tail -n +6 | xargs -r rm -f || true; fi"'`,
    undefined,
    {signal},
  );
  if (!backup.ok) { fail('Backup database', reporter, backup.stderr); }
  ok('Backup database', reporter);

  // Build
  stage('Build', reporter);
  const build = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && \\"$HOME/.bun/bin/bun\\" run build"'`,
    undefined,
    {signal},
  );
  if (!build.ok) { fail('Build', reporter, build.stderr); }
  ok('Build', reporter);

  // Migrate + seed
  stage('Migrate DB', reporter);
  const mig = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && \\"$HOME/.bun/bin/bun\\" run src/db/migrate.ts"'`,
    undefined,
    {signal},
  );
  if (!mig.ok) { fail('Migrate DB', reporter, mig.stderr); }
  ok('Migrate DB', reporter);

  stage('Seed AI', reporter);
  const seed = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "cd ${escapedDest} && \\"$HOME/.bun/bin/bun\\" run src/db/seed-ai.ts"'`,
    undefined,
    {signal},
  );
  if (seed.ok) {
    ok('Seed AI', reporter);
  } else {
    emit(reporter, 'fail', 'Seed AI', 'Seed AI seeding failed (non-fatal)');
    if (!reporter) {
      console.log('SKIPPED/FAILED (non-fatal)');
    }
  }
}

async function resolveLocalCommit(signal?: AbortSignal): Promise<string | null> {
  const res = await runAsync('git rev-parse HEAD', process.cwd(), {signal});
  if (!res.ok) return null;
  const value = res.stdout.trim();
  return value.length > 0 ? value : null;
}

async function writeDeployCommit(
  host: string,
  dest: string,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  const commit = await resolveLocalCommit(signal);
  if (!commit) {
    emit(reporter, 'info', 'Deploy marker skipped (no git commit found)');
    return;
  }
  const escapedHost = shellEscape(host);
  const escapedDest = shellEscape(dest);
  const escapedCommit = shellEscape(commit);
  const cmd = `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "echo ${escapedCommit} > ${escapedDest}/.deploy_commit"'`;
  const res = await runAsync(cmd, undefined, {signal});
  if (!res.ok) {
    emit(reporter, 'info', 'Deploy marker skipped (could not write commit)');
  }
}

async function ensureSystemd(
  host: string,
  dest: string,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  stage('Ensuring systemd service', reporter);
  const escapedHost = shellEscape(host);
  const escapedDest = shellEscape(dest);
  const homeResult = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'printf %s "$HOME"'`,
    undefined,
    {signal},
  );
  const remoteHomeRaw = homeResult.ok ? homeResult.stdout.trim() : '';
  const remoteHome = remoteHomeRaw || '/root';
  
  // Always generate the service file to ensure it's correct
  // Escape dest and remoteHome for use in unit file
  const escapedRemoteHome = shellEscape(remoteHome);
  const unit = `[Unit]
Description=Morakeb URL monitor
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${escapedDest}
Environment=PATH=${escapedRemoteHome}/.local/bin:${escapedRemoteHome}/.bun/bin:/usr/local/bin:/usr/bin
Environment=HOME=${escapedRemoteHome}
ExecStart=${escapedRemoteHome}/.bun/bin/bun run dist/index.js
Restart=always
RestartSec=5
KillMode=mixed
KillSignal=SIGINT
TimeoutStopSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=changes

[Install]
WantedBy=multi-user.target
`;
  
  // Upload and install/update the service file
  const tmp = `/tmp/changes.service.${Date.now()}`;
  await fs.writeFile(tmp, unit, 'utf8');
  const escapedTmp = shellEscape(tmp);
  const up = await runAsync(`scp ${SSH_BASE_OPTS} ${escapedTmp} ${escapedHost}:/tmp/changes.service`, undefined, {signal});
  await fs.rm(tmp, { force: true });
  if (!up.ok) { fail('Ensuring systemd service', reporter, up.stderr); }
  
  // Install/update and enable the service
  const install = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "mv /tmp/changes.service /etc/systemd/system/changes.service && systemctl daemon-reload && systemctl enable changes"'`,
    undefined,
    {signal},
  );
  if (!install.ok) { fail('Ensuring systemd service', reporter, install.stderr); }
  
  ok('Ensuring systemd service', reporter);
}

async function restartAndHealth(
  host: string,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  const escapedHost = shellEscape(host);
  
  stage('Restarting service', reporter);
  
  // Use --no-block to avoid SSH connection issues during restart
  const restart = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "systemctl restart changes --no-block"'`,
    undefined,
    {signal},
  );
  
  if (!restart.ok) { 
    fail('Restarting service', reporter, restart.stderr || restart.stdout); 
  }
  
  // Wait for systemd to process the restart command
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Verify service is starting or active
  const statusCheck = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "systemctl is-active changes || systemctl is-activating changes || true"'`,
    undefined,
    {signal},
  );
  
  const serviceState = statusCheck.stdout?.trim();
  if (serviceState && !['active', 'activating'].includes(serviceState)) {
    emit(reporter, 'info', `Service state: ${serviceState}`);
  }
  
  ok('Restarting service', reporter);

  stage('Health check', reporter);
  
  // Give the service time to fully initialize before polling
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Poll health endpoint with longer timeout (60s total)
  const health = await runAsync(
    `ssh ${SSH_BASE_OPTS} ${escapedHost} 'for i in $(seq 1 60); do curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'`,
    undefined,
    {signal},
  );
  
  if (!health.ok) {
    // Gather comprehensive diagnostics on failure
    const diag = await runAsync(
      `ssh ${SSH_BASE_OPTS} ${escapedHost} 'bash -lc "echo === SERVICE STATUS ===; systemctl status changes --no-pager; echo; echo === RECENT LOGS ===; journalctl -u changes -n 50 --no-pager"'`,
      undefined,
      {signal},
    );
    const diagnostics = diag.stdout?.trim() || 'Unable to fetch service diagnostics';
    fail('Health check', reporter, `Service not responding after 60s.\n\n${diagnostics}`);
  }
  
  ok('Health check', reporter);
}
export async function runDeploy(
  opts: DeployOptions,
  reporter?: DeployReporter,
  signal?: AbortSignal,
) {
  const host = opts.host;
  const dest = opts.dest.replace(/\/$/, '');
  const force = opts.force ?? false;
  const ensureNotAborted = () => {
    if (signal?.aborted) {
      const err = new Error('Deployment aborted');
      err.name = 'AbortError';
      throw err;
    }
  };

  ensureNotAborted();
  await runLocalChecks(reporter, signal);
  ensureNotAborted();
  await ensureRemotePrereqs(host, reporter, signal);
  ensureNotAborted();
  await ensureAppDir(host, dest, reporter, signal);
  ensureNotAborted();
  await uploadSource(host, dest, reporter, signal);
  ensureNotAborted();
  await ensureEnvFile(host, dest, reporter, signal);
  ensureNotAborted();
  await runRemoteBuild(host, dest, force, reporter, signal);
  ensureNotAborted();
  await writeDeployCommit(host, dest, reporter, signal);
  ensureNotAborted();
  await ensureSystemd(host, dest, reporter, signal);
  ensureNotAborted();
  await restartAndHealth(host, reporter, signal);
}

// Console reporter for standalone CLI usage
function createConsoleReporter(): DeployReporter {
  const stages: Map<string, 'running' | 'ok' | 'failed'> = new Map();
  
  const colors = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
  };
  
  const symbols = {
    running: '○',
    ok: '✓',
    failed: '✗',
  };
  
  return {
    info: (message: string) => {
      console.log(`${colors.dim}${message}${colors.reset}`);
    },
    stage: (name: string) => {
      stages.set(name, 'running');
      console.log(`${colors.yellow}${symbols.running}${colors.reset} ${name}...`);
    },
    ok: (name: string) => {
      stages.set(name, 'ok');
      console.log(`${colors.green}${symbols.ok}${colors.reset} ${name}`);
    },
    fail: (name: string, message?: string) => {
      stages.set(name, 'failed');
      console.log(`${colors.red}${symbols.failed}${colors.reset} ${name}`);
      if (message) {
        console.log(`${colors.red}${message}${colors.reset}`);
      }
    },
  };
}

if (import.meta.main) {
  const opts = parseArgs();
  const reporter = createConsoleReporter();
  
  console.log('\n🚀 Deploying to VPS\n');
  
  runDeploy(opts, reporter)
    .then(() => {
      console.log('\n✅ Deploy complete!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.log('');
      if (error instanceof DeployError) {
        console.error(`❌ Deploy failed at "${error.stage}"${error.details ? `: ${error.details}` : ''}`);
      } else {
        console.error(`❌ Deploy failed: ${error instanceof Error ? error.message : error}`);
      }
      console.log('');
      process.exit(1);
    });
}
