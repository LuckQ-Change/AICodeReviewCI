// 默认视为“代码”的文件扩展名（宽集合，覆盖常见语言）。
// 可通过 config.review.codeExtensions 覆盖；传入空数组等同于使用此默认集合。
export const DEFAULT_CODE_EXTENSIONS = [
  // JS / TS / 前端
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  // JVM
  'java', 'kt', 'kts', 'scala', 'groovy',
  // C / C++ / C#
  'c', 'h', 'cc', 'cpp', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'cs',
  // Go / Rust
  'go', 'rs',
  // 脚本 / 其他语言
  'py', 'rb', 'php', 'pl', 'lua', 'r', 'dart', 'swift', 'm', 'mm',
  // Shell / SQL
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql'
];

// 内置静态规则基于 JS/TS 语义编写，单独维护一份白名单，避免误报到其他语言。
const JS_TS_EXTENSIONS = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'];

function normalizeExtensions(extensions) {
  const list = Array.isArray(extensions) && extensions.length ? extensions : DEFAULT_CODE_EXTENSIONS;
  return list
    .map((ext) => String(ext).trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

function buildExtRegex(extensions) {
  const escaped = normalizeExtensions(extensions).map((ext) =>
    ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  if (!escaped.length) return /(?!)/; // 永不匹配
  return new RegExp(`\\.(${escaped.join('|')})$`, 'i');
}

const JS_TS_RE = buildExtRegex(JS_TS_EXTENSIONS);

export function isCodeFile(filePath, extensions) {
  return buildExtRegex(extensions).test(String(filePath || ''));
}

export function isJsTsFile(filePath) {
  return JS_TS_RE.test(String(filePath || ''));
}

/**
 * 解析 unified diff，提取变更文件与新增行（含新文件行号）。
 */
export function parseDiff(diffText, options = {}) {
  if (!diffText) {
    return { files: [], hasCodeChanges: false };
  }

  const extRe = buildExtRegex(options.codeExtensions);
  const lines = diffText.split(/\r?\n/);
  const files = [];
  let current = null;

  for (const line of lines) {
    const fileHeader = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (fileHeader) {
      if (current) files.push(current);
      const filePath = fileHeader[2];
      current = {
        file: filePath,
        isCode: extRe.test(filePath),
        hunks: [],
        addedLines: []
      };
      continue;
    }

    if (!current) continue;

    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkHeader) {
      const hunk = {
        newStart: parseInt(hunkHeader[1], 10),
        newCount: hunkHeader[2] ? parseInt(hunkHeader[2], 10) : 1,
        lines: []
      };
      current.hunks.push(hunk);
      current._activeHunk = hunk;
      current._newLine = hunk.newStart;
      continue;
    }

    const hunk = current._activeHunk;
    if (!hunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.slice(1);
      const entry = {
        line: current._newLine,
        content,
        raw: line
      };
      hunk.lines.push({ type: 'add', ...entry });
      if (current.isCode) {
        current.addedLines.push(entry);
      }
      current._newLine += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      hunk.lines.push({ type: 'del', content: line.slice(1), raw: line });
    } else if (line.startsWith(' ')) {
      const entry = {
        line: current._newLine,
        content: line.slice(1),
        raw: line
      };
      hunk.lines.push({ type: 'ctx', ...entry });
      current._newLine += 1;
    } else if (line.startsWith('\\')) {
      // no newline at end of file
    }
  }

  if (current) files.push(current);

  const hasCodeChanges = files.some((f) => f.isCode && f.addedLines.length > 0);
  return { files, hasCodeChanges };
}

export function getChangedFilePaths(parsed) {
  return (parsed?.files || []).map((f) => f.file);
}

export function lineInDiff(parsed, file, line) {
  const fileEntry = (parsed?.files || []).find((f) => f.file === file);
  if (!fileEntry) return false;

  for (const hunk of fileEntry.hunks) {
    const end = hunk.newStart + Math.max(hunk.newCount, 1) - 1;
    if (line >= hunk.newStart && line <= end) return true;
  }
  return false;
}
