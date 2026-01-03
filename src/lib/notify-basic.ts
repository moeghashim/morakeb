export type GithubEnv = {
  repository?: string; // owner/repo
  refName?: string; // branch or tag
  sha?: string; // full sha
  actor?: string;
  runId?: string; // numeric id as string
  serverUrl?: string; // https://github.com
  workflow?: string;
  job?: string;
};

export type DeployStatus = 'start' | 'success' | 'failure';

export function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function shortSha(sha?: string): string {
  return (sha || '').slice(0, 7);
}

export function buildGithubEnv(env: Record<string, string | undefined>): GithubEnv {
  return {
    repository: env.GITHUB_REPOSITORY,
    refName: env.GITHUB_REF_NAME || env.GITHUB_REF?.split('/').pop(),
    sha: env.GITHUB_SHA,
    actor: env.GITHUB_ACTOR,
    runId: env.GITHUB_RUN_ID,
    serverUrl: env.GITHUB_SERVER_URL || 'https://github.com',
    workflow: env.GITHUB_WORKFLOW,
    job: env.GITHUB_JOB,
  };
}

export function buildRunUrl(gh: GithubEnv): string | undefined {
  if (!gh.serverUrl || !gh.repository || !gh.runId) return undefined;
  return `${gh.serverUrl}/${gh.repository}/actions/runs/${gh.runId}`;
}

export function buildDeployMessage(status: DeployStatus, gh: GithubEnv, opts: { message?: string; prefix?: string } = {}): string {
  const { message } = opts; // prefix intentionally ignored (message style standardized)
  const repo = gh.repository ?? '';
  const ref = gh.refName ?? '';
  const sha7 = shortSha(gh.sha);
  const by = gh.actor ? ` by ${gh.actor}` : '';
  const runUrl = buildRunUrl(gh);
  const runRef = repo && ref ? `${repo}@${ref}` : repo || ref;

  const action = status === 'start' ? 'started' : status === 'success' ? 'completed' : 'failed';
  const firstLine = `deploy ${action} for ${runRef}${sha7 ? ` (${sha7})` : ''}${by}`.trim();

  const parts: string[] = [firstLine];
  if (message && message.trim().length > 0) parts.push(message.trim());

  if (runUrl) {
    // Blank line before the link
    parts.push('');
    parts.push(runUrl);
  }

  return parts.join('\n');
}

export async function sendTelegram(params: { token: string; chatId: string; text: string }): Promise<{ ok: true } | { ok: false; error: string } > {
  const { token, chatId, text } = params;
  if (!token || !chatId) return { ok: false, error: 'Missing Telegram token or chat id' };
  if (!text || text.trim().length === 0) return { ok: false, error: 'Empty notification text' };

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId), text: String(text), disable_web_page_preview: false }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      return { ok: false, error: `Telegram API error: ${err}` };
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, error: msg };
  }
}
