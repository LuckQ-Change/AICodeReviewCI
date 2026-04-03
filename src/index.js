import { loadConfig } from './modules/config.js';
import { loadRules } from './modules/rules-loader.js';
import { collectCommitsSince } from './modules/git-collector.js';
import { createModelClient } from './modules/ai/index.js';
import { reviewCommits } from './modules/reviewer.js';
import { notifyResults } from './modules/notifiers/index.js';
import { scheduleJobs } from './modules/scheduler.js';
import fs from 'fs';
import path from 'path';

async function runOnce(config, runContext) {
  const rules = await loadRules(config);
  const model = await createModelClient(config);

  const { since } = runContext;
  const commits = await collectCommitsSince(config, since);

  if (!commits || commits.length === 0) {
    console.log(`[AI Code Review] 无新提交需要审核。since=${new Date(since).toISOString()}`);
    return { count: 0 };
  }

  const results = await reviewCommits({ config, rules, model, commits });
  await notifyResults({ config, results });
  return { count: commits.length };
}

async function main() {
  const config = await loadConfig();

  const ONE_SHOT = process.env.ONE_SHOT === 'true' || process.env.CI === 'true';
  const REVIEW_SINCE = process.env.REVIEW_SINCE; // 支持时间戳(ms)或ISO字符串

  const stateDir = path.join(process.cwd(), 'state');
  const stateFile = path.join(stateDir, 'last_run.json');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });

  const now = Date.now();
  let lastRun;
  const REVIEW_MODE = process.env.REVIEW_MODE; // 支持 'daily'（审核当天到当前定时点的所有提交）
  if (REVIEW_SINCE) {
    const maybeNum = Number(REVIEW_SINCE);
    lastRun = Number.isFinite(maybeNum) ? maybeNum : Date.parse(REVIEW_SINCE);
    if (!Number.isFinite(lastRun)) {
      console.warn(`[AI Code Review] 无法解析REVIEW_SINCE=${REVIEW_SINCE}，将使用状态文件或默认窗口`);
      lastRun = undefined;
    }
  }
  // 在CI定时执行场景下，支持通过REVIEW_MODE=daily自动审核当天范围
  if (lastRun === undefined && REVIEW_MODE === 'daily') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    lastRun = todayStart.getTime();
  }
  if (lastRun === undefined) {
    lastRun = now - 1000 * 60 * (config.schedule?.intervalMinutes ?? 60);
    if (fs.existsSync(stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        if (data?.lastRun) lastRun = data.lastRun;
      } catch {}
    }
  }

  // 立即运行一次
  const { count } = await runOnce(config, { since: lastRun });
  fs.writeFileSync(stateFile, JSON.stringify({ lastRun: now }, null, 2), 'utf-8');
  console.log(`[AI Code Review] 初次运行完成，审核提交数：${count}`);

  // CI环境默认单次运行，非CI才注册定时任务
  if (!ONE_SHOT) {
    scheduleJobs({
      config,
      onTick: async (since) => {
        const { count } = await runOnce(config, { since });
        fs.writeFileSync(stateFile, JSON.stringify({ lastRun: Date.now() }, null, 2), 'utf-8');
        console.log(`[AI Code Review] 定时运行完成，审核提交数：${count}`);
      }
    });
  } else {
    console.log('[AI Code Review] ONE_SHOT模式，已跳过定时任务注册');
  }
}

main().catch((err) => {
  console.error('[AI Code Review] 运行失败', err);
  process.exit(1);
});