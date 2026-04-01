export function globToRegex(glob) {
  // 简易glob到正则：支持 **, *, ?；路径分隔基于 '/'
  let re = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${re}$`);
}

function matchAny(path, patterns) {
  if (!patterns || !patterns.length) return false;
  return patterns.some((p) => globToRegex(p).test(path));
}

export function filterDiffByPaths(diffText, include = [], exclude = []) {
  if (!diffText) return '';
  const lines = diffText.split(/\r?\n/);
  const out = [];
  // 仅在遇到匹配的 diff 块后才开始保留内容；避免在首部元数据阶段误保留
  let keep = false;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      // 解析路径：例如 diff --git a/src/a.js b/src/a.js
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      const bPath = m ? m[2] : '';
      // include优先：如配置了include，仅匹配的才保留；否则默认保留
      const included = include && include.length ? matchAny(bPath, include) : true;
      const excluded = exclude && exclude.length ? matchAny(bPath, exclude) : false;
      keep = included && !excluded;
      if (keep) out.push(line);
      continue;
    }
    if (keep) out.push(line);
  }
  return out.join('\n');
}