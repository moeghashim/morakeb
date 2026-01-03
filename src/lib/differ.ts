import { diffLines, diffWords, createPatch } from 'diff';
import type { Monitor } from '@/db';

export interface DiffResult {
  diffType: 'addition' | 'modification' | 'deletion';
  summary: string;
  diffMarkdown: string;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'added' | 'removed' | 'modified';
  content: string;
  lineNumber?: number;
}

export class Differ {
  generateDiff(before: string, after: string, monitor: Monitor): DiffResult {
    const changes = this.computeChanges(before, after);
    const diffType = this.determineDiffType(changes);
    const summary = this.generateSummary(changes, monitor.type);
    const diffMarkdown = this.formatAsMarkdown(changes, before, after);

    return {
      diffType,
      summary,
      diffMarkdown,
      changes,
    };
  }

  private computeChanges(before: string, after: string): DiffChange[] {
    const changes: DiffChange[] = [];
    const diff = diffLines(before, after);

    let lineNumber = 0;
    for (const part of diff) {
      if (part.added) {
        changes.push({
          type: 'added',
          content: part.value.trim(),
          lineNumber,
        });
      } else if (part.removed) {
        changes.push({
          type: 'removed',
          content: part.value.trim(),
          lineNumber,
        });
      }

      if (!part.removed) {
        lineNumber += (part.value.match(/\n/g) || []).length;
      }
    }

    return changes.filter((c) => c.content.length > 0);
  }

  private determineDiffType(changes: DiffChange[]): 'addition' | 'modification' | 'deletion' {
    const hasAdded = changes.some((c) => c.type === 'added');
    const hasRemoved = changes.some((c) => c.type === 'removed');

    if (hasAdded && !hasRemoved) {
      return 'addition';
    } else if (hasRemoved && !hasAdded) {
      return 'deletion';
    } else {
      return 'modification';
    }
  }

  private generateSummary(changes: DiffChange[], type: string): string {
    // Prefer a human-friendly title from added content when possible
    const addedBlocks = changes.filter((c) => c.type === 'added');
    for (const block of addedBlocks) {
      const lines = block.content.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const heading = line.match(/^#{1,6}\s+(.+)/);
        if (heading && heading[1]) {
          const t = heading[1].replace(/\s+#$/, '').trim();
          if (t) return t;
        }
        const bulletLink = line.match(/^[-*+]\s+\[([^\]]+)\]\(([^)]+)\)/);
        if (bulletLink && bulletLink[1]) {
          return bulletLink[1].trim();
        }
        const bullet = line.match(/^[-*+]\s+(.+)/);
        if (bullet && bullet[1]) {
          return bullet[1].trim();
        }
      }
    }

    // Fallback to counts when no readable title was found
    const added = addedBlocks.length;
    const removed = changes.filter((c) => c.type === 'removed').length;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} addition${added !== 1 ? 's' : ''}`);
    if (removed > 0) parts.push(`${removed} deletion${removed !== 1 ? 's' : ''}`);
    const changeText = parts.join(', ') || 'No changes';
    return `${type}: ${changeText}`;
  }

  private formatAsMarkdown(
    changes: DiffChange[],
    before: string,
    after: string
  ): string {
    const lines: string[] = ['# Changes Detected\n'];

    // Add summary section
    const added = changes.filter((c) => c.type === 'added');
    const removed = changes.filter((c) => c.type === 'removed');

    if (added.length > 0) {
      lines.push('## ➕ Added\n');
      added.forEach((change) => {
        lines.push('```diff');
        change.content.split('\n').forEach((line) => {
          lines.push(`+ ${line}`);
        });
        lines.push('```\n');
      });
    }

    if (removed.length > 0) {
      lines.push('## ➖ Removed\n');
      removed.forEach((change) => {
        lines.push('```diff');
        change.content.split('\n').forEach((line) => {
          lines.push(`- ${line}`);
        });
        lines.push('```\n');
      });
    }

    // Add unified diff patch
    if (before && after) {
      const patch = createPatch('content', before, after, 'before', 'after');
      lines.push('## 📝 Unified Diff\n');
      lines.push('```diff');
      lines.push(patch);
      lines.push('```\n');
    }

    return lines.join('\n');
  }
}
