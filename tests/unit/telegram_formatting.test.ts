import { describe, it, expect } from 'bun:test';
import { TelegramNotifier } from '../../src/lib/notifier';

describe('TelegramNotifier formatting', () => {
  it('renders headings and hyphen bullets with blank line between sections', () => {
    const notifier = new TelegramNotifier();
    const summary = `**Title**\n**Features**\n- Add thing\n- Improve other\n**Fixes**\n- Fix bug`;
    const html = (notifier as any).formatSummaryHtml(summary, '');
    expect(html).toContain('<b>Title</b>');
    expect(html).toContain('- Add thing');
    expect(html).toContain('<b>Features</b>');
    expect(html).toContain('<b>Fixes</b>');
    expect(html).toMatch(/Improve other\n\n<b>Fixes<\/b>/i);
  });
});
