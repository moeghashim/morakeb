import { describe, it, expect } from 'bun:test';
import { DB } from '../../src/db';
import { Fetcher } from '../../src/lib/fetcher';
import { MarkdownConverter } from '../../src/lib/markdown';
import { Differ } from '../../src/lib/differ';
import { NotificationService } from '../../src/lib/notifier';
import { SummaryService } from '../../src/lib/summary-service';
import { AISDKSummarizer } from '../../src/lib/summarizer-aisdk';
import { DroidSummarizer } from '../../src/lib/summarizer-droid';

// Use an in-memory database for integration tests
function createDB() {
  const db = new DB(':memory:');
  return db;
}

describe('MonitorService + plugin integration (smoke)', () => {
  it('initializes services', () => {
    const db = createDB();
    const fetcher = new Fetcher();
    const markdown = new MarkdownConverter();
    const differ = new Differ();
    const notifier = new NotificationService(db);
    const summary = new SummaryService(db, { droid: new DroidSummarizer(), aisdk: new AISDKSummarizer() });
    // Just ensure constructors work
    expect(db).toBeDefined();
    expect(fetcher).toBeDefined();
    expect(markdown).toBeDefined();
    expect(differ).toBeDefined();
    expect(notifier).toBeDefined();
    expect(summary).toBeDefined();
    db.close();
  });
});
