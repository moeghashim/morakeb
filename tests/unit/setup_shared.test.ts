import { describe, it, expect } from 'bun:test';
import { nextSpinnerFrame, createStatusMap } from '../../src/setup/shared';

describe('setup shared helpers', () => {
  it('cycles spinner frames', () => {
    expect(nextSpinnerFrame(0)).toBe(1);
    expect(nextSpinnerFrame(1)).toBe(2);
    expect(nextSpinnerFrame(2)).toBe(3);
    expect(nextSpinnerFrame(3)).toBe(0);
  });

  it('creates a status map', () => {
    const map = createStatusMap(['a', 'b'] as const, 'ready');
    expect(map.a).toBe('ready');
    expect(map.b).toBe('ready');
  });
});
