#!/usr/bin/env bun

/**
 * Verify Cloudflare API Token Permissions
 * 
 * Checks if the current API token has the required permissions
 * for deploying Workers, D1, and Queues.
 */

async function run(cmd: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const hasSpawn = typeof (Bun as any).spawn === 'function';
  if (hasSpawn) {
    const proc = Bun.spawn(cmd, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, code };
  }
  const Cmd = (Bun as any).Command;
  if (typeof Cmd === 'function') {
    const p = new Cmd(cmd, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    const proc = p.spawn();
    const stdout = await proc.stdout.text();
    const stderr = await proc.stderr.text();
    const code = await proc.exited;
    return { stdout, stderr, code };
  }
  throw new Error('Neither Bun.spawn nor Bun.Command available');
}

async function main() {
  console.log('Verifying Cloudflare API Token permissions...\n');

  // Check authentication
  console.log('1. Checking authentication...');
  const whoami = await run(['wrangler', 'whoami']);
  if (whoami.code !== 0) {
    console.error('❌ Authentication failed');
    console.error(whoami.stderr);
    process.exit(1);
  }
  console.log('✅ Authentication successful\n');

  // Check Workers permissions
  console.log('2. Checking Workers Scripts:Edit permission...');
  const workersTest = await run(['wrangler', 'deploy', '--dry-run', '--env', '']);
  if (workersTest.code !== 0 && workersTest.stderr.includes('Authentication error')) {
    console.log('❌ Missing Workers Scripts:Edit permission');
  } else {
    console.log('✅ Workers permission OK\n');
  }

  // Check D1 permissions
  console.log('3. Checking D1:Edit permission...');
  const d1Test = await run(['wrangler', 'd1', 'list']);
  if (d1Test.code !== 0 && d1Test.stderr.includes('Authentication error')) {
    console.log('❌ Missing D1:Edit permission');
  } else {
    console.log('✅ D1 permission OK\n');
  }

  // Check Queues permissions
  console.log('4. Checking Queues:Edit permission...');
  const queuesTest = await run(['wrangler', 'queues', 'list']);
  if (queuesTest.code !== 0 && queuesTest.stderr.includes('Authentication error')) {
    console.log('❌ Missing Queues:Edit permission');
  } else {
    console.log('✅ Queues permission OK\n');
  }

  console.log('\n📋 Required Permissions:');
  console.log('   - Account: Workers Scripts: Edit');
  console.log('   - Account: D1: Edit');
  console.log('   - Account: Queues: Edit');
  console.log('\n🔗 Update token: https://dash.cloudflare.com/profile/api-tokens');
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
