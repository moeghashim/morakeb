import TurndownService from 'turndown';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

export class MarkdownConverter {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_',
    });

    // Add custom rules for better conversion
    this.turndown.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: (content) => '~' + content + '~',
    });

    // Remove script and style tags
    this.turndown.remove(['script', 'style', 'noscript', 'iframe']);
  }

  convert(html: string): string {
    // Pre-process: clean up HTML
    let cleaned = html;

    // Remove comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

    // Try Readability first to extract the main article content
    let forMarkdown = cleaned;
    try {
      const { document } = parseHTML(cleaned) as unknown as { document: any };
      // Some sites wrap content; Readability handles noisy DOMs well
      const reader = new Readability(document);
      const article = reader.parse();
      if (article && typeof article.content === 'string' && article.content.trim().length > 0) {
        forMarkdown = article.content;
      }
    } catch {
      // if Readability fails, fall back to original HTML
    }

    // Convert to markdown via Turndown
    let markdown = this.turndown.turndown(forMarkdown);

    // Post-process: clean up markdown
    // Remove excessive newlines (more than 2)
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    // Trim whitespace
    markdown = markdown.trim();

    return markdown;
  }

  convertWithSelector(html: string, selector: string): string {
    // Use Readability-first conversion for consistent results
    return this.convert(html);
  }
}
