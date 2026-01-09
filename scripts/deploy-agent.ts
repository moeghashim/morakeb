#!/usr/bin/env bun

/**
 * Deployment Agent - Automated deployment to GitHub and Cloudflare
 * 
 * Runs as a background agent to execute deployment plan:
 * 1. Pre-deployment checks (typecheck, test)
 * 2. Push to GitHub
 * 3. Deploy to Cloudflare Workers
 * 
 * Usage:
 *   bun scripts/deploy-agent.ts [--dry-run] [--skip-checks] [--skip-github] [--skip-cloudflare] [--daemon]
 * 
 * Environment:
 *   CLOUDFLARE_API_TOKEN    Cloudflare API token
 *   CLOUDFLARE_ACCOUNT_ID   Cloudflare account ID
 *   GITHUB_TOKEN            GitHub token (optional, uses git if not set)
 */

type Options = {
  dryRun: boolean;
  skipChecks: boolean;
  skipGithub: boolean;
  skipCloudflare: boolean;
  daemon: boolean;
  logFile?: string;
};

const HELP = `
Deployment Agent - Automated deployment to GitHub and Cloudflare

Usage:
  bun scripts/deploy-agent.ts [options]

Options:
  --dry-run              Show what would be done without executing
  --skip-checks          Skip pre-deployment checks (typecheck, test)
  --skip-github          Skip GitHub push step
  --skip-cloudflare      Skip Cloudflare deployment step
  --daemon               Run as background daemon (logs to file)
  --log-file <path>      Log file path (default: ./deploy-agent.log)
  -h, --help             Show this help

Environment:
  CLOUDFLARE_API_TOKEN   Cloudflare API token (required for Cloudflare deploy)
  CLOUDFLARE_ACCOUNT_ID  Cloudflare account ID (required for Cloudflare deploy)
  GITHUB_TOKEN           GitHub token (optional, uses git credentials if not set)

Examples:
  # Dry run to see what would happen
  bun scripts/deploy-agent.ts --dry-run
  
  # Full deployment
  bun scripts/deploy-agent.ts
  
  # Deploy only to Cloudflare (skip GitHub)
  bun scripts/deploy-agent.ts --skip-github
  
  # Run as background daemon
  bun scripts/deploy-agent.ts --daemon
`;

function parseArgs(argv: string[]): Options | 'help' {
  if (argv.includes('-h') || argv.includes('--help')) return 'help';
  
  const opts: Options = {
    dryRun: false,
    skipChecks: false,
    skipGithub: false,
    skipCloudflare: false,
    daemon: false,
  };
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    if (arg === '--skip-checks') { opts.skipChecks = true; continue; }
    if (arg === '--skip-github') { opts.skipGithub = true; continue; }
    if (arg === '--skip-cloudflare') { opts.skipCloudflare = true; continue; }
    if (arg === '--daemon') { opts.daemon = true; continue; }
    if (arg === '--log-file') { opts.logFile = next(); continue; }
  }
  
  return opts;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function log(message: string, stream: 'stdout' | 'stderr' = 'stdout') {
  const msg = `[${timestamp()}] ${message}`;
  if (stream === 'stderr') {
    console.error(msg);
  } else {
    console.log(msg);
  }
  return msg;
}

async function run(cmd: string[], input?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const hasSpawn = typeof (Bun as any).spawn === 'function';
  if (hasSpawn) {
    const proc = Bun.spawn(cmd, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    if (input && proc.stdin) {
      await proc.stdin.write(input);
      proc.stdin.end();
    }
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, code };
  }
  const Cmd = (Bun as any).Command;
  if (typeof Cmd === 'function') {
    const p = new Cmd(cmd, { stdin: input ? 'pipe' : 'inherit', stdout: 'pipe', stderr: 'pipe' });
    const proc = p.spawn();
    if (input) await proc.stdin.write(input);
    const stdout = await proc.stdout.text();
    const stderr = await proc.stderr.text();
    const code = await proc.exited;
    return { stdout, stderr, code };
  }
  throw new Error('Neither Bun.spawn nor Bun.Command available in this runtime');
}

