/**
 * Cloudflare Workers Entry Point
 * 
 * This is a placeholder implementation. The current DB class uses synchronous
 * Bun SQLite methods and needs to be refactored for async D1 operations.
 * 
 * TODO: Refactor DB class to support D1 bindings
 * TODO: Adapt job queue to use Cloudflare Queue
 * TODO: Implement queue consumer handler
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  MONITOR_QUEUE?: Queue; // Optional - requires paid plan
  ENCRYPTION_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  // Optional: For testing Telegram sending without database
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: String(text),
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { ok: false, error: `Telegram API error: ${error}` };
    }

    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, error: msg };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Test endpoint: Send Telegram message from Cloudflare
    if (url.pathname === '/test-telegram' && request.method === 'POST') {
      try {
        const body = await request.json() as { botToken?: string; chatId?: string; message?: string };
        
        // Use provided values or fall back to environment variables
        const botToken = body.botToken || env.TELEGRAM_BOT_TOKEN;
        const chatId = body.chatId || env.TELEGRAM_CHAT_ID;
        const message = body.message || 'Test message from Cloudflare Worker! 🚀';
        
        if (!botToken || !chatId) {
          return Response.json(
            { ok: false, error: 'Missing botToken or chatId. Provide in request body or set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in environment variables.' },
            { status: 400 }
          );
        }
        
        const result = await sendTelegramMessage(botToken, chatId, message);
        
        if (result.ok) {
          return Response.json({ ok: true, message: 'Telegram message sent successfully from Cloudflare Worker!' });
        } else {
          return Response.json({ ok: false, error: result.error }, { status: 500 });
        }
      } catch (error) {
        return Response.json(
          { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    }
    
    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', source: 'cloudflare-worker', timestamp: new Date().toISOString() });
    }
    
    // TODO: Initialize DB with D1
    // const db = new DB(env.DB);
    
    // TODO: Initialize queue with Cloudflare Queue
    // const queue = createCloudflareQueue(env.MONITOR_QUEUE, db);
    
    // TODO: Initialize scheduler
    // const scheduler = new Scheduler(db, 60 * 1000, queue);
    
    // TODO: Create API server
    // const app = createApiServer(db, scheduler, queue);
    
    // return app.fetch(request);
    
    return Response.json({
      message: 'Morakeb - Cloudflare Worker',
      status: 'Implementation pending DB refactoring',
      endpoints: {
        '/health': 'GET - Health check',
        '/test-telegram': 'POST - Test Telegram sending (requires botToken, chatId, message in body, or TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID env vars)',
      },
    }, {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  
  // Cron trigger: runs once per day at midnight UTC
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // TODO: Implement scheduled monitor checks
    // const db = new DB(env.DB);
    // const queue = createCloudflareQueue(env.MONITOR_QUEUE, db);
    // const scheduler = new Scheduler(db, 60 * 1000, queue);
    // await scheduler.checkNow();
  },
  
  // Queue consumer: process monitor checks
  async queue(batch: MessageBatch<{ type: string; payload: unknown }>, env: Env): Promise<void> {
    // TODO: Process batch of monitor check jobs
    // for (const message of batch.messages) {
    //   const { type, payload } = message.body;
    //   if (type === 'monitor.check') {
    //     // Process monitor check
    //   }
    //   message.ack();
    // }
  },
};
