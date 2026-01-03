import type { DB, Monitor } from '@/db';
import type { MonitorPlugin } from './types';
import { codexCliAtomPlugin } from './codex-cli-atom';
import { factoryCliRssPlugin } from './factory-cli-rss';

// Order matters: more specific matchers before generic ones
// These are example plugins and are opt-in via settings.
export const pluginRegistry: MonitorPlugin[] = [
  factoryCliRssPlugin,
  codexCliAtomPlugin,
];

export function resolvePlugin(m: Monitor, db: DB): { plugin?: MonitorPlugin; options?: unknown } {
  // Explicit config in settings takes precedence
  try {
    const raw = db.getSetting(`monitor:${m.id}:plugin`);
    if (raw) {
      const cfg = JSON.parse(raw);
      const plugin = pluginRegistry.find((p) => p.id === cfg.id);
      if (plugin) return { plugin, options: cfg.options };
    }
  } catch {
    // ignore
  }

  const examplesEnabled = (db.getSetting('example_plugins_enabled') || '').toLowerCase() === 'true';
  if (!examplesEnabled) return {};

  // Auto-detect
  const auto = pluginRegistry.find((p) => p.match(m));
  if (auto) {
    // Reasonable defaults can be returned by plugin.match or hard-coded here
    return { plugin: auto, options: undefined };
  }
  return {};
}