async function checkPrerequisites(opts: Options): Promise<void> {
  log('Checking prerequisites...');
  
  // Check git
  const gitCheck = await run(['git', '--version']);
  if (gitCheck.code !== 0) {
    throw new Error('git not found. Install git to continue.');
  }
  
  // Check if we're in a git repo
  const repoCheck = await run(['git', 'rev-parse', '--git-dir']);
  if (repoCheck.code !== 0) {
    throw new Error('Not in a git repository.');
  }
  
  // Check for uncommitted changes
  const statusCheck = await run(['git', 'status', '--porcelain']);
  if (statusCheck.stdout.trim() && !opts.dryRun) {
    log('Warning: Uncommitted changes detected', 'stderr');
  }
  
  // Check wrangler if deploying to Cloudflare
  if (!opts.skipCloudflare) {
    const wranglerCheck = await run(['wrangler', '--version']);
    if (wranglerCheck.code !== 0) {
      throw new Error('wrangler CLI not found. Install: npm install -g wrangler');
    }
    
    if (!Bun.env.CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN environment variable not set');
    }
    if (!Bun.env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable not set');
    }
  }
  
  log('Prerequisites check passed');
}

async function runPreDeploymentChecks(opts: Options): Promise<void> {
  if (opts.skipChecks) {
    log('Skipping pre-deployment checks');
    return;
  }
  
  log('Running pre-deployment checks...');
  
  // Type check
  log('Running typecheck...');
  const typecheck = await run(['bun', 'typecheck']);
  if (typecheck.code !== 0) {
    throw new Error(`Typecheck failed: ${typecheck.stderr || typecheck.stdout}`);
  }
  
  // Tests
  log('Running tests...');
  const test = await run(['bun', 'test']);
  if (test.code !== 0) {
    throw new Error(`Tests failed: ${test.stderr || test.stdout}`);
  }
  
  log('Pre-deployment checks passed');
}

async function pushToGithub(opts: Options): Promise<void> {
  if (opts.skipGithub) {
    log('Skipping GitHub push');
    return;
  }
  
  log('Pushing to GitHub...');
  
  if (opts.dryRun) {
    log('(dry-run) Would push to GitHub');
    return;
  }
  
  // Get current branch
  const branchCheck = await run(['git', 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchCheck.code !== 0) {
    throw new Error('Failed to get current branch');
  }
  const branch = branchCheck.stdout.trim();
  
  // Check if there are commits to push
  const statusCheck = await run(['git', 'status', '-sb']);
  const hasAhead = statusCheck.stdout.includes('ahead');
  
  if (!hasAhead) {
    log('No commits to push');
    return;
  }
  
  // Push to origin
  const push = await run(['git', 'push', 'origin', branch]);
  if (push.code !== 0) {
    throw new Error(`Git push failed: ${push.stderr || push.stdout}`);
  }
  
  log(`Pushed to GitHub (branch: ${branch})`);
}

async function deployToCloudflare(opts: Options): Promise<void> {
  if (opts.skipCloudflare) {
    log('Skipping Cloudflare deployment');
    return;
  }
  
  log('Deploying to Cloudflare...');
  
  if (opts.dryRun) {
    log('(dry-run) Would deploy to Cloudflare');
    return;
  }
  
  // Check wrangler.toml exists
  const { existsSync } = await import('node:fs');
  if (!existsSync('wrangler.toml')) {
    throw new Error('wrangler.toml not found. Create it first.');
  }
  
  // Deploy with wrangler (use empty env to target top-level config)
  const deploy = await run(['wrangler', 'deploy', '--env', ''], undefined);
  if (deploy.code !== 0) {
    const errorMsg = deploy.stderr || deploy.stdout;
    if (errorMsg.includes('Authentication error')) {
      throw new Error(`Cloudflare deployment failed: API token missing required permissions.\n` +
        `Required permissions: Workers Scripts:Edit, D1:Edit, Queues:Edit\n` +
        `Update token: https://dash.cloudflare.com/profile/api-tokens\n` +
        `Original error: ${errorMsg}`);
    }
    throw new Error(`Cloudflare deployment failed: ${errorMsg}`);
  }
  
  log('Deployed to Cloudflare successfully');
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed === 'help') {
    console.log(HELP);
    return;
  }
  
  const opts = parsed;
  
  try {
    log('Starting deployment agent...');
    
    await checkPrerequisites(opts);
    await runPreDeploymentChecks(opts);
    await pushToGithub(opts);
    await deployToCloudflare(opts);
    
    log('Deployment completed successfully');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`Deployment failed: ${msg}`, 'stderr');
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Fatal error: ${msg}`, 'stderr');
    process.exit(1);
  });
}

export { run, checkPrerequisites, runPreDeploymentChecks, pushToGithub, deployToCloudflare };
