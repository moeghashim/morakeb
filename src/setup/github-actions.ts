import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runAsync } from './sys';

export type SSHConfig = {
  alias: string;
  hostname: string;
  user: string;
  port?: number;
};

const WORKFLOW_TEMPLATE = `name: Deploy

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup SSH
      run: |
        mkdir -p ~/.ssh
        cat > ~/.ssh/config <<'EOF'
        Host {{SSH_ALIAS}}
          HostName \${{ secrets.DEPLOY_SSH_HOST }}
          User \${{ secrets.DEPLOY_SSH_USER }}
{{SSH_PORT_LINE}}          IdentityFile ~/.ssh/deploy_key
          StrictHostKeyChecking accept-new
          ServerAliveInterval 30
          ServerAliveCountMax 3
        EOF
        chmod 600 ~/.ssh/config
        echo "\${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/deploy_key
        chmod 600 ~/.ssh/deploy_key
    
    - name: Setup Bun
      uses: oven-sh/setup-bun@v1
      with:
        bun-version: latest
    
    - name: Install dependencies
      run: bun install
    
    - name: Deploy to VPS
      run: bun run deploy --host {{SSH_ALIAS}} --dest {{DEPLOY_PATH}}
`;

/**
 * Parse SSH config for a specific host alias
 */
export async function parseSSHConfigForHost(alias: string): Promise<SSHConfig | null> {
  const configPath = join(homedir(), '.ssh', 'config');
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    const lines = content.split('\n');
    
    let inHost = false;
    let hostname: string | null = null;
    let user: string | null = null;
    let port: number | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check if this is the host we're looking for
      if (trimmed.toLowerCase().startsWith('host ')) {
        const hostName = trimmed.substring(5).trim();
        if (inHost && hostname) break; // End of our host block
        inHost = hostName === alias;
        continue;
      }
      
      if (!inHost) continue;
      
      // Parse config values
      if (trimmed.toLowerCase().startsWith('hostname ')) {
        hostname = trimmed.substring(9).trim();
      } else if (trimmed.toLowerCase().startsWith('user ')) {
        user = trimmed.substring(5).trim();
      } else if (trimmed.toLowerCase().startsWith('port ')) {
        port = parseInt(trimmed.substring(5).trim(), 10);
      }
    }
    
    if (!hostname) return null;
    
    return {
      alias,
      hostname,
      user: user || 'root',
      port: port || undefined,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Generate SSH deploy key on VPS and return private key
 */
export async function generateDeployKey(host: string): Promise<string> {
  const keyPath = '~/.ssh/changes_deploy_key';
  
  const checkResult = await runAsync(`ssh ${host} 'test -f ${keyPath}'`);
  const keyExists = checkResult.code === 0;
  if (!keyExists && checkResult.code !== 1) {
    throw new Error('Failed to check existing deploy key on VPS');
  }

  if (!keyExists) {
    const genResult = await runAsync(
      `ssh ${host} 'ssh-keygen -q -t ed25519 -f ${keyPath} -N "" -C "github-actions-deploy"'`
    );
    if (!genResult.ok) {
      throw new Error('Failed to generate SSH key on VPS');
    }
  }

  const ensurePubResult = await runAsync(
    `ssh ${host} 'if [ ! -f ${keyPath}.pub ]; then ssh-keygen -y -f ${keyPath} > ${keyPath}.pub; fi'`
  );
  if (!ensurePubResult.ok) {
    throw new Error('Failed to derive public deploy key on VPS');
  }

  const ensureAuthorizedResult = await runAsync(
    `ssh ${host} 'mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && PUB_KEY=$(cat ${keyPath}.pub) && grep -qxF "$PUB_KEY" ~/.ssh/authorized_keys || echo "$PUB_KEY" >> ~/.ssh/authorized_keys'`
  );
  if (!ensureAuthorizedResult.ok) {
    throw new Error('Failed to register deploy key with authorized_keys');
  }

  const privResult = await runAsync(`ssh ${host} 'cat ${keyPath}'`);
  if (!privResult.ok) {
    throw new Error('Failed to fetch private deploy key');
  }

  return privResult.stdout.trim();
}

/**
 * Create GitHub Actions workflow file content
 */
export function createWorkflowContent(config: SSHConfig, destPath: string): string {
  let content = WORKFLOW_TEMPLATE;
  
  // Replace placeholders
  content = content.replace(/\{\{SSH_ALIAS\}\}/g, config.alias);
  content = content.replace(/\{\{DEPLOY_PATH\}\}/g, destPath);
  
  // Handle optional port - only add line if custom port
  const portLine =
    config.port && config.port !== 22
      ? `          Port \${{ secrets.DEPLOY_SSH_PORT }}\n`
      : '';
  content = content.replace(/\{\{SSH_PORT_LINE\}\}/g, portLine);
  
  return content;
}
