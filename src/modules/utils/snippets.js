export function extractSnippets(diffText, maxSnippets = 2, maxLines = 20) {
  if (!diffText) return [];
  const lines = diffText.split(/\r?\n/);
  const snippets = [];
  let current = [];

  for (const line of lines) {
    // 简单基于hunk与新增/修改行提取
    if (line.startsWith('@@')) {
      if (current.length) {
        snippets.push(current.join('\n'));
        current = [];
        if (snippets.length >= maxSnippets) break;
      }
      current.push(line);
    } else if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
      if (current.length < maxLines) {
        current.push(line);
      }
    }
  }
  if (current.length && snippets.length < maxSnippets) snippets.push(current.join('\n'));
  return snippets.slice(0, maxSnippets);
}