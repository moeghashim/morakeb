import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { eq, desc, and, sql, isNotNull, lte, isNull, inArray } from 'drizzle-orm';
import { encryption } from '../lib/encryption';
import { validateChannelConfig, type ChannelWithConfig } from '../lib/channel';
import * as schema from './schema';
import type {
  Monitor,
  NewMonitor,
  Snapshot,
  NewSnapshot,
  Change,
  NewChange,
  NotificationChannel,
  NewNotificationChannel,
  AIProvider,
  AIModel,
  NotificationEvent,
  NewNotificationEvent,
  ChannelDigestItem,
  NewChannelDigestItem,
  JobEvent,
  NewJobEvent,
} from './schema';

export class DB {
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database;

  constructor(dbPath: string) {
    // Ensure parent directory exists for file-backed databases
    try {
      if (dbPath && !dbPath.startsWith(':memory:')) {
        const dir = dirname(dbPath);
        if (dir && dir !== '.' && dir !== '/') {
          mkdirSync(dir, { recursive: true });
        }
      }
    } catch {}
    this.sqlite = new Database(dbPath, { strict: true });
    this.sqlite.exec('PRAGMA journal_mode = WAL');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.db = drizzle(this.sqlite, { schema });
  }

  private getLastInsertId(): number {
    const row = this.sqlite.prepare('select last_insert_rowid() as id').get() as { id: number | bigint };
    const id = typeof row.id === 'bigint' ? Number(row.id) : Number(row.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('Failed to resolve last inserted id');
    }
    return id;
  }

  private toId(value: number | string | null | undefined): number {
    const id = typeof value === 'string' ? Number(value) : value;
    if (!Number.isInteger(id as number)) {
      throw new Error(`Invalid identifier: ${value}`);
    }
    return id as number;
  }

  // Raw SQLite access for browser/debugging tools
  getRawDB(): Database {
    return this.sqlite;
  }

  // ============================================================================
  // Monitors
  // ============================================================================

  createMonitor(data: Omit<NewMonitor, 'id' | 'createdAt'>): Monitor {
    const monitor: NewMonitor = {
      ...data,
    };
    this.db.insert(schema.monitors).values(monitor).run();
    const id = this.getLastInsertId();
    return this.getMonitor(id)!;
  }

  getMonitor(id: number | string): Monitor | undefined {
    const numericId = this.toId(id);
    return this.db.select().from(schema.monitors).where(eq(schema.monitors.id, numericId)).get();
  }

  listMonitors(activeOnly: boolean = false): Monitor[] {
    if (activeOnly) {
      return this.db.select().from(schema.monitors).where(eq(schema.monitors.active, true)).orderBy(desc(schema.monitors.createdAt)).all();
    }
    return this.db.select().from(schema.monitors).orderBy(desc(schema.monitors.createdAt)).all();
  }

  updateMonitor(id: number | string, data: Partial<Omit<Monitor, 'id' | 'createdAt'>>): Monitor | undefined {
    const numericId = this.toId(id);
    this.db.update(schema.monitors).set(data).where(eq(schema.monitors.id, numericId)).run();
    return this.getMonitor(numericId);
  }

  deleteMonitor(id: number | string): boolean {
    const numericId = this.toId(id);
    const result = this.db.delete(schema.monitors).where(eq(schema.monitors.id, numericId)).run();
    return (result as unknown as { changes: number }).changes > 0;
  }

  updateMonitorLastChecked(id: number | string, timestamp: string) {
    const numericId = this.toId(id);
    this.db.update(schema.monitors).set({ lastCheckedAt: timestamp }).where(eq(schema.monitors.id, numericId)).run();
  }

  // ============================================================================
  // Snapshots
  // ============================================================================

  createSnapshot(data: Omit<NewSnapshot, 'id' | 'createdAt'>): Snapshot {
    const snapshot: NewSnapshot = {
      ...data,
    };
    this.db.insert(schema.snapshots).values(snapshot).run();
    const id = this.getLastInsertId();
    return this.getSnapshot(id)!;
  }

  getSnapshot(id: number | string): Snapshot | undefined {
    const numericId = this.toId(id);
    return this.db.select().from(schema.snapshots).where(eq(schema.snapshots.id, numericId)).get();
  }

  getLatestSnapshot(monitorId: number | string): Snapshot | undefined {
    const numericMonitorId = this.toId(monitorId);
    return this.db.select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.monitorId, numericMonitorId))
      .orderBy(desc(schema.snapshots.createdAt))
      .limit(1)
      .get();
  }

  getSnapshotByVersion(monitorId: number | string, releaseVersion: string): Snapshot | undefined {
    const numericMonitorId = this.toId(monitorId);
    return this.db.select()
      .from(schema.snapshots)
      .where(and(
        eq(schema.snapshots.monitorId, numericMonitorId),
        eq(schema.snapshots.releaseVersion, releaseVersion)
      ))
      .orderBy(desc(schema.snapshots.createdAt))
      .limit(1)
      .get();
  }

  getLatestSnapshotWithRelease(monitorId: number | string): Snapshot | undefined {
    const numericMonitorId = this.toId(monitorId);
    return this.db.select()
      .from(schema.snapshots)
      .where(and(
        eq(schema.snapshots.monitorId, numericMonitorId),
        isNotNull(schema.snapshots.releaseVersion)
      ))
      .orderBy(desc(schema.snapshots.createdAt))
      .limit(1)
      .get();
  }

  listSnapshots(monitorId: number | string, limit: number = 10): Snapshot[] {
    const numericMonitorId = this.toId(monitorId);
    return this.db.select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.monitorId, numericMonitorId))
      .orderBy(desc(schema.snapshots.createdAt))
      .limit(limit)
      .all();
  }

  // ============================================================================
  // Changes
  // ============================================================================

  createChange(data: Omit<NewChange, 'id' | 'createdAt'>): Change {
    const change: NewChange = {
      ...data,
    };
    this.db.insert(schema.changes).values(change).run();
    const id = this.getLastInsertId();
    return this.getChange(id)!;
  }

  getChange(id: number | string): Change | undefined {
    const numericId = this.toId(id);
    return this.db.select().from(schema.changes).where(eq(schema.changes.id, numericId)).get();
  }

  listChanges(limit: number = 50): Change[] {
    return this.db.select()
      .from(schema.changes)
      .orderBy(desc(schema.changes.createdAt))
      .limit(limit)
      .all();
  }

  listChangesByMonitor(monitorId: number | string, limit: number = 50): Change[] {
    const numericMonitorId = this.toId(monitorId);
    return this.db.select()
      .from(schema.changes)
      .where(eq(schema.changes.monitorId, numericMonitorId))
      .orderBy(desc(schema.changes.createdAt))
      .limit(limit)
      .all();
  }
  getChangesByIds(ids: Array<number | string>): Change[] {
    if (!ids || ids.length === 0) return [];
    const numericIds = ids.map((id) => this.toId(id));
    return this.db
      .select()
      .from(schema.changes)
      .where(inArray(schema.changes.id, numericIds))
      .all();
  }

  updateChangeAISummary(id: number | string, aiSummary: string | null, aiSummaryMeta?: string | null): Change | undefined {
    const numericId = this.toId(id);
    const updates: Record<string, unknown> = { aiSummary };
    if (aiSummaryMeta !== undefined) {
      updates['aiSummaryMeta'] = aiSummaryMeta ?? null;
    }
    this.db.update(schema.changes).set(updates as any).where(eq(schema.changes.id, numericId)).run();
    return this.getChange(numericId);
  }

  cleanupMonitorHistory(
    monitorId: number | string,
    keepSnapshots: number,
    keepChanges: number
  ): { deletedSnapshots: number; deletedChanges: number } {
    const numericMonitorId = this.toId(monitorId);
    const snapKeep = Math.max(0, Math.floor(keepSnapshots));
    const changeKeep = Math.max(0, Math.floor(keepChanges));

    let deletedSnapshots = 0;
    let deletedChanges = 0;

    if (snapKeep === 0) {
      const res = this.sqlite.prepare('DELETE FROM snapshots WHERE monitor_id = ?').run(numericMonitorId) as unknown as { changes: number };
      deletedSnapshots = res.changes || 0;
    } else {
      const rows = this.sqlite
        .prepare('SELECT id FROM snapshots WHERE monitor_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(numericMonitorId, snapKeep) as Array<{ id: number }>;
      const keepIds = rows.map((r) => r.id);
      if (keepIds.length > 0) {
        const placeholders = keepIds.map(() => '?').join(',');
        const stmt = this.sqlite.prepare(
          `DELETE FROM snapshots WHERE monitor_id = ? AND id NOT IN (${placeholders})`
        );
        const res = stmt.run(numericMonitorId, ...keepIds) as unknown as { changes: number };
        deletedSnapshots = res.changes || 0;
      }
    }

    if (changeKeep === 0) {
      const res = this.sqlite.prepare('DELETE FROM changes WHERE monitor_id = ?').run(numericMonitorId) as unknown as { changes: number };
      deletedChanges = res.changes || 0;
    } else {
      const rows = this.sqlite
        .prepare('SELECT id FROM changes WHERE monitor_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(numericMonitorId, changeKeep) as Array<{ id: number }>;
      const keepIds = rows.map((r) => r.id);
      if (keepIds.length > 0) {
        const placeholders = keepIds.map(() => '?').join(',');
        const stmt = this.sqlite.prepare(
          `DELETE FROM changes WHERE monitor_id = ? AND id NOT IN (${placeholders})`
        );
        const res = stmt.run(numericMonitorId, ...keepIds) as unknown as { changes: number };
        deletedChanges = res.changes || 0;
      }
    }

    return { deletedSnapshots, deletedChanges };
  }

  // ============================================================================
  // Notification Channels
  // ============================================================================

  createNotificationChannel(data: { name: string; type: string; config: unknown; active?: boolean }): NotificationChannel {
    const validated = validateChannelConfig(data.type, data.config);
    const encrypted = encryption.encrypt(validated);
    
    const channel: NewNotificationChannel = {
      name: data.name,
      type: data.type,
      encryptedConfig: encrypted,
      active: data.active ?? true,
    };
    
    this.db.insert(schema.notificationChannels).values(channel).run();
    const id = this.getLastInsertId();
    return this.getNotificationChannel(id)!;
  }

  getNotificationChannel(id: number | string): NotificationChannel | undefined {
    const numericId = this.toId(id);
    return this.db.select().from(schema.notificationChannels).where(eq(schema.notificationChannels.id, numericId)).get();
  }

  getNotificationChannelDecrypted(id: number | string): (NotificationChannel & { config: unknown }) | undefined {
    const channel = this.getNotificationChannel(id);
    if (!channel) return undefined;
    
    return {
      ...channel,
      config: encryption.decrypt(channel.encryptedConfig),
    };
  }

  listNotificationChannels(activeOnly: boolean = false): NotificationChannel[] {
    if (activeOnly) {
      return this.db.select()
        .from(schema.notificationChannels)
        .where(eq(schema.notificationChannels.active, true))
        .orderBy(desc(schema.notificationChannels.createdAt))
        .all();
    }
    return this.db.select()
      .from(schema.notificationChannels)
      .orderBy(desc(schema.notificationChannels.createdAt))
      .all();
  }

  updateNotificationChannel(id: number | string, data: Partial<{ name: string; config: unknown; active: boolean }>): NotificationChannel | undefined {
    const updates: Record<string, unknown> = {};
    
    if (data.name !== undefined) {
      updates.name = data.name;
    }
    if (data.config !== undefined) {
      const existing = this.getNotificationChannel(id);
      const channelType = existing?.type;
      if (!channelType) throw new Error('Unable to determine channel type for update');
      const validated = validateChannelConfig(channelType, data.config);
      updates.encryptedConfig = encryption.encrypt(validated);
    }
    if (data.active !== undefined) {
      updates.active = data.active;
    }

    if (Object.keys(updates).length > 0) {
      const numericId = this.toId(id);
      this.db.update(schema.notificationChannels).set(updates).where(eq(schema.notificationChannels.id, numericId)).run();
    }
    
    return this.getNotificationChannel(id);
  }

  deleteNotificationChannel(id: number | string): boolean {
    const numericId = this.toId(id);
    const result = this.db.delete(schema.notificationChannels).where(eq(schema.notificationChannels.id, numericId)).run();
    return (result as unknown as { changes: number }).changes > 0;
  }

  // ============================================================================
  // Monitor <-> Notification Channel Relationships
  // ============================================================================

  linkChannelToMonitor(monitorId: number | string, channelId: number | string): boolean {
    try {
      const numericMonitorId = this.toId(monitorId);
      const numericChannelId = this.toId(channelId);
      this.db.insert(schema.monitorNotificationChannels).values({
        monitorId: numericMonitorId,
        channelId: numericChannelId,
        deliveryMode: 'immediate',
      }).run();
      return true;
    } catch (error) {
      // Unique constraint violation (already linked)
      return false;
    }
  }

  removeChannelFromMonitor(monitorId: number | string, channelId: number | string): boolean {
    const numericMonitorId = this.toId(monitorId);
    const numericChannelId = this.toId(channelId);
    const result = this.db.delete(schema.monitorNotificationChannels)
      .where(
        and(
          eq(schema.monitorNotificationChannels.monitorId, numericMonitorId),
          eq(schema.monitorNotificationChannels.channelId, numericChannelId)
        )
      )
      .run();
    return (result as unknown as { changes: number }).changes > 0;
  }

  getMonitorChannels(monitorId: number | string, activeOnly: boolean = false): ChannelWithConfig[] {
    const numericMonitorId = this.toId(monitorId);
    // Use drizzle join to ensure proper camelCase mapping
    const rows = this.db
      .select({
        id: schema.notificationChannels.id,
        name: schema.notificationChannels.name,
        type: schema.notificationChannels.type,
        encryptedConfig: schema.notificationChannels.encryptedConfig,
        active: schema.notificationChannels.active,
        createdAt: schema.notificationChannels.createdAt,
        linkIncludeLink: schema.monitorNotificationChannels.includeLink,
        linkDeliveryMode: schema.monitorNotificationChannels.deliveryMode,
        linkLastDigestAt: schema.monitorNotificationChannels.lastDigestAt,
      })
      .from(schema.notificationChannels)
      .innerJoin(
        schema.monitorNotificationChannels,
        eq(schema.monitorNotificationChannels.channelId, schema.notificationChannels.id)
      )
      .where(
        and(
          eq(schema.monitorNotificationChannels.monitorId, numericMonitorId),
          // Drizzle ignores undefined conditions; cast only here to satisfy types
          (activeOnly ? eq(schema.notificationChannels.active, true) : undefined) as any
        )
      )
      .all() as Array<{ id: number; name: string; type: string; encryptedConfig: string; active: boolean; createdAt: string; linkIncludeLink?: boolean|null }>;

    const result: ChannelWithConfig[] = [];
    for (const r of rows) {
      try {
        const cfgRaw = encryption.decrypt(r.encryptedConfig);
        const cfg = validateChannelConfig(r.type, cfgRaw);
        const deliveryRaw = (r as any).linkDeliveryMode as string | null | undefined;
        const deliveryMode: 'immediate' | 'weekly_digest' =
          deliveryRaw === 'weekly_digest' ? 'weekly_digest' : 'immediate';
        const lastDigestAt = (r as any).linkLastDigestAt ?? null;

        result.push({
          id: r.id,
          name: r.name,
          type: r.type,
          encryptedConfig: r.encryptedConfig,
          active: !!r.active,
          createdAt: r.createdAt,
          config: cfg,
          includeLink: (r as any).linkIncludeLink ?? null,
          deliveryMode,
          lastDigestAt: lastDigestAt ? String(lastDigestAt) : null,
        } as ChannelWithConfig);
      } catch (e) {
        console.error(`Failed to decrypt channel config for '${r.name}'; skipping`);
      }
    }
    return result;
  }

  // ============================================================================
  // Notification Events
  // ============================================================================

  recordNotificationEvent(data: Omit<NewNotificationEvent, 'id' | 'createdAt'>): NotificationEvent {
    this.db.insert(schema.notificationEvents).values(data).run();
    const id = this.getLastInsertId();
    return this.db.select().from(schema.notificationEvents).where(eq(schema.notificationEvents.id, id)).get()!;
  }

  hasSentNotificationForChange(changeId: number | string): boolean {
    const numericChangeId = this.toId(changeId);
    const existing = this.db.select({ id: schema.notificationEvents.id })
      .from(schema.notificationEvents)
      .where(and(
        eq(schema.notificationEvents.changeId, numericChangeId),
        eq(schema.notificationEvents.status, 'sent')
      ))
      .limit(1)
      .get();
    return !!existing;
  }

  hasSentNotificationForVersion(monitorId: number | string, releaseVersion: string): boolean {
    const numericMonitorId = this.toId(monitorId);
    const existing = this.db.select({ id: schema.notificationEvents.id })
      .from(schema.notificationEvents)
      .innerJoin(schema.changes, eq(schema.changes.id, schema.notificationEvents.changeId))
      .where(and(
        eq(schema.changes.monitorId, numericMonitorId),
        eq(schema.notificationEvents.releaseVersion, releaseVersion),
        eq(schema.notificationEvents.status, 'sent')
      ))
      .limit(1)
      .get();
    return !!existing;
  }

  listNotificationEventsForChange(changeId: number | string): NotificationEvent[] {
    const numericChangeId = this.toId(changeId);
    return this.db.select()
      .from(schema.notificationEvents)
      .where(eq(schema.notificationEvents.changeId, numericChangeId))
      .orderBy(desc(schema.notificationEvents.createdAt))
      .all();
  }

  // ============================================================================
  // Weekly Digest Items
  // ============================================================================

  addChannelDigestItem(data: Omit<NewChannelDigestItem, 'id' | 'createdAt' | 'sentAt'>): void {
    try {
      this.db.insert(schema.channelDigestItems).values({
        monitorId: this.toId(data.monitorId),
        channelId: this.toId(data.channelId),
        changeId: this.toId(data.changeId),
        digestAt: data.digestAt,
        digestKey: data.digestKey,
      }).run();
    } catch (error) {
      // Ignore uniqueness violations (already queued)
    }
  }

  listPendingDigestGroups(cutoffIso: string): Array<{
    monitorId: number;
    channelId: number;
    digestAt: string;
    digestKey: string;
    itemIds: number[];
    changeIds: number[];
  }> {
    const rows = this.db
      .select({
        id: schema.channelDigestItems.id,
        monitorId: schema.channelDigestItems.monitorId,
        channelId: schema.channelDigestItems.channelId,
        changeId: schema.channelDigestItems.changeId,
        digestAt: schema.channelDigestItems.digestAt,
        digestKey: schema.channelDigestItems.digestKey,
      })
      .from(schema.channelDigestItems)
      .where(and(
        lte(schema.channelDigestItems.digestAt, cutoffIso),
        isNull(schema.channelDigestItems.sentAt),
      ))
      .orderBy(
        schema.channelDigestItems.digestAt,
        schema.channelDigestItems.monitorId,
        schema.channelDigestItems.channelId,
        schema.channelDigestItems.id,
      )
      .all();

    const groups = new Map<string, {
      monitorId: number;
      channelId: number;
      digestAt: string;
      digestKey: string;
      itemIds: number[];
      changeIds: number[];
    }>();

    for (const row of rows) {
      const key = `${row.monitorId}:${row.channelId}:${row.digestAt}`;
      if (!groups.has(key)) {
        groups.set(key, {
          monitorId: row.monitorId,
          channelId: row.channelId,
          digestAt: row.digestAt,
          digestKey: row.digestKey,
          itemIds: [],
          changeIds: [],
        });
      }
      const entry = groups.get(key)!;
      entry.itemIds.push(row.id);
      entry.changeIds.push(row.changeId);
    }

    return Array.from(groups.values());
  }

  markDigestItemsSent(itemIds: number[], sentAtIso: string): void {
    if (!itemIds || itemIds.length === 0) return;
    this.db.update(schema.channelDigestItems)
      .set({ sentAt: sentAtIso })
      .where(inArray(schema.channelDigestItems.id, itemIds))
      .run();
  }

  // ============================================================================
  // Settings
  // ============================================================================

  getSetting(key: string): string | undefined {
    const result = this.db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    return result?.value;
  }

  setSetting(key: string, value: string): void {
    // Upsert: try insert, if exists then update
    try {
      this.db.insert(schema.settings).values({ key, value }).run();
    } catch {
      this.db.update(schema.settings).set({ value, updatedAt: new Date().toISOString() }).where(eq(schema.settings.key, key)).run();
    }
  }

  deleteSetting(key: string): boolean {
    const result = this.db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
    return (result as unknown as { changes: number }).changes > 0;
  }

  // ============================================================================
  // Utility
  // ============================================================================

  close() {
    this.sqlite.close();
  }

  // ============================================================================
  // AI Providers & Models
  // ============================================================================

  ensureDefaultAIData() {
    // Seed providers and models (idempotent via try/catch on inserts)

    const providers: { id: string; name: string }[] = [
      { id: 'droid', name: 'Droid' },
      { id: 'anthropic', name: 'Anthropic' },
      { id: 'openai', name: 'OpenAI' },
      { id: 'google', name: 'Google' },
    ];
    for (const p of providers) {
      try { this.db.insert(schema.aiProviders).values({ id: p.id, name: p.name, verified: p.id === 'droid' ? true : false }).run(); } catch {}
    }

    const insertModel = (id: string, providerId: string, display: string, isDefault = false, order = 0) => {
      try { this.db.insert(schema.aiModels).values({ id, providerId, display, isDefault, order, active: true }).run(); } catch {}
    };
    const hasDroidDefault = !!this.db.select()
      .from(schema.aiModels)
      .where(and(eq(schema.aiModels.providerId, 'droid'), eq(schema.aiModels.isDefault, true)))
      .get();
    // droid
    insertModel('claude-opus-4-5-20251101','droid','claude-opus-4-5-20251101', !hasDroidDefault, 0);
    insertModel('claude-sonnet-4-5-20250929','droid','claude-sonnet-4-5-20250929', false, 1);
    insertModel('claude-haiku-4-5-20251001','droid','claude-haiku-4-5-20251001', false, 2);
    insertModel('gpt-5.1','droid','gpt-5.1', false, 3);
    insertModel('gpt-5.1-codex','droid','gpt-5.1-codex', false, 4);
    insertModel('gpt-5.1-codex-max','droid','gpt-5.1-codex-max', false, 5);
    insertModel('gpt-5.2','droid','gpt-5.2', false, 6);
    insertModel('gemini-3-pro-preview','droid','gemini-3-pro-preview', false, 7);
    insertModel('gemini-3-flash-preview','droid','gemini-3-flash-preview', false, 8);
    insertModel('glm-4.6','droid','glm-4.6', false, 9);
    insertModel('glm-4.7','droid','glm-4.7', false, 10);
    // anthropic
    insertModel('claude-haiku-4-5','anthropic','claude-haiku-4-5', true, 0);
    insertModel('claude-sonnet-4-5-20250929','anthropic','claude-sonnet-4-5-20250929', false, 1);
    // openai
    insertModel('gpt-5-mini-2025-08-07','openai','gpt-5-mini-2025-08-07', true, 0);
    insertModel('gpt-5-2025-08-07','openai','gpt-5-2025-08-07', false, 1);
    insertModel('gpt-5-nano-2025-08-07','openai','gpt-5-nano-2025-08-07', false, 2);
    // google
    insertModel('gemini-2.5-flash-lite','google','gemini-2.5-flash-lite', true, 0);
    insertModel('gemini-2.5-flash','google','gemini-2.5-flash', false, 1);
  }

  getAIProvider(id: string): AIProvider | undefined {
    return this.db.select().from(schema.aiProviders).where(eq(schema.aiProviders.id, id)).get();
  }

  getAIProviderDecrypted(id: string): (AIProvider & { apiKey?: string }) | undefined {
    const p = this.getAIProvider(id);
    if (!p) return undefined;
    const apiKey = p.encryptedApiKey ? String(encryption.decrypt(p.encryptedApiKey)) : undefined;
    return { ...p, apiKey } as AIProvider & { apiKey?: string };
  }

  setAIProviderKey(id: string, apiKey: string) {
    const enc = encryption.encrypt(apiKey.trim());
    // store and mark verified false; verification happens separately
    this.db.update(schema.aiProviders).set({ encryptedApiKey: enc, verified: false, updatedAt: new Date().toISOString() }).where(eq(schema.aiProviders.id, id)).run();
  }

  setAIProviderVerified(id: string, verified: boolean) {
    this.db.update(schema.aiProviders).set({ verified, updatedAt: new Date().toISOString() }).where(eq(schema.aiProviders.id, id)).run();
  }

  listAIModels(providerId: string): AIModel[] {
    return this.db.select().from(schema.aiModels).where(eq(schema.aiModels.providerId, providerId)).orderBy(schema.aiModels.order).all();
  }

  // ============================================================================
  // Job Locks & Events
  // ============================================================================

  acquireJobLock(type: string, key: string, jobId: number): boolean {
    try {
      this.db.insert(schema.jobLocks).values({ type, key, jobId }).run();
      return true;
    } catch {
      return false;
    }
  }

  releaseJobLock(type: string, key: string): void {
    this.db.delete(schema.jobLocks)
      .where(and(eq(schema.jobLocks.type, type), eq(schema.jobLocks.key, key)))
      .run();
  }

  cleanupStaleJobLocks(timeoutMs: number): number {
    const seconds = Math.floor(timeoutMs / 1000);
    const stmt = this.sqlite.prepare(`DELETE FROM job_locks WHERE acquired_at < datetime('now', ?)`);
    const res = stmt.run(`-${seconds} seconds`) as unknown as { changes: number };
    return res.changes || 0;
  }

  recordJobEvent(event: Omit<NewJobEvent, 'id' | 'createdAt'>): JobEvent {
    this.db.insert(schema.jobEvents).values(event).run();
    const id = this.getLastInsertId();
    return this.db.select().from(schema.jobEvents).where(eq(schema.jobEvents.id, id)).get()!;
  }

  listJobEvents(filters?: { type?: string; status?: 'queued'|'started'|'skipped'|'done'|'failed'; monitorId?: number; jobId?: number; limit?: number }): JobEvent[] {
    const whereClauses: string[] = [];
    const params: (string|number)[] = [];
    if (filters?.type) { whereClauses.push('type = ?'); params.push(filters.type); }
    if (filters?.status) { whereClauses.push('status = ?'); params.push(filters.status); }
    if (typeof filters?.monitorId === 'number') { whereClauses.push('monitor_id = ?'); params.push(filters.monitorId); }
    if (typeof filters?.jobId === 'number') { whereClauses.push('job_id = ?'); params.push(filters.jobId); }
    const limit = Math.max(1, Math.min(500, Math.floor(filters?.limit ?? 50)));

    const whereSql = whereClauses.length ? ('WHERE ' + whereClauses.join(' AND ')) : '';
    const stmt = this.sqlite.prepare(
      `SELECT id, job_id as jobId, type, status, monitor_id as monitorId, message, error, created_at as createdAt
       FROM job_events ${whereSql}
       ORDER BY created_at DESC
       LIMIT ?`
    );
    const rows = stmt.all(...params, limit) as Array<{
      id: number; jobId: number|null; type: string; status: 'queued'|'started'|'skipped'|'done'|'failed'; monitorId: number|null; message: string|null; error: string|null; createdAt: string;
    }>;
    return rows.map(r => ({
      id: r.id,
      jobId: r.jobId ?? null,
      type: r.type,
      status: r.status,
      monitorId: r.monitorId ?? null,
      message: r.message ?? null,
      error: r.error ?? null,
      createdAt: r.createdAt,
    })) as unknown as JobEvent[];
  }
  // ============================================================================
  // Monitor-Channel Link Options
  // ============================================================================

  updateMonitorChannelOptions(
    monitorId: number | string,
    channelId: number | string,
    patch: Partial<{ includeLink: boolean | null; deliveryMode: 'immediate' | 'weekly_digest'; lastDigestAt: string | null }>
  ): void {
    const mId = this.toId(monitorId);
    const cId = this.toId(channelId);
    const updates: Record<string, unknown> = {};
    if (patch.includeLink !== undefined) updates['includeLink'] = patch.includeLink as any;
    if (patch.deliveryMode !== undefined) {
      updates['deliveryMode'] = patch.deliveryMode === 'weekly_digest' ? 'weekly_digest' : 'immediate';
    }
    if (patch.lastDigestAt !== undefined) {
      updates['lastDigestAt'] = patch.lastDigestAt ?? null;
    }
    if (Object.keys(updates).length === 0) return;
    this.db.update(schema.monitorNotificationChannels)
      .set(updates as any)
      .where(and(eq(schema.monitorNotificationChannels.monitorId, mId), eq(schema.monitorNotificationChannels.channelId, cId)))
      .run();
  }
}

// Export types
export type {
  Monitor,
  NewMonitor,
  Snapshot,
  NewSnapshot,
  Change,
  NewChange,
  NotificationChannel,
  NewNotificationChannel,
  NotificationEvent,
  NewNotificationEvent,
  AIProvider,
  AIModel,
  ChannelDigestItem,
  NewChannelDigestItem,
};
