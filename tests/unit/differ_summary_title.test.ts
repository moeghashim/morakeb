import { describe, it, expect } from 'bun:test';
import { Differ } from '../../src/lib/differ';
import type { Monitor } from '../../src/db';

describe('Differ.generateSummary', () => {
  const differ = new Differ();
  const monitor: Monitor = {
    id: 1,
    name: 'Example',
    url: 'https://example.com',
    intervalMinutes: 60,
    type: 'markdown',
    selector: null,
    includeLink: true,
    active: true,
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
  };

  it('picks first heading from added content as summary', () => {
    const before = '## Old Title\n\nOld body';
    const after = '## New Post\n\n- https://example.com/new\n\nNew body';
    const diff = differ.generateDiff(before, after, monitor);
    expect(diff.summary).toBe('New Post');
  });
});

