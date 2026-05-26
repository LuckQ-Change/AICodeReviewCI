import fs from 'fs';
import path from 'path';
import { loadConfig } from './modules/config.js';
import { loadRules } from './modules/rules-loader.js';
import { collectCommitsSince } from './modules/git-collector.js';
import { createModelClient } from './modules/ai/index.js';
import { reviewCommits } from './modules/reviewer.js';
import { notifyResults } from './modules/notifiers/index.js';
import { scheduleJobs } from './modules/scheduler.js';
import { mergeProcessedHashes, readState, writeState } from './modules/state-store.js';
import { resolveFirstRunSince, resolveReviewSince } from './modules/review-since.js';
import { auditError, auditInfo } from './modules/audit-log.js';
import { summarizeReviewResults } from './modules/metrics.js';
import { writeReviewResults } from './modules/result-store.js';
import { loadOrBuildRepoContext } from './modules/context-cache.js';

async function runOnce(config, runContext) {
  const startedAt = Date.now();
  const rules = await loadRules(config);
  const repoContext = rules.needsAiReview && config.review?.context?.enabled !== false
    ? await loadOrBuildRepoContext(config)
    : null;
  const model = rules.needsAiReview ? await createModelClient(config) : null;

  const { since, processedHashes = [] } = runContext;
  auditInfo(config, 'run_started', { since, processedHashesCount: processedHashes.length });

  // 一轮执行固定按“收集 -> 审查 -> 通知 -> 落盘 -> 审计”推进，便于排查问题落点。
  const commits = await collectCommitsSince(config, since, { processedHashes });

  if (!commits || commits.length === 0) {
    console.log(`[AI Code Review] 没有新的提交需要审查。since=${new Date(since).toISOString()}`);
    auditInfo(config, 'run_skipped_no_commits', { since });
    return { count: 0, processedHashes: [] };
  }

  const results = await reviewCommits({ config, rules, model, commits, repoContext });
  const reviewSummary = summarizeReviewResults(results);
  const notificationSummary = await notifyResults({ config, results });
  // latest-results 便于快速查看最近结果，results.jsonl 便于历史检索和报表统计。
  const storageSummary = writeReviewResults(config, {
    results,
    summary: reviewSummary,
    notificationSummary
  });

  auditInfo(config, 'run_completed', {
    durationMs: Date.now() - startedAt,
    ...reviewSummary,
    notificationSummary,
    storageSummary
  });

  return { count: commits.length, processedHashes: commits.map((commit) => commit.hash) };
}

async function main() {
  const config = await loadConfig();

  const ONE_SHOT = process.env.ONE_SHOT === 'true' || process.env.CI === 'true';
  const REVIEW_SINCE = process.env.REVIEW_SINCE;

  const stateDir = path.join(process.cwd(), 'state');
  const stateFile = path.join(stateDir, 'last_run.json');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  const state = readState(stateFile);

  const now = Date.now();
  const REVIEW_MODE = process.env.REVIEW_MODE;

  let reviewSince;
  if (REVIEW_SINCE) {
    const maybeNum = Number(REVIEW_SINCE);
    reviewSince = Number.isFinite(maybeNum) ? maybeNum : Date.parse(REVIEW_SINCE);
    if (!Number.isFinite(reviewSince)) {
      console.warn(`[AI Code Review] 无法解析 REVIEW_SINCE=${REVIEW_SINCE}，将回退到默认时间窗口。`);
      reviewSince = undefined;
    }
  }

  const intervalMinutes = config.schedule?.intervalMinutes ?? 60;
  let since = resolveReviewSince({
    now,
    reviewSince,
    reviewMode: REVIEW_MODE,
    intervalMinutes
  });

  const neverReviewed = state.processedHashes.length === 0;
  const firstRunWindow = resolveFirstRunSince({
    since,
    now,
    intervalMinutes,
    neverReviewed,
    reviewSince,
    reviewMode: REVIEW_MODE
  });
  since = firstRunWindow.since;
  if (firstRunWindow.widened) {
    const windowDesc = firstRunWindow.useDayWindow
      ? '当天 0 点起'
      : `最近 ${firstRunWindow.lookbackMinutes} 分钟`;
    console.log(
      `[AI Code Review] 首次运行（尚无已审查提交），查询范围扩大到${windowDesc}（schedule.intervalMinutes=${intervalMinutes}）。`
    );
  }

  const firstRun = await runOnce(config, {
    since,
    processedHashes: state.processedHashes
  });

  writeState(stateFile, {
    lastRun: now,
    processedHashes: mergeProcessedHashes(state.processedHashes, firstRun.processedHashes)
  });
  console.log(`[AI Code Review] 首次执行完成，审查提交数：${firstRun.count}`);

  if (!ONE_SHOT) {
    scheduleJobs({
      config,
      initialSince: since,
      onTick: async (tickSince) => {
        const currentState = readState(stateFile);
        const result = await runOnce(config, {
          since: tickSince,
          processedHashes: currentState.processedHashes
        });

        writeState(stateFile, {
          lastRun: Date.now(),
          processedHashes: mergeProcessedHashes(currentState.processedHashes, result.processedHashes)
        });
        console.log(`[AI Code Review] 定时执行完成，审查提交数：${result.count}`);
      }
    });
  } else {
    console.log('[AI Code Review] ONE_SHOT 模式，已跳过定时任务注册。');
  }
}

main().catch((err) => {
  try {
    auditError({ audit: { dir: 'state' } }, 'main_failed', err);
  } catch {
    // 审计写入失败不覆盖主错误。
  }
  console.error(`[AI Code Review] 运行失败 [${err.code || err.name || 'UNKNOWN'}]`, err.message);
  process.exit(1);
});
