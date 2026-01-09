import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { DB } from '@/db';
import type { Scheduler } from '../scheduler';
import type { JobsQueue } from '@/jobs/queue';
import { z } from 'zod';
import { notificationChannelPlugins, type ChannelWithConfig } from '@/lib/channel';
import { encryption } from '@/lib/encryption';
import { TelegramConfigSchema, type TelegramConfig } from '@/lib/notification/telegram';
import { Fetcher } from '@/lib/fetcher';
import { MarkdownConverter } from '@/lib/markdown';
import { SummaryService } from '@/lib/summary-service';
import { NotificationService } from '@/lib/notifier';
import { DroidSummarizer } from '@/lib/summarizer-droid';
import { AISDKSummarizer } from '@/lib/summarizer-aisdk';
import type { Monitor, Change } from '@/db';

// SSRF protection: block private/internal IPs and localhost
function isPrivateIP(hostname: string): boolean {
  // Remove port if present
  const host = hostname.split(':')[0];
  
  // Check for localhost variants
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return true;
  }
  
  // Check for private IP ranges
  const parts = host.split('.');
  if (parts.length === 4) {
    const [a, b, c] = parts.map(Number);
    if (isNaN(a) || isNaN(b) || isNaN(c)) return false;
    
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
  }
  
  // Check for link-local IPv6
  if (host.startsWith('fe80:') || host.startsWith('fc00:') || host.startsWith('fd00:')) {
    return true;
  }
  
  return false;
}

// Validation schemas
const httpUrlSchema = z.string().url().refine((value) => {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return false;
    }
    // Block private/internal IPs to prevent SSRF
    if (isPrivateIP(u.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}, { message: 'URL must be a public http:// or https:// URL (private/internal IPs are not allowed)' });

const createMonitorSchema = z.object({
  name: z.string().min(1).max(255),
  url: httpUrlSchema,
  intervalMinutes: z.number().int().min(1).default(60),
  type: z.enum(['webpage', 'api', 'markdown', 'xml']),
  selector: z.string().optional(),
  active: z.boolean().default(true),
});

const updateMonitorSchema = createMonitorSchema.partial();

const channelPluginSchemas = notificationChannelPlugins().map((plugin) =>
  z.object({
    name: z.string().min(1).max(255),
    type: z.literal(plugin.id),
    config: plugin.configSchema,
    active: z.boolean().default(true),
  })
);

const createChannelSchema: z.ZodTypeAny = (() => {
  if (channelPluginSchemas.length === 0) return z.never();
  let combined: z.ZodTypeAny = channelPluginSchemas[0];
  for (let i = 1; i < channelPluginSchemas.length; i++) {
    combined = combined.or(channelPluginSchemas[i]);
  }
  return combined;
})();

const updateChannelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.unknown().optional(),
  active: z.boolean().optional(),
});

const summarizeOnceSchema = z.object({
  url: httpUrlSchema,
  channelId: z.number().int().positive().optional(),
});

