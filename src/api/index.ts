import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { DB } from '@/db';
import type { Scheduler } from '../scheduler';
import type { JobsQueue } from '@/jobs/queue';
import { z } from 'zod';
import { notificationChannelPlugins } from '@/lib/channel';
import { encryption } from '@/lib/encryption';
import { TelegramConfigSchema } from '@/lib/notification/telegram';

// Validation schemas
const httpUrlSchema = z.string().url().refine((value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}, { message: 'URL must start with http:// or https://' });

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
  
  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
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
      const data = createChannelSchema.parse(body);

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

  return app;
}
