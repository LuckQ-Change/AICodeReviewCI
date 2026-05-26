import { extractSnippets } from './utils/snippets.js';
import { filterDiffByPaths } from './utils/diff-filter.js';
import { normalizeReviewOutput, formatStructuredReview } from './ai/review-output.js';
import { parseDiff } from './static/diff-parser.js';
import { runBuiltinStatic } from './static/index.js';
import { groundIssues } from './issue-grounding.js';
import { mergeIssues, buildStructuredReviewFromIssues } from './issue-merge.js';
import { formatRepoContextForPrompt, loadOrBuildRepoContext } from './context-cache.js';

export async function reviewCommits({ config, rules, model, commits, repoContext }) {
  const results = [];
  const maxSnippets = config.review?.maxSnippetsPerCommit ?? 2;
  const maxLines = config.review?.maxLinesPerSnippet ?? 20;
  const include = config.review?.include ?? [];
  const exclude = config.review?.exclude ?? [];
  const codeExtensions = config.review?.codeExtensions;
  const staticEnabled = config.review?.static?.enabled !== false;
  const groundingOpts = {
    strict: config.review?.grounding?.strict !== false,
    requireEvidenceForAi: config.review?.grounding?.requireEvidenceForAi !== false
  };
  const requireEvidence = groundingOpts.requireEvidenceForAi;

  let cachedContext = repoContext;
  if (rules.needsAiReview && !cachedContext && config.review?.context?.enabled !== false) {
    cachedContext = await loadOrBuildRepoContext(config);
  }
  const repoContextText = formatRepoContextForPrompt(cachedContext);

  for (const c of commits) {
    const filteredDiff = filterDiffByPaths(c.diff, include, exclude);
    const parsed = parseDiff(filteredDiff, { codeExtensions });
    const hasCodeChanges = parsed.hasCodeChanges;
    const snippets = extractSnippets(filteredDiff, maxSnippets, maxLines);

    let staticIssues = [];
    if (staticEnabled && rules.builtin?.checks?.length) {
      staticIssues = runBuiltinStatic({
        diff: filteredDiff,
        activeChecks: rules.builtin.checks
      });
    }

    const usedDiffEmpty = !filteredDiff || String(filteredDiff).trim().length === 0;
    const canRunAi = rules.needsAiReview && model && hasCodeChanges && snippets.length > 0;

    if (!hasCodeChanges && staticIssues.length === 0) {
      results.push({
        commit: c,
        reviewText: '',
        structuredReview: { summary: '无代码变更或未识别到可审查的代码片段', issues: [] },
        parseMode: 'skipped',
        reviewPath: 'skipped',
        snippets,
        usedDiffEmpty,
        hasCodeChanges: false,
        skipped: true,
        groundingStats: { groundedCount: 0, droppedCount: 0 }
      });
      continue;
    }

    let aiIssues = [];
    let parseMode = staticIssues.length ? 'static-only' : 'skipped';
    let parseError;
    let reviewPath = staticIssues.length ? 'static-only' : 'skipped';
    let groundingStats = { groundedCount: staticIssues.length, droppedCount: 0 };

    if (canRunAi) {
      const compactDiff = snippets.join('\n\n');
      try {
        const rawReviewText = await model.review({
          rulesText: rules.ai?.text || rules.text,
          diff: compactDiff,
          context: {
            message: c.message,
            authorName: c.authorName,
            authorEmail: c.authorEmail,
            hash: c.hash,
            date: c.date
          },
          repoContextText
        });
        const normalized = normalizeReviewOutput(rawReviewText, { requireEvidence });
        parseMode = normalized.parseMode === 'json' ? 'hybrid' : normalized.parseMode;
        parseError = normalized.error ? normalized.error.message : undefined;

        const grounded = groundIssues(
          normalized.structuredReview.issues.map((i) => ({ ...i, source: 'ai' })),
          filteredDiff,
          groundingOpts
        );
        aiIssues = grounded.issues;
        groundingStats = {
          groundedCount: staticIssues.length + grounded.groundedCount,
          droppedCount: grounded.dropped.length
        };
        reviewPath = staticIssues.length ? 'hybrid' : 'ai-only';
      } catch (err) {
        parseError = err.message;
        parseMode = 'fallback';
        reviewPath = staticIssues.length ? 'static-only' : 'ai-only';
        groundingStats = { groundedCount: staticIssues.length, droppedCount: 0 };
      }
    }

    const merged = mergeIssues(staticIssues, aiIssues);
    const structuredReview = buildStructuredReviewFromIssues(merged);
    const reviewText = formatStructuredReview(structuredReview);

    results.push({
      commit: c,
      reviewText,
      structuredReview,
      parseMode: merged.length ? (reviewPath === 'hybrid' ? 'hybrid' : parseMode) : (staticIssues.length ? 'static-only' : parseMode),
      reviewPath,
      parseError,
      snippets,
      usedDiffEmpty,
      hasCodeChanges,
      skipped: false,
      groundingStats
    });
  }

  return results;
}
