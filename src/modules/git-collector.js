import simpleGit from 'simple-git';
import { GitCollectorError } from './errors.js';

export function filterNewCommits(logs, processedHashes = []) {
  const seen = new Set(processedHashes);
  return logs.filter((log) => !seen.has(log.hash));
}

export async function collectCommitsSince(config, sinceTimestamp, options = {}) {
  const repoPath = config.repo?.path;
  if (!repoPath) throw new GitCollectorError('未配置 repo.path');

  const git = simpleGit({ baseDir: repoPath });
  const processedHashes = options.processedHashes || [];

  try {
    console.log(`[git] 正在同步远程仓库: ${repoPath}`);
    await git.fetch(['--all']);
  } catch (err) {
    console.warn(`[git] fetch 失败，将继续基于本地日志执行：${err.message}`);
  }

  try {
    const safeSinceTimestamp = sinceTimestamp - 60 * 1000;
    const sinceIso = new Date(safeSinceTimestamp).toISOString();
    const logs = await git.log(['--since=' + sinceIso, '--all']);
    const newLogs = filterNewCommits(logs.all, processedHashes);

    console.log(`[git] 抓取完成，原始记录 ${logs.all.length} 条，去重后 ${newLogs.length} 条。`);

    const commits = [];
    for (const l of newLogs) {
      const diff = await git.show([l.hash]);
      commits.push({
        hash: l.hash,
        date: l.date,
        message: l.message,
        authorName: l.author_name,
        authorEmail: l.author_email,
        diff
      });
    }

    return commits;
  } catch (error) {
    throw new GitCollectorError('读取 Git 提交失败', { cause: error });
  }
}
