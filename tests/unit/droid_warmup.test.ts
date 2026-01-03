import { describe, it, expect, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { warmupDroidModel } from '../../src/lib/ai/droid';
import { DroidSummarizer } from '../../src/lib/summarizer-droid';

describe('droid warm-up helper', () => {
  it('runs droid exec ping with expected flags', () => {
    const mock = spyOn(childProcess, 'spawnSync').mockReturnValue({
      status: 0,
      stdout: 'pong',
      stderr: '',
    } as unknown as childProcess.SpawnSyncReturns<string>);

    const res = warmupDroidModel('claude-haiku');
    expect(mock).toHaveBeenCalledWith(
      'droid',
      ['exec', '-m', 'claude-haiku', '-o', 'text', '-r', 'off', 'ping'],
      { encoding: 'utf8' }
    );
    expect(res.ok).toBeTrue();
    mock.mockRestore();
  });
});

describe('DroidSummarizer warm-up integration', () => {
  it('performs warm-up before generating summary', async () => {
    const calls: Array<{ args: unknown[] }> = [];
    const mock = spyOn(childProcess, 'spawnSync').mockImplementation(((...params: Parameters<typeof childProcess.spawnSync>) => {
      const [cmd, args, options] = params;
      calls.push({ args: args as unknown[] });
      if (Array.isArray(args) && args.includes('ping')) {
        return { status: 0, stdout: 'ping-ok', stderr: '' } as childProcess.SpawnSyncReturns<string>;
      }
      return {
        status: 0,
        stdout: JSON.stringify({
          status: 'ok',
          title: 'Update',
          features: ['Feature A'],
        }),
        stderr: '',
      } as childProcess.SpawnSyncReturns<string>;
    }) as typeof childProcess.spawnSync);

    const summarizer = new DroidSummarizer('claude-dev');
    const result = await summarizer.summarize({
      monitorName: 'Test',
      url: 'https://example.com',
      diffMarkdown: 'diff',
      extraInstructions: undefined,
    });

    expect(result?.text).toContain('**Update**');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(calls[0].args) && (calls[0].args as string[]).includes('ping')).toBeTrue();
    expect(mock).toHaveBeenCalledTimes(2);
    mock.mockRestore();
  });
});
