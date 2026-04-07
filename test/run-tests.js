import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../src/modules/config.js';
import { filterNewCommits } from '../src/modules/git-collector.js';
import { parseDailyToCron, scheduleJobs } from '../src/modules/scheduler.js';
import { mergeProcessedHashes, readState, writeState } from '../src/modules/state-store.js';
import { auditInfo } from '../src/modules/audit-log.js';
import { summarizeReviewResults } from '../src/modules/metrics.js';
import { retryAsync } from '../src/modules/retry.js';
import { writeReviewResults } from '../src/modules/result-store.js';
import { queryReviewResults } from '../src/modules/result-query.js';
import { buildSmtpTransportOptions } from '../src/modules/notifiers/email.js';
import { buildMessage, mdToHtml, notifyResults, shouldSkipNotification } from '../src/modules/notifiers/index.js';
import { normalizeReviewOutput } from '../src/modules/ai/review-output.js';
import { filterDiffByPaths, globToRegex } from '../src/modules/utils/diff-filter.js';
import { extractSnippets } from '../src/modules/utils/snippets.js';

const tests = [];

function addTest(name, fn) {
  tests.push({ name, fn });
}

async function runInTempProject(setupFn, runFn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicodereviewci-test-'));
  const previousCwd = process.cwd();
  const envBackup = { ...process.env };

  fs.mkdirSync(path.join(tempDir, 'config'), { recursive: true });

  try {
    await setupFn(tempDir);
    process.chdir(tempDir);
    return await runFn(tempDir);
  } finally {
    process.chdir(previousCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

addTest('loadConfig 解析 EMAIL_SECURE 和 EMAIL_SMTP_PORT', async () => {
  const loaded = await runInTempProject(
    async (tempDir) => {
      const config = {
        repo: { path: tempDir },
        model: { provider: 'openai', options: { apiKey: '${AI_API_KEY}', model: '${AI_MODEL}' } },
        notifications: {
          email: {
            enabled: 'true',
            from: 'bot@example.com',
            smtp: { host: 'smtp.example.com', port: '${EMAIL_SMTP_PORT}', secure: '${EMAIL_SECURE}' }
          }
        },
        schedule: { intervalMinutes: 5 }
      };

      fs.writeFileSync(path.join(tempDir, 'config', 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
      process.env.AI_API_KEY = 'test-key';
      process.env.AI_MODEL = 'gpt-4o-mini';
      process.env.EMAIL_SMTP_PORT = '465';
      process.env.EMAIL_SECURE = 'true';
    },
    async () => loadConfig()
  );

  assert.equal(loaded.notifications.email.smtp.port, 465);
  assert.equal(loaded.notifications.email.smtp.secure, true);
});

addTest('loadConfig 在启用邮件通知但未配置 from 时失败', async () => {
  await assert.rejects(
    runInTempProject(
      async (tempDir) => {
        const config = {
          repo: { path: tempDir },
          model: { provider: 'openai', options: { apiKey: 'test-key', model: 'gpt-4o-mini' } },
          notifications: { email: { enabled: true, smtp: { host: 'smtp.example.com', port: 465 } } },
          schedule: { intervalMinutes: 5 }
        };
        fs.writeFileSync(path.join(tempDir, 'config', 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
      },
      async () => loadConfig()
    ),
    /notifications\.email\.from/
  );
});

addTest('parseDailyToCron 转换 HH:mm', async () => {
  assert.equal(parseDailyToCron('09:30'), '30 09 * * *');
});

addTest('scheduleJobs 跳过重叠 interval 执行', async () => {
  const handlers = [];
  let releaseRun;
  let callCount = 0;
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    scheduleJobs({
      config: { schedule: { intervalMinutes: 5 } },
      onTick: () => {
        callCount += 1;
        if (callCount > 1) return Promise.resolve();
        return new Promise((resolve) => { releaseRun = resolve; });
      },
      schedule: (_expr, handler) => { handlers.push(handler); }
    });

    assert.equal(handlers.length, 1);
    const firstRun = handlers[0]();
    await Promise.resolve();
    await handlers[0]();
    assert.equal(callCount, 1);
    releaseRun();
    await firstRun;
    await handlers[0]();
    assert.equal(callCount, 2);
  } finally {
    console.warn = originalWarn;
  }
});

addTest('filterNewCommits 会过滤已处理 commit', async () => {
  const logs = [{ hash: 'a1' }, { hash: 'b2' }, { hash: 'c3' }];
  const filtered = filterNewCommits(logs, ['b2']);
  assert.deepEqual(filtered.map((item) => item.hash), ['a1', 'c3']);
});

addTest('state-store 兼容旧格式并裁剪 processedHashes', async () => {
  await runInTempProject(async (tempDir) => {
    const stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const stateFile = path.join(stateDir, 'last_run.json');
    fs.writeFileSync(stateFile, JSON.stringify({ lastRun: 1234567890 }, null, 2), 'utf-8');

    const legacyState = readState(stateFile);
    assert.equal(legacyState.lastRun, 1234567890);
    assert.deepEqual(legacyState.processedHashes, []);

    const hashes = Array.from({ length: 205 }, (_, index) => `hash-${index}`);
    writeState(stateFile, { lastRun: 42, processedHashes: hashes });

    const nextState = readState(stateFile);
    assert.equal(nextState.lastRun, 42);
    assert.equal(nextState.processedHashes.length, 200);
    assert.equal(nextState.processedHashes[0], 'hash-5');
    assert.equal(nextState.processedHashes.at(-1), 'hash-204');
  }, async () => {});
});

addTest('mergeProcessedHashes 会合并去重并保留最新 200 条', async () => {
  const merged = mergeProcessedHashes(['a1', 'b2'], ['b2', 'c3'], Array.from({ length: 201 }, (_, index) => `h-${index}`));
  assert.equal(merged.length, 200);
  assert.equal(merged[0], 'h-1');
  assert.equal(merged.at(-1), 'h-200');
});

addTest('globToRegex 支持常见 glob 模式', async () => {
  assert.equal(globToRegex('src/**/*.js').test('src/modules/a.js'), true);
  assert.equal(globToRegex('src/**/*.js').test('src/modules/a.ts'), false);
  assert.equal(globToRegex('docs/??.md').test('docs/ab.md'), true);
  assert.equal(globToRegex('docs/??.md').test('docs/abc.md'), false);
});

addTest('filterDiffByPaths 按 include 和 exclude 过滤 diff 块', async () => {
  const diff = [
    'diff --git a/src/a.js b/src/a.js',
    '@@ -1,1 +1,1 @@',
    '+const a = 1;',
    'diff --git a/docs/readme.md b/docs/readme.md',
    '@@ -1,1 +1,1 @@',
    '+hello',
    'diff --git a/src/skip.test.js b/src/skip.test.js',
    '@@ -1,1 +1,1 @@',
    '+test'
  ].join('\n');

  const filtered = filterDiffByPaths(diff, ['src/*.js'], ['src/*.test.js']);
  assert.equal(filtered.includes('b/src/a.js'), true);
  assert.equal(filtered.includes('b/docs/readme.md'), false);
  assert.equal(filtered.includes('b/src/skip.test.js'), false);
});

addTest('extractSnippets 按 hunk 提取并限制数量与行数', async () => {
  const diff = [
    '@@ -1,2 +1,3 @@', ' line1', '+line2', '-line3',
    '@@ -10,2 +10,3 @@', ' line10', '+line11', '+line12',
    '@@ -20,2 +20,3 @@', '+line20'
  ].join('\n');

  const snippets = extractSnippets(diff, 2, 3);
  assert.equal(snippets.length, 2);
  assert.equal(snippets[0], ['@@ -1,2 +1,3 @@', ' line1', '+line2'].join('\n'));
  assert.equal(snippets[1], ['@@ -10,2 +10,3 @@', ' line10', '+line11'].join('\n'));
});

addTest('mdToHtml 转换基础 Markdown 结构', async () => {
  const html = mdToHtml('### 标题\n- 条目\n`code`');
  assert.equal(html.includes('<h3'), true);
  assert.equal(html.includes('- 条目'), true);
  assert.equal(html.includes('<code'), true);
});

addTest('buildSmtpTransportOptions 默认不做隐式 TLS 推断', async () => {
  const options = buildSmtpTransportOptions({ host: 'smtp.example.com', port: 465 });
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, false);
});

addTest('buildSmtpTransportOptions 严格使用显式 requireTLS 配置', async () => {
  const options = buildSmtpTransportOptions({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    requireTLS: true
  });
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
});

addTest('normalizeReviewOutput 解析合法 JSON 结果', async () => {
  const raw = JSON.stringify({
    summary: '发现 1 个问题',
    issues: [{ severity: 'high', file: 'src/index.js', line: 12, issue: '异常未分类', suggestion: '引入统一错误类型' }]
  });

  const normalized = normalizeReviewOutput(raw);
  assert.equal(normalized.parseMode, 'json');
  assert.equal(normalized.structuredReview.issues.length, 1);
  assert.equal(normalized.structuredReview.issues[0].file, 'src/index.js');
  assert.equal(normalized.reviewText.includes('问题列表'), true);
});

addTest('normalizeReviewOutput 在非 JSON 输出时降级', async () => {
  const normalized = normalizeReviewOutput('这里是普通文本输出');
  assert.equal(normalized.parseMode, 'fallback');
  assert.equal(normalized.reviewText, '这里是普通文本输出');
  assert.equal(normalized.structuredReview.issues.length, 0);
});

addTest('buildMessage 在 issues_only 下优先使用结构化结果', async () => {
  const result = {
    commit: { hash: 'abcdef123456', authorName: 'Alice', authorEmail: 'alice@example.com', date: '2026-04-07T10:00:00Z', message: 'fix: improve retry' },
    reviewText: '原始文本',
    structuredReview: {
      summary: '发现问题',
      issues: [{ severity: 'medium', file: 'src/retry.js', line: 8, issue: '缺少上限', suggestion: '增加最大重试次数' }]
    },
    snippets: ['@@ -1 +1 @@\n+retry();']
  };
  const config = { notifications: { reportStyle: 'issues_only' } };

  const message = buildMessage(result, config, 'markdown');
  assert.equal(message.includes('src/retry.js:8'), true);
  assert.equal(message.includes('增加最大重试次数'), true);
});

addTest('shouldSkipNotification 覆盖主要跳过条件', async () => {
  const skipped = shouldSkipNotification({ skipped: true, commit: { hash: 'a1' } }, { notifications: {} });
  assert.equal(skipped.skip, true);

  const noSnippets = shouldSkipNotification({ snippets: [], usedDiffEmpty: false, commit: { hash: 'b2' } }, { notifications: { skipWhenNoSnippets: true } });
  assert.equal(noSnippets.skip, true);

  const allowed = shouldSkipNotification({ snippets: ['@@ -1 +1 @@\n+line'], usedDiffEmpty: false, commit: { hash: 'c3' } }, { notifications: { skipWhenNoSnippets: true } });
  assert.equal(allowed.skip, false);
});

addTest('auditInfo 会写入 JSONL 审计日志', async () => {
  await runInTempProject(async () => {}, async (tempDir) => {
    auditInfo({ audit: { dir: path.join(tempDir, 'audit') } }, 'run_completed', { count: 2 });
    const logPath = path.join(tempDir, 'audit', 'audit.log');
    const content = fs.readFileSync(logPath, 'utf8').trim();
    const entry = JSON.parse(content);
    assert.equal(entry.event, 'run_completed');
    assert.equal(entry.details.count, 2);
    assert.equal(entry.level, 'info');
  });
});

addTest('retryAsync 会在失败后重试成功', async () => {
  let attempts = 0;
  const result = await retryAsync(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('retry');
    return 'ok';
  }, { retries: 3, delayMs: 0 });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

addTest('summarizeReviewResults 统计核心指标', async () => {
  const summary = summarizeReviewResults([
    { skipped: true, parseMode: 'skipped', structuredReview: { issues: [] } },
    { skipped: false, parseMode: 'json', structuredReview: { issues: [{}, {}] } },
    { skipped: false, parseMode: 'fallback', structuredReview: { issues: [] } }
  ]);

  assert.deepEqual(summary, { commitCount: 3, skippedCount: 1, fallbackCount: 1, structuredCount: 1, issueCount: 2 });
});

addTest('notifyResults 返回跳过统计', async () => {
  const stats = await notifyResults({
    config: { notifications: { skipWhenNoSnippets: true } },
    results: [{ skipped: true, commit: { hash: 'a1', authorEmail: 'a@example.com', authorName: 'A' } }]
  });

  assert.equal(stats.skipped, 1);
  assert.equal(stats.emailSuccess, 0);
  assert.equal(stats.larkSuccess, 0);
});

addTest('writeReviewResults 会写 latest-results 和 results.jsonl', async () => {
  await runInTempProject(async () => {}, async (tempDir) => {
    const output = writeReviewResults({ results: { dir: path.join(tempDir, 'results') } }, {
      summary: { commitCount: 1 },
      notificationSummary: { emailSuccess: 1 },
      results: [{
        commit: { hash: 'abc123', date: '2026-04-07T10:00:00Z', message: 'feat: add retry', authorName: 'Alice', authorEmail: 'alice@example.com' },
        skipped: false,
        parseMode: 'json',
        reviewText: '发现问题',
        structuredReview: { summary: '发现问题', issues: [{ severity: 'low', file: 'src/a.js', line: 3, issue: '日志不足', suggestion: '补日志' }] },
        snippets: ['@@ -1 +1 @@\n+line']
      }]
    });

    const latest = JSON.parse(fs.readFileSync(output.latestFile, 'utf8'));
    const lines = fs.readFileSync(output.appendFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(output.count, 1);
    assert.equal(latest.summary.commitCount, 1);
    assert.equal(latest.results.length, 1);
    assert.equal(lines[0].result.structuredReview.issues[0].file, 'src/a.js');
  });
});

addTest('queryReviewResults 支持按 severity 和 author 过滤', async () => {
  await runInTempProject(async () => {}, async (tempDir) => {
    writeReviewResults({ results: { dir: path.join(tempDir, 'results') } }, {
      summary: { commitCount: 2 },
      notificationSummary: {},
      results: [
        {
          commit: { hash: 'abc123', date: '2026-04-07T10:00:00Z', message: 'feat: add retry', authorName: 'Alice', authorEmail: 'alice@example.com' },
          skipped: false,
          parseMode: 'json',
          reviewText: '发现问题',
          structuredReview: { summary: '发现问题', issues: [{ severity: 'high', file: 'src/a.js', line: 3, issue: '日志不足', suggestion: '补日志' }] },
          snippets: []
        },
        {
          commit: { hash: 'def456', date: '2026-04-07T11:00:00Z', message: 'fix: cleanup', authorName: 'Bob', authorEmail: 'bob@example.com' },
          skipped: false,
          parseMode: 'json',
          reviewText: '发现问题',
          structuredReview: { summary: '发现问题', issues: [{ severity: 'low', file: 'src/b.js', line: 5, issue: '注释不足', suggestion: '补注释' }] },
          snippets: []
        }
      ]
    });

    const bySeverity = queryReviewResults({ resultsDir: path.join(tempDir, 'results'), severity: 'high' });
    assert.equal(bySeverity.count, 1);
    assert.equal(bySeverity.items[0].result.commit.hash, 'abc123');

    const byAuthor = queryReviewResults({ resultsDir: path.join(tempDir, 'results'), author: 'bob' });
    assert.equal(byAuthor.count, 1);
    assert.equal(byAuthor.items[0].result.commit.hash, 'def456');
  });
});

let passed = 0;

for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

console.log(`RESULT ${passed}/${tests.length} passed`);
