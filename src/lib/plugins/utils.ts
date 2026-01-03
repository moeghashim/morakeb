export function decodeEntities(input: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (_m, g1) => {
    if (g1[0] === '#') {
      if (g1[1]?.toLowerCase() === 'x') {
        const code = parseInt(g1.slice(2), 16);
        return String.fromCodePoint(code);
      }
      const code = parseInt(g1.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return named[g1] ?? `&${g1};`;
  });
}
