import { parseDiff, getChangedFilePaths, lineInDiff } from './static/diff-parser.js';

function normalizePath(file) {
  return String(file || '').replace(/\\/g, '/').trim();
}

function evidenceInDiff(diffText, evidence) {
  const needle = String(evidence || '').trim();
  if (!needle || needle.length < 3) return false;
  const haystack = String(diffText || '');
  if (haystack.includes(needle)) return true;
  // 允许匹配去掉 leading + 的 evidence
  const stripped = needle.replace(/^\+/, '').trim();
  return stripped.length >= 3 && haystack.includes(stripped);
}

/**
 * 对 AI 产出的 issue 做程序化锚定；静态 issue 已 grounded 则原样保留。
 */
export function groundIssues(issues, diffText, options = {}) {
  const { strict = true, requireEvidenceForAi = true } = options;
  const parsed = parseDiff(diffText);
  const changedFiles = new Set(getChangedFilePaths(parsed).map(normalizePath));

  const kept = [];
  const dropped = [];

  for (const issue of issues || []) {
    if (issue.source === 'static' && issue.grounded) {
      kept.push(issue);
      continue;
    }

    const file = normalizePath(issue.file);
    let dropReason;

    if (!file || file === 'unknown' || !changedFiles.has(file)) {
      dropReason = 'file_not_in_diff';
    } else if (!lineInDiff(parsed, file, issue.line)) {
      dropReason = 'line_out_of_hunk';
    } else if (requireEvidenceForAi && !issue.evidence) {
      dropReason = 'missing_evidence';
    } else if (requireEvidenceForAi && !evidenceInDiff(diffText, issue.evidence)) {
      dropReason = 'evidence_mismatch';
    }

    if (dropReason && strict) {
      dropped.push({ issue, dropReason });
      continue;
    }

    kept.push({
      ...issue,
      source: issue.source || 'ai',
      grounded: !dropReason,
      dropReason: dropReason || undefined
    });
  }

  return { issues: kept, dropped, groundedCount: kept.filter((i) => i.grounded).length };
}