export function createApiServer(db: DB, scheduler: Scheduler, queue: JobsQueue) {
  const app = new Hono();

  const parseId = (raw: string | undefined) => {
    if (raw === undefined) return null;
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id < 0) return null;
    return id;
  };

  // Middleware
  app.use('*', logger());
  
  // CORS for local web pages only - restrict to localhost/127.0.0.1
  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin');
    const isLocalhost = origin && (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://[::1]:')
    );
    
    if (isLocalhost) {
      c.header('Access-Control-Allow-Origin', origin);
    }
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    await next();
  });
  
  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve add monitor page
  app.get('/', async (c) => {
    try {
      const html = await Bun.file('./add-monitor.html').text();
      return c.html(html);
    } catch {
      return c.text('Add monitor page not found. Make sure add-monitor.html exists in the project root.', 404);
    }
  });

  // Telegram webhook: delete join/leave service messages quickly
  app.post('/telegram/webhook', async (c) => {
    const secretRequired = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secretRequired || secretRequired.trim().length === 0) {
      return c.json({ error: 'Webhook secret not configured' }, 400);
    }
    const provided = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (provided !== secretRequired) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    type TgUser = { id: number; is_bot: boolean; username?: string; first_name?: string; last_name?: string };
    type TgChat = { id: number; type: 'private'|'group'|'supergroup'|'channel'|string };
    type TgMessage = { message_id: number; chat: TgChat; new_chat_members?: TgUser[]; left_chat_member?: TgUser|null };
    type TgUpdate = { update_id: number; message?: TgMessage };

    let updateUnknown: unknown;
    try {
      updateUnknown = await c.req.json();
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
    if (!isObject(updateUnknown)) {
      return c.json({ ok: true, ignored: 'not an object' });
    }
    const upd = updateUnknown as TgUpdate;
    const msg = upd.message;
    if (!msg || !msg.chat || typeof msg.message_id !== 'number') {
      return c.json({ ok: true, ignored: 'no message' });
    }
    const chatId = msg.chat.id;
    const isJoin = Array.isArray(msg.new_chat_members) && msg.new_chat_members.length > 0;
    const isLeave = !!msg.left_chat_member;
    if (!isJoin && !isLeave) {
      return c.json({ ok: true, ignored: 'not join/leave' });
    }

    // Find matching Telegram channel config (by chatId) to obtain the correct bot token
    const channels = db.listNotificationChannels(true);
    const candidates = channels.filter((ch) => ch.type === 'telegram' && ch.active);
    let botToken: string | null = null;
    for (const ch of candidates) {
      try {
        const raw = encryption.decrypt(ch.encryptedConfig);
        const cfg = TelegramConfigSchema.parse(raw);
        // Compare as strings to be robust (Telegram chat IDs may be negative numbers)
        if (String(cfg.chatId) === String(chatId)) {
          botToken = cfg.botToken;
          break;
        }
      } catch {
        // ignore malformed channel configs
      }
    }

    if (!botToken) {
      // No matching channel; ignore silently to keep webhook fast
      return c.json({ ok: true, ignored: 'no matching telegram channel' });
    }

    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: String(chatId), message_id: msg.message_id }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'telegram error');
        return c.json({ ok: false, error: errText }, 200);
      }
    } catch (e) {
      const err = e as Error;
      return c.json({ ok: false, error: err.message }, 200);
    }

    return c.json({ ok: true, action: 'deleted' });
  });

  // List monitors
  app.get('/api/monitors', (c) => {
    const activeOnly = c.req.query('active') === 'true';
    const monitors = db.listMonitors(activeOnly);
    return c.json({ monitors });
  });

  // Get single monitor
  app.get('/api/monitors/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid monitor id' }, 400);
    const monitor = db.getMonitor(id);

    if (!monitor) {
      return c.json({ error: 'Monitor not found' }, 404);
    }

    return c.json({ monitor });
  });

  // Create monitor
  app.post('/api/monitors', async (c) => {
    try {
      const body = await c.req.json();
      const data = createMonitorSchema.parse(body);

      const monitor = db.createMonitor(data);
      return c.json({ monitor }, 201);
    } catch (error: unknown) {
      const e = error as Error;
      return c.json({ error: e.message || 'Invalid request' }, 400);
    }
  });

  // Update monitor
  app.put('/api/monitors/:id', async (c) => {
    try {
      const id = parseId(c.req.param('id'));
      if (id === null) return c.json({ error: 'Invalid monitor id' }, 400);
      const body = await c.req.json();
      const data = updateMonitorSchema.parse(body);

      const monitor = db.updateMonitor(id, data);

      if (!monitor) {
        return c.json({ error: 'Monitor not found' }, 404);
      }

      return c.json({ monitor });
    } catch (error: unknown) {
      const e = error as Error;
      return c.json({ error: e.message || 'Invalid request' }, 400);
    }
  });

  // Delete monitor
  app.delete('/api/monitors/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid monitor id' }, 400);
    const deleted = db.deleteMonitor(id);

    if (!deleted) {
      return c.json({ error: 'Monitor not found' }, 404);
    }

    return c.json({ success: true });
  });

  // Test monitor (trigger immediate check)
  app.post('/api/monitors/:id/check', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid monitor id' }, 400);
    const monitor = db.getMonitor(id);

    if (!monitor) {
      return c.json({ error: 'Monitor not found' }, 404);
    }
    try {
      const { id: jobId } = queue.add('monitor.check', { monitorId: monitor.id });
      try { db.recordJobEvent({ jobId, type: 'monitor.check', status: 'queued', monitorId: monitor.id, message: 'manual enqueue', error: undefined }); } catch {}
      return c.json({ accepted: true, jobId }, 202);
    } catch (e) {
      const err = e as Error;
      return c.json({ error: err.message || 'Failed to enqueue job' }, 500);
    }
  });

  // List changes for a monitor
  app.get('/api/monitors/:id/changes', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid monitor id' }, 400);
    const monitor = db.getMonitor(id);

    if (!monitor) {
      return c.json({ error: 'Monitor not found' }, 404);
    }

    const limit = parseInt(c.req.query('limit') || '50');
    const changes = db.listChangesByMonitor(id, limit);

    return c.json({ changes });
  });

  // Get specific change
  app.get('/api/changes/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid change id' }, 400);
    const change = db.getChange(id);

    if (!change) {
      return c.json({ error: 'Change not found' }, 404);
    }

    return c.json({ change });
  });

  // List all recent changes
  app.get('/api/changes', (c) => {
    const limit = parseInt(c.req.query('limit') || '50');
    const changes = db.listChanges(limit);
    return c.json({ changes });
  });

  // Job events (for debugging/observability)
  app.get('/api/job-events', (c) => {
    const limit = (() => { const v = Number(c.req.query('limit') || '50'); return Number.isFinite(v) ? v : 50; })();
    const type = c.req.query('type') || undefined;
    const status = (c.req.query('status') as 'queued'|'started'|'skipped'|'done'|'failed'|undefined) || undefined;
    const monitorIdRaw = c.req.query('monitorId');
    const jobIdRaw = c.req.query('jobId');
    const monitorId = monitorIdRaw !== undefined ? Number(monitorIdRaw) : undefined;
    const jobId = jobIdRaw !== undefined ? Number(jobIdRaw) : undefined;
    const events = db.listJobEvents({ type, status, monitorId: Number.isFinite(monitorId!) ? monitorId : undefined, jobId: Number.isFinite(jobId!) ? jobId : undefined, limit });
    return c.json({ events });
  });

  // Notification Channels
  
  // Create channel
  app.post('/api/channels', async (c) => {
    try {
      const body = await c.req.json();
      const data = createChannelSchema.parse(body) as Parameters<typeof db.createNotificationChannel>[0];

      const channel = db.createNotificationChannel(data);

      return c.json({ channel }, 201);
    } catch (error: unknown) {
      const e = error as Error;
      return c.json({ error: e.message || 'Invalid request' }, 400);
    }
  });

  // List all channels
  app.get('/api/channels', (c) => {
    const activeOnly = c.req.query('active') === 'true';
    const channels = db.listNotificationChannels(activeOnly);

    return c.json({ channels });
  });

  // Get single channel
  app.get('/api/channels/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid channel id' }, 400);
    const channel = db.getNotificationChannel(id);

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    return c.json({ channel });
  });

  // Update channel
  app.put('/api/channels/:id', async (c) => {
    try {
      const id = parseId(c.req.param('id'));
      if (id === null) return c.json({ error: 'Invalid channel id' }, 400);
      const body = await c.req.json();
      const data = updateChannelSchema.parse(body);

      const channel = db.updateNotificationChannel(id, data);

      if (!channel) {
        return c.json({ error: 'Channel not found' }, 404);
      }

      return c.json({ channel });
    } catch (error: unknown) {
      const e = error as Error;
      return c.json({ error: e.message || 'Invalid request' }, 400);
    }
  });

  // Delete channel
  app.delete('/api/channels/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid channel id' }, 400);
    const deleted = db.deleteNotificationChannel(id);

    if (!deleted) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    return c.json({ success: true });
  });

  // Add channel to monitor
  app.post('/api/monitors/:id/channels/:channelId', (c) => {
    const monitorId = parseId(c.req.param('id'));
    const channelId = parseId(c.req.param('channelId'));
    if (monitorId === null || channelId === null) return c.json({ error: 'Invalid id' }, 400);

    const monitor = db.getMonitor(monitorId);
    const channel = db.getNotificationChannel(channelId);

    if (!monitor) {
      return c.json({ error: 'Monitor not found' }, 404);
    }

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    const success = db.linkChannelToMonitor(monitorId, channelId);

    if (!success) {
      return c.json({ error: 'Channel already added to monitor' }, 400);
    }

    return c.json({ success: true });
  });

  // Remove channel from monitor
  app.delete('/api/monitors/:id/channels/:channelId', (c) => {
    const monitorId = parseId(c.req.param('id'));
    const channelId = parseId(c.req.param('channelId'));
    if (monitorId === null || channelId === null) return c.json({ error: 'Invalid id' }, 400);

    const deleted = db.removeChannelFromMonitor(monitorId, channelId);

    if (!deleted) {
      return c.json({ error: 'Channel not associated with monitor' }, 404);
    }

    return c.json({ success: true });
  });

  // List channels for a monitor
  app.get('/api/monitors/:id/channels', (c) => {
    const id = c.req.param('id');
    const monitor = db.getMonitor(id);

    if (!monitor) {
      return c.json({ error: 'Monitor not found' }, 404);
    }

    const activeOnly = c.req.query('active') === 'true';
    const channels = db.getMonitorChannels(id, activeOnly);

    // Don't expose encrypted config in API response
    const safeChannels = channels.map(({ config, ...rest }) => rest);

    return c.json({ channels: safeChannels });
  });

  // Trigger manual check of all monitors
  app.post('/api/check-all', async (c) => {
    await scheduler.checkNow();
    return c.json({ success: true, message: 'Check triggered' });
  });

  // Summarize a one-time page and send to Telegram
  app.post('/api/summarize-once', async (c) => {
    try {
      const body = await c.req.json();
      const data = summarizeOnceSchema.parse(body);
      const { url, channelId } = data;

      // Initialize services
      const fetcher = new Fetcher();
      const markdownConverter = new MarkdownConverter();
      const summaryService = new SummaryService(db, {
        droid: new DroidSummarizer(),
        aisdk: new AISDKSummarizer(),
      });
      const notificationService = new NotificationService(db);

      // Extract company/domain name from URL for better summary
      let monitorName = 'One-time Page';
      try {
        const urlObj = new URL(url);
        // Extract domain name (e.g., "elevenlabs.io" -> "ElevenLabs")
        const hostname = urlObj.hostname;
        // Remove www. prefix if present
        const domain = hostname.replace(/^www\./i, '');
        // Extract the main domain part (e.g., "elevenlabs.io" -> "elevenlabs")
        const domainParts = domain.split('.');
        
        // Handle special cases for well-known domains (check full domain and subdomains)
        const domainLower = domain.toLowerCase();
        if (domainLower.includes('google.com') || domainLower.includes('blog.google') || domainLower.includes('googleblog')) {
          monitorName = 'Google';
        } else if (domainLower.includes('microsoft.com') || domainLower.includes('microsoft.')) {
          monitorName = 'Microsoft';
        } else if (domainLower.includes('apple.com') || domainLower.includes('apple.')) {
          monitorName = 'Apple';
        } else if (domainLower.includes('anthropic.com') || domainLower.includes('anthropic.')) {
          monitorName = 'Anthropic';
        } else if (domainLower.includes('openai.com') || domainLower.includes('openai.')) {
          monitorName = 'OpenAI';
        } else if (domainLower.includes('elevenlabs.io') || domainLower.includes('elevenlabs.')) {
          monitorName = 'ElevenLabs';
        } else {
          // For other domains, use the main domain part (usually the second-to-last part for TLDs)
          // e.g., "blog.example.com" -> "example", "example.com" -> "example"
          let mainDomain = domainParts[0];
          if (domainParts.length >= 2) {
            // For domains like "blog.google.com", take "google"
            // For domains like "elevenlabs.io", take "elevenlabs"
            const tldIndex = domainParts.length - 1;
            mainDomain = domainParts[tldIndex - 1] || domainParts[0];
          }
          // Capitalize first letter of each word
          monitorName = mainDomain
            .split(/[-_]/)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join('');
        }
      } catch {
        monitorName = 'One-time Page';
      }

      // Create a temporary monitor object for fetching
      const tempMonitor = {
        id: 0,
        name: monitorName,
        url,
        intervalMinutes: 60,
        type: 'webpage' as const,
        selector: null,
        includeLink: true,
        active: true,
        createdAt: new Date().toISOString(),
        lastCheckedAt: null,
      } as Monitor;

      // Fetch the page
      const fetchResult = await fetcher.check(tempMonitor);
      if (!fetchResult.success || !fetchResult.content) {
        return c.json({ error: fetchResult.error || 'Failed to fetch page' }, 400);
      }

      // Convert to markdown if HTML
      let contentMd = fetchResult.content;
      const isHtml = (content: string): boolean => {
        const trimmed = content.trim();
        return trimmed.startsWith('<!') || trimmed.includes('<html') || trimmed.includes('<body');
      };
      if (tempMonitor.type === 'webpage' && isHtml(contentMd)) {
        contentMd = markdownConverter.convert(contentMd);
      }

      // Create a diff-like markdown showing all content as additions
      const diffMarkdown = contentMd
        .split('\n')
        .map((line) => `+ ${line}`)
        .join('\n');

      // Generate summary
      const summaryResult = await summaryService.generateSummary(tempMonitor, diffMarkdown);
      if (!summaryResult || !summaryResult.text) {
        return c.json({ error: 'Failed to generate summary' }, 500);
      }

      const structured = summaryResult.structured;
      if (structured && structured.status === 'no_changes') {
        return c.json({ error: 'No material content found to summarize' }, 400);
      }

      // Get Telegram channels (check both active and inactive)
      const allTelegramChannels = db.listNotificationChannels(false).filter((ch) => ch.type === 'telegram');
      let channels = db.listNotificationChannels(true).filter((ch) => ch.type === 'telegram');
      
      if (channelId) {
        const specificChannel = allTelegramChannels.find((ch) => ch.id === channelId);
        if (!specificChannel) {
          return c.json({ error: `Telegram channel with ID ${channelId} not found` }, 404);
        }
        channels = [specificChannel];
      }

      // Check for environment variables as fallback
      const envBotToken = process.env.TELEGRAM_BOT_TOKEN;
      const envChatId = process.env.TELEGRAM_CHAT_ID;
      const hasEnvVars = envBotToken && envChatId;

      // Build channels with config - try database first, fall back to env vars
      let channelsWithConfig: ChannelWithConfig[] = [];

      // Try to decrypt channel configs from database
      if (channels.length > 0) {
        channelsWithConfig = channels
          .map((ch) => {
            try {
              const raw = encryption.decrypt(ch.encryptedConfig);
              const config = TelegramConfigSchema.parse(raw);
              return {
                ...ch,
                config,
                includeLink: true,
              };
            } catch (err) {
              console.error(`[${new Date().toISOString()}] Failed to decrypt/parse channel ${ch.id}: ${err instanceof Error ? err.message : String(err)}`);
              return null;
            }
          })
          .filter((ch): ch is NonNullable<typeof ch> => ch !== null);
      }

      // If no valid channels from database, try environment variables
      if (channelsWithConfig.length === 0 && hasEnvVars) {
        // Use environment variables as fallback
        try {
          const envConfig = TelegramConfigSchema.parse({
            botToken: envBotToken,
            chatId: envChatId,
          });
          // Create a temporary channel object that matches ChannelWithConfig structure
          channelsWithConfig = [{
            id: 0,
            name: 'Telegram (from .env)',
            type: 'telegram',
            config: envConfig,
            includeLink: true,
            active: true,
            createdAt: new Date().toISOString(),
            encryptedConfig: '', // Not needed when using env vars directly
          } as ChannelWithConfig];
        } catch (err) {
          return c.json({ 
            error: 'Invalid Telegram configuration in environment variables.',
            hint: 'Check that TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set correctly in .env'
          }, 400);
        }
      }

      // Final check - if still no valid channels, return error
      if (channelsWithConfig.length === 0) {
        if (allTelegramChannels.length === 0 && !hasEnvVars) {
          return c.json({ 
            error: 'No Telegram channels configured. Please create a Telegram notification channel first using the TUI or API, or set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.',
            hint: 'Use the TUI (bun changes) to add a Telegram channel, POST to /api/channels, or set environment variables'
          }, 404);
        }
        
        if (channels.length === 0 && allTelegramChannels.length > 0) {
          const inactiveCount = allTelegramChannels.length;
          return c.json({ 
            error: `No active Telegram channels found. You have ${inactiveCount} inactive Telegram channel(s).`,
            hint: 'Activate a Telegram channel, specify a channelId in the request, or set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env'
          }, 404);
        }

        return c.json({ 
          error: 'No valid Telegram channel configurations found. Channel configs may be corrupted or invalid.',
          hint: 'Try recreating your Telegram channels, check channel configurations, or set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env'
        }, 400);
      }

      // Create a temporary change object for notification
      // Note: afterSnapshotId is required in schema but we use a type assertion
      // since this is a one-time summary that doesn't need real snapshots
      const tempChange = {
        id: 0,
        monitorId: tempMonitor.id,
        beforeSnapshotId: null,
        afterSnapshotId: 0, // Required by schema but not used for one-time summaries
        summary: summaryResult.text,
        aiSummary: summaryResult.text,
        diffMd: diffMarkdown,
        diffType: 'addition' as const,
        releaseVersion: null,
        aiSummaryMeta: structured ? JSON.stringify(structured) : null,
        createdAt: new Date().toISOString(),
      } as Change;

      // Send notifications
      const results = await notificationService.sendNotifications(
        tempChange,
        tempMonitor,
        channelsWithConfig,
        url,
        { allowRepeat: true }
      );

      const successCount = results.filter((r) => r.ok).length;
      if (successCount === 0) {
        const errors = results.map((r) => r.error).filter(Boolean);
        return c.json({ 
          error: 'Failed to send notifications', 
          details: errors 
        }, 500);
      }

      return c.json({ 
        success: true, 
        message: `Summary sent to ${successCount} channel(s)`,
        summary: summaryResult.text,
        channelsSent: successCount,
        totalChannels: channelsWithConfig.length,
      });
    } catch (error: unknown) {
      const e = error as Error;
      return c.json({ error: e.message || 'Invalid request' }, 400);
    }
  });

  return app;
}
