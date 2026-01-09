import { z } from 'zod';
import type { Change, Monitor, NotificationChannel } from '@/db';
import type { NotificationChannelPlugin } from './types';
import type { Notifier } from './types';

export const TelegramConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
});

export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

export class TelegramNotifier implements Notifier<TelegramConfig> {
  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async send(
    change: Change,
    monitor: Monitor,
    channel: NotificationChannel & { config: TelegramConfig; includeLink?: boolean | null },
    displayUrl?: string
  ): Promise<boolean> {
    const config = channel.config;
    if (!config || !config.botToken || !config.chatId) {
      console.error(`Invalid Telegram configuration for channel: ${channel.name}`);
      return false;
    }

    const message = this.formatMessage(change, monitor, displayUrl);
    if (!message || message.trim().length === 0) {
      console.error('Telegram message is empty; skipping send');
      return false;
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${config.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(config.chatId),
            text: String(message),
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Telegram API error:', error);
        return false;
      }

      // Don't log for test notifications
      if (String(monitor.id) !== 'test') {
        console.log(`[${this.timestamp()}] notify telegram: ${channel.name}`);
      }
      return true;
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
      return false;
    }
  }

  private formatMessage(change: Change, monitor: Monitor, displayUrl?: string): string {
    const aiSummary = change.aiSummary ?? undefined;

    if (aiSummary) {
      const linkToDisplay = monitor.includeLink ? (displayUrl || monitor.url) : '';
      return this.formatSummaryHtml(String(aiSummary), linkToDisplay, change, monitor);
    }

    const diff = String(change.diffMd ?? '');
    const formatted = this.formatDiffForTelegram(diff);

    const maxLength = 3800;
    const linkLine = monitor.includeLink ? `\n<a href="${this.escapeHtml(monitor.url)}">${this.escapeHtml(monitor.url)}</a>` : '';
    const content = `<b>Change detected on ${this.escapeHtml(monitor.name)}</b>${linkLine}\n<pre>${this.escapeHtml(formatted)}</pre>`;

    if (content.length > maxLength) {
      const truncated = content.slice(0, maxLength);
      return `${truncated}\n\n...(truncated)`;
    }

    return content;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatSummaryHtml(summary: string, url: string, change: Change, monitor: Monitor): string {
    const lines = summary.split('\n');
    const out: string[] = [];
    let addedLink = false;
    
    // Extract company name from monitor name (e.g., "Anthropic claude code" -> "Anthropic")
    // Use the monitor name directly if it's a single word, otherwise take first word
    const companyName = monitor.name.split(' ')[0] || monitor.name || 'Unknown';
    const version = change.releaseVersion || null;
    
    // Add fun header with company and version (no date)
    // Wrap version number in LTR markers to keep it left-to-right in RTL text
    let header = '';
    if (version) {
      const ltrVersion = `\u202A${version}\u202C`;
      header = `${companyName} تطلق الإصدار ${ltrVersion}`;
    } else {
      header = `${companyName}`;
    }
    out.push(`<b>${this.escapeHtml(header)}</b>`);
    out.push('');

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trimEnd();
      if (raw.trim().length === 0) { out.push(''); continue; }

      if (i === 0) {
        const m = raw.match(/\*\*(.*?)\*\*/);
        const title = m ? m[1] : raw.replace(/^\*+|\*+$/g, '');
        // Skip if title already includes company/version info
        if (!title.includes(companyName) && !title.includes('تطلق')) {
          out.push(`<b>${this.escapeHtml(title)}</b>`);
          out.push('');
        }
        continue;
      }

      const headingMatch = raw.match(/^\*\*(.+)\*\*$/);
      if (headingMatch) {
        if (out.length > 0 && out[out.length - 1] !== '') out.push('');
        const heading = headingMatch[1];
        // Enhance headings for better presentation
        let enhancedHeading = heading;
        if (heading === 'الميزات' || heading.includes('الميزات') && !heading.includes('الجديدة')) {
          enhancedHeading = heading.replace('الميزات', 'الميزات الجديدة');
        } else if (heading === 'الإصلاحات' || heading.includes('الإصلاحات')) {
          enhancedHeading = heading.replace('الإصلاحات', 'التحسينات والإصلاحات');
        }
        out.push(`<b>${this.escapeHtml(enhancedHeading)}</b>`);
        continue;
      }

      if (raw.startsWith('- ')) {
        out.push(`- ${this.escapeHtml(raw.slice(2))}`);
        continue;
      }

      if (/^https?:\/\/\S+$/i.test(raw)) {
        out.push('');
        out.push(`<a href="${this.escapeHtml(raw)}">${this.escapeHtml(raw)}</a>`);
        addedLink = true;
        continue;
      }

      out.push(this.escapeHtml(raw));
    }

    if (!addedLink && url) {
      out.push('');
      out.push(`<a href="${this.escapeHtml(url)}">${this.escapeHtml(url)}</a>`);
    }

    const html = out.join('\n');
    const maxLength = 3800;
    return html.length > maxLength ? `${html.slice(0, maxLength)}\n\n...(truncated)` : html;
  }

  private formatDiffForTelegram(diffMd: string): string {
    const lines = diffMd.split('\n');
    const result: string[] = [];
    let currentHeading = '';
    let codeBlockContent: string[] = [];
    let inCodeBlock = false;

    const flushCodeBlock = () => {
      if (codeBlockContent.length > 0) {
        result.push('```');
        result.push(...codeBlockContent);
        result.push('```');
        codeBlockContent = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('# ') || line.startsWith('## ')) {
        flushCodeBlock();
        inCodeBlock = false;
        const headingText = line.replace(/^#{1,2}\s+/, '').replace(/[➕➖📝✚]/g, '').trim();
        const sentenceCase = headingText.charAt(0).toUpperCase() + headingText.slice(1).toLowerCase();
        currentHeading = sentenceCase;
        result.push(`\n*${sentenceCase}*`);
        continue;
      }

      if (line.startsWith('```')) {
        if (currentHeading === 'Added' || currentHeading === 'Removed') {
          inCodeBlock = !inCodeBlock;
        } else {
          if (!inCodeBlock) {
            result.push('```');
            inCodeBlock = true;
          } else {
            result.push('```');
            inCodeBlock = false;
          }
        }
        continue;
      }

      if (line.trim()) {
        if (inCodeBlock && (currentHeading === 'Added' || currentHeading === 'Removed')) {
          codeBlockContent.push(line);
        } else if (inCodeBlock) {
          result.push(line);
        } else {
          result.push(line);
        }
      }
    }

    flushCodeBlock();

    return result.join('\n');
  }
}

export const telegramNotificationPlugin: NotificationChannelPlugin<TelegramConfig> = {
  id: 'telegram',
  label: 'Telegram',
  configSchema: TelegramConfigSchema,
  form: [
    { field: 'name', prompt: 'Enter channel name:', hint: 'e.g., "My Telegram Bot", "Personal Alerts"' },
    { field: 'botToken', prompt: 'Enter Telegram Bot Token (from @BotFather):', hint: 'Get this from @BotFather on Telegram', mask: true },
    { field: 'chatId', prompt: 'Enter Telegram Chat ID (from @userinfobot):', hint: 'Get this from @userinfobot on Telegram', mask: true },
  ],
  createNotifier() {
    return new TelegramNotifier();
  },
};
