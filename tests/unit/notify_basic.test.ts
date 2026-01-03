import { describe, expect, test } from 'bun:test';
import { buildDeployMessage, buildGithubEnv } from '@/lib/notify-basic';

const sampleEnv = buildGithubEnv({
  GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_REF_NAME: 'main',
  GITHUB_SHA: '0123456789abcdef',
  GITHUB_ACTOR: 'octocat',
  GITHUB_RUN_ID: '1234567890',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_WORKFLOW: 'deploy',
  GITHUB_JOB: 'release',
});

describe('buildDeployMessage', () => {
  test('start message exact style with blank line before url', () => {
    const text = buildDeployMessage('start', sampleEnv);
    expect(text).toContain('deploy started for owner/repo@main (0123456) by octocat');
    expect(text).toContain('\n\nhttps://github.com/owner/repo/actions/runs/1234567890');
  });

  test('success message with custom message (no prefix)', () => {
    const text = buildDeployMessage('success', sampleEnv, { message: 'All good' });
    expect(text).toContain('deploy completed for owner/repo@main (0123456) by octocat');
    expect(text).toContain('All good');
  });

  test('failure message formats correctly', () => {
    const text = buildDeployMessage('failure', sampleEnv, { message: 'Error: something went wrong' });
    expect(text).toContain('deploy failed for owner/repo@main (0123456) by octocat');
    expect(text).toContain('Error: something went wrong');
  });
});
