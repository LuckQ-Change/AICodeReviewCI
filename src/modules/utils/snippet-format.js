export function formatSnippets(snippets, format = 'raw') {
  if (!snippets || !snippets.length) return [];
  if (format === 'raw') return snippets;

  const cleaned = snippets.map((s) => {
    const lines = String(s).split(/\r?\n/);
    if (format === 'no_headers') {
      return lines
        .filter((l) => !(
          l.startsWith('diff --git ') ||
          l.startsWith('@@') ||
          l.startsWith('--- ') ||
          l.startsWith('+++ ')
        ))
        .join('\n');
    }
    if (format === 'added_only') {
      return lines
        .filter((l) => l.startsWith('+'))
        .join('\n');
    }
    return s;
  });
  return cleaned;
}