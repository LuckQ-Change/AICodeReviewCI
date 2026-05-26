import { parseDiff, isJsTsFile } from './diff-parser.js';
import { runCheck, BUILTIN_CHECK_IDS } from './builtin-catalog.js';

export { parseDiff, isCodeFile, isJsTsFile, DEFAULT_CODE_EXTENSIONS } from './diff-parser.js';
export { BUILTIN_CHECK_IDS } from './builtin-catalog.js';

function hunkTextForFile(fileEntry) {
  return fileEntry.hunks
    .flatMap((h) => h.lines.map((l) => l.raw || ''))
    .join('\n');
}

/**
 * 对 diff 运行内置静态规则（仅 JS/TS 新增行，高置信模式）。
 */
export function runBuiltinStatic({ diff, activeChecks = [] }) {
  const enabled = activeChecks.filter((id) => BUILTIN_CHECK_IDS.includes(id));
  if (!enabled.length || !diff) return [];

  const parsed = parseDiff(diff);
  const issues = [];

  for (const fileEntry of parsed.files) {
    // 内置规则基于 JS/TS 语义，仅作用于 JS/TS 文件，避免在其他语言上误报。
    if (!isJsTsFile(fileEntry.file) || !fileEntry.addedLines.length) continue;
    const hunkText = hunkTextForFile(fileEntry);
    for (const checkId of enabled) {
      issues.push(...runCheck(checkId, fileEntry, hunkText));
    }
  }

  return issues;
}
