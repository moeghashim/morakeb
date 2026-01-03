import { describe, it, expect } from 'bun:test';
import { enforceNotificationPolicy, buildAggregatedSummary } from '../../src/lib/summary-format';
import type { StructuredSummary } from '../../src/lib/summary-format';

describe('summary-format notification policy', () => {
  it('suppresses notifications for only two fixes', () => {
    const input: StructuredSummary = {
      status: 'ok' as const,
      title: '1.2.3 released',
      features: [],
      fixes: ['Fix crash on launch', 'Resolve sync bug'],
      shouldNotify: true,
    };
    const result = enforceNotificationPolicy(input);
    expect(result.shouldNotify).toBe(false);
    expect(result.skipReason).toContain('bug fix');
  });

  it('keeps notifications when features exist', () => {
    const input: StructuredSummary = {
      status: 'ok' as const,
      title: '1.2.4 released',
      features: ['Add dashboard'],
      fixes: ['Improve stability'],
      shouldNotify: true,
    };
    const result = enforceNotificationPolicy(input);
    expect(result.shouldNotify).toBe(true);
  });

  it('buildAggregatedSummary omits version prefixes in bullets', () => {
    const makeChange = (id: number, version: string) => ({
      change: {
        id,
        monitorId: 10,
        releaseVersion: version,
        beforeSnapshotId: null,
        afterSnapshotId: id,
        summary: null,
        aiSummary: null,
        aiSummaryMeta: null,
        diffMd: null,
        diffType: 'addition' as const,
        createdAt: new Date().toISOString(),
      },
    });

    const changeA = {
      ...makeChange(1, 'v1.0.0'),
      meta: {
        status: 'ok' as const,
        title: 'v1.0.0',
        features: ['Ship feature A'],
        fixes: [],
        shouldNotify: true,
      },
    };
    const changeB = {
      ...makeChange(2, 'v1.0.1'),
      meta: {
        status: 'ok' as const,
        title: 'v1.0.1',
        features: [],
        fixes: ['Patch login'],
        shouldNotify: true,
      },
    };

    const aggregated = buildAggregatedSummary('Example', [changeA, changeB]);
    expect(aggregated?.markdown).toContain('- Ship feature A');
    expect(aggregated?.markdown).toContain('- Patch login');
    expect(aggregated?.markdown).not.toContain('v1.0.0 ·');
    expect(aggregated?.markdown).not.toContain('v1.0.1 ·');
  });
});
