import { z } from 'zod';
import type { Change, Monitor, NotificationChannel } from '@/db';
import type { NotificationChannelPlugin } from './types';
import type { Notifier } from './types';

export const InstagramConfigSchema = z.object({
  accessToken: z.string().min(1),
  pageId: z.string().min(1), // Facebook Page ID (required for messaging)
  recipientId: z.string().min(1), // Instagram User ID or Page-scoped ID (PSID) to send messages to
});

export type InstagramConfig = z.infer<typeof InstagramConfigSchema>;

export class InstagramNotifier implements Notifier<InstagramConfig> {
  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async send(
    change: Change,
    monitor: Monitor,
    channel: NotificationChannel & { config: InstagramConfig; includeLink?: boolean | null },
    displayUrl?: string
  ): Promise<boolean> {
    const config = channel.config;
    if (!config || !config.accessToken || !config.pageId || !config.recipientId) {
      console.error(`Invalid Instagram configuration for channel: ${channel.name}`);
      return false;
    }

    const message = this.formatMessage(change, monitor, displayUrl);
    if (!message || message.trim().length === 0) {
      console.error('Instagram message is empty; skipping send');
      return false;
    }

    try {
      // Instagram Messaging API - send direct message
      // Note: Can only send if user has messaged you first (within 24-hour window)
      const messageUrl = `https://graph.facebook.com/v18.0/${config.pageId}/messages`;
      const messageText = this.formatCaption(change, monitor, displayUrl);
      
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: {
            id: config.recipientId,
          },
          message: {
            text: messageText,
          },
          messaging_type: 'MESSAGE_TAG',
          tag: 'ACCOUNT_UPDATE', // Use ACCOUNT_UPDATE tag for non-promotional messages
          access_token: config.accessToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Instagram Messaging API error:', error);
        
        // Check if it's a 24-hour window issue
        try {
          const errorData = JSON.parse(error);
          if (errorData.error?.code === 10 || errorData.error?.message?.includes('24')) {
            console.error('Note: Instagram only allows sending messages within 24 hours of user\'s last message.');
            console.error('The recipient must message your Instagram account first.');
          }
        } catch {
          // Ignore parse errors
        }
        
        return false;
      }

      const result = await response.json() as { message_id?: string; recipient_id?: string };
      if (result.message_id || result.recipient_id) {
        if (String(monitor.id) !== 'test') {
          console.log(`[${this.timestamp()}] notify instagram: ${channel.name}`);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to send Instagram notification:', error);
      return false;
    }
  }

  private formatMessage(change: Change, monitor: Monitor, displayUrl?: string): string {
    const aiSummary = change.aiSummary ?? undefined;

    if (aiSummary) {
      const linkToDisplay = monitor.includeLink ? (displayUrl || monitor.url) : '';
      return this.formatSummaryText(String(aiSummary), linkToDisplay);
    }

    const diff = String(change.diffMd ?? '');
    const formatted = this.formatDiffForInstagram(diff);
    const linkLine = monitor.includeLink ? `\n\n${displayUrl || monitor.url}` : '';
    return `${formatted}${linkLine}`;
  }

  private formatCaption(change: Change, monitor: Monitor, displayUrl?: string): string {
    // Instagram captions have a 2200 character limit
    const message = this.formatMessage(change, monitor, displayUrl);
    // Remove HTML tags for Instagram (it doesn't support HTML)
    const plainText = message
      .replace(/<b>(.*?)<\/b>/g, '*$1*') // Convert bold to markdown
      .replace(/<i>(.*?)<\/i>/g, '_$1_') // Convert italic to markdown
      .replace(/<a href="(.*?)">(.*?)<\/a>/g, '$2: $1') // Convert links
      .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');

    // Add hashtags for discoverability
    const hashtags = '\n\n#تحديثات #تقنية #Claude';
    
    const fullCaption = `${plainText}${hashtags}`;
    return fullCaption.length > 2200 ? fullCaption.substring(0, 2197) + '...' : fullCaption;
  }

  private formatSummaryText(summary: string, url: string): string {
    const lines = summary.split('\n');
    const out: string[] = [];

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed.trim().length === 0) {
        out.push('');
        continue;
      }

      // Convert markdown bold to plain text with asterisks
      const formatted = trimmed.replace(/\*\*(.*?)\*\*/g, '*$1*');
      out.push(formatted);
    }

    if (url) {
      out.push('');
      out.push(`🔗 ${url}`);
    }

    return out.join('\n');
  }

  private formatDiffForInstagram(diffMd: string): string {
    // Simplify diff for Instagram (no code blocks, plain text)
    const lines = diffMd.split('\n');
    const result: string[] = [];
    let currentHeading = '';

    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ')) {
        const headingText = line.replace(/^#{1,2}\s+/, '').replace(/[➕➖📝✚]/g, '').trim();
        currentHeading = headingText.charAt(0).toUpperCase() + headingText.slice(1).toLowerCase();
        result.push(`\n*${currentHeading}*`);
        continue;
      }

      if (line.startsWith('```')) {
        continue; // Skip code blocks
      }

      if (line.trim() && !line.startsWith('+') && !line.startsWith('-')) {
        result.push(line);
      } else if (line.startsWith('+')) {
        result.push(`✅ ${line.slice(1).trim()}`);
      } else if (line.startsWith('-')) {
        result.push(`❌ ${line.slice(1).trim()}`);
      }
    }

    return result.join('\n');
  }
}

export const instagramNotificationPlugin: NotificationChannelPlugin<InstagramConfig> = {
  id: 'instagram',
  label: 'Instagram',
  configSchema: InstagramConfigSchema,
  form: [
    { field: 'name', prompt: 'Enter channel name:', hint: 'e.g., "My Instagram Channel", "Updates Channel"' },
    { field: 'accessToken', prompt: 'Enter Instagram Graph API Access Token:', hint: 'Get this from Facebook Developer Console (needs instagram_basic, pages_messaging permissions)', mask: true },
    { field: 'pageId', prompt: 'Enter Facebook Page ID:', hint: 'The Page ID linked to your Instagram Business account', mask: false },
    { field: 'recipientId', prompt: 'Enter Instagram Recipient ID (PSID):', hint: 'Page-scoped ID of the user/channel to send messages to. Get from webhook or Graph API', mask: false },
  ],
  createNotifier() {
    return new InstagramNotifier();
  },
};
