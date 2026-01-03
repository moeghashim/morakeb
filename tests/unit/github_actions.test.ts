import { test, expect } from 'bun:test';
import { createWorkflowContent, type SSHConfig } from '../../src/setup/github-actions';

test('createWorkflowContent generates valid workflow without custom port', () => {
  const config: SSHConfig = {
    alias: 'changes',
    hostname: '5.161.213.49',
    user: 'root',
  };
  
  const content = createWorkflowContent(config, '/opt/changes');
  
  // Check placeholders are replaced
  expect(content).toContain('Host changes');
  expect(content).toContain('HostName ${{ secrets.DEPLOY_SSH_HOST }}');
  expect(content).toContain('User ${{ secrets.DEPLOY_SSH_USER }}');
  expect(content).toContain('bun run deploy --host changes --dest /opt/changes');
  
  // Should NOT contain port line (default 22)
  expect(content).not.toContain('Port ');
  
  // Check structure
  expect(content).toContain('name: Deploy');
  expect(content).toContain('on:');
  expect(content).toContain('push:');
  expect(content).toContain('branches: [ main ]');
  expect(content).toContain('workflow_dispatch:');
});

test('createWorkflowContent includes custom port', () => {
  const config: SSHConfig = {
    alias: 'myserver',
    hostname: '1.2.3.4',
    user: 'deploy',
    port: 2222,
  };
  
  const content = createWorkflowContent(config, '/home/app');
  
  // Check placeholders are replaced
  expect(content).toContain('Host myserver');
  expect(content).toContain('HostName ${{ secrets.DEPLOY_SSH_HOST }}');
  expect(content).toContain('User ${{ secrets.DEPLOY_SSH_USER }}');
  expect(content).toContain('Port ${{ secrets.DEPLOY_SSH_PORT }}');
  expect(content).toContain('bun run deploy --host myserver --dest /home/app');
});

test('createWorkflowContent skips port 22', () => {
  const config: SSHConfig = {
    alias: 'changes',
    hostname: '5.161.213.49',
    user: 'root',
    port: 22, // Explicit port 22 should be omitted
  };
  
  const content = createWorkflowContent(config, '/opt/changes');
  
  // Should NOT contain port line for default SSH port
  expect(content).not.toContain('Port ');
});

test('createWorkflowContent produces multiline string', () => {
  const config: SSHConfig = {
    alias: 'changes',
    hostname: '5.161.213.49',
    user: 'root',
  };
  
  const content = createWorkflowContent(config, '/opt/changes');
  
  // Should be multiline YAML
  const lines = content.split('\n');
  expect(lines.length).toBeGreaterThan(10);
  
  // Check indentation is preserved
  expect(lines.some(line => line.startsWith('jobs:'))).toBe(true);
  expect(lines.some(line => line.startsWith('  deploy:'))).toBe(true);
  expect(lines.some(line => line.startsWith('    steps:'))).toBe(true);
});
