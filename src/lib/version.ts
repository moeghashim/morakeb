export function extractVersion(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const m = String(text).match(/\bv?\d+(?:\.\d+){1,3}(?:[-a-zA-Z0-9\.]+)?\b/);
  if (!m) return undefined;
  const token = m[0];
  return token.startsWith('v') ? token : `v${token}`;
}
