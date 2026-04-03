import simpleGit from 'simple-git';
import path from 'path';

export async function collectCommitsSince(config, sinceTimestamp) {
  const repoPath = config.repo?.path;
  if (!repoPath) throw new Error('未配置repo.path');
  const git = simpleGit({ baseDir: repoPath });

  // 在抓取日志前尝试同步远程更新（解决“抓不到最新提交”的问题）
  try {
    console.log(`[git] 正在同步远程仓库: ${repoPath}`);
    await git.fetch(['--all']);
  } catch (err) {
    console.warn(`[git] fetch 失败（可能未配置远程仓库或网络原因），将仅基于本地日志继续：${err.message}`);
  }

  // 增加 1 分钟的回溯容错，防止因为精度或程序运行耗时导致的提交遗漏
  const safeSinceTimestamp = sinceTimestamp - 60 * 1000;
  const sinceIso = new Date(safeSinceTimestamp).toISOString();

  let logs = await git.log(['--since=' + sinceIso, '--all']);
  

  
  console.log(`[git] 抓取完成，最终找到 ${logs.all.length} 条记录。`);

  const commits = [];
  for (const l of logs.all) {
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
}