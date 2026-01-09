import { describe, it, expect } from 'bun:test';
import { TelegramNotifier } from '../../src/lib/notifier';
import type { Change, Monitor } from '../../src/db';

describe('TelegramNotifier formatting', () => {
  it('renders headings and hyphen bullets with blank line between sections', () => {
    const notifier = new TelegramNotifier();
    const summary = `**Title**\n**Features**\n- Add thing\n- Improve other\n**Fixes**\n- Fix bug`;
    const mockChange: Change = {
      id: 1,
      monitorId: 1,
      beforeSnapshotId: null,
      afterSnapshotId: 1,
      summary: null,
      aiSummary: null,
      aiSummaryMeta: null,
      diffMd: null,
      diffType: null,
      releaseVersion: null,
      createdAt: new Date().toISOString(),
    };
    const mockMonitor: Monitor = {
      id: 1,
      name: 'Test Monitor',
      url: 'https://example.com',
      intervalMinutes: 60,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
      createdAt: new Date().toISOString(),
      lastCheckedAt: null,
    };
    const html = (notifier as any).formatSummaryHtml(summary, 'https://example.com', mockChange, mockMonitor);
    expect(html).toContain('<b>Title</b>');
    expect(html).toContain('- Add thing');
    expect(html).toContain('<b>Features</b>');
    expect(html).toContain('<b>Fixes</b>');
    expect(html).toMatch(/Improve other\n\n<b>Fixes<\/b>/i);
  });
});
