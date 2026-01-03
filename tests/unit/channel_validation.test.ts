import { describe, it, expect } from 'bun:test';
import { validateChannelConfig } from '../../src/lib/channel';

describe('channel config validation', () => {
  it('validates telegram config', () => {
    const cfg = validateChannelConfig('telegram', { botToken: 'x', chatId: '123' }) as { botToken: string; chatId: string };
    expect(cfg.botToken).toBe('x');
    expect(cfg.chatId).toBe('123');
  });

});
