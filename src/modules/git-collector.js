import simpleGit from 'simple-git';
import path from 'path';

export async function collectCommitsSince(config, sinceTimestamp) {
  const repoPath = config.repo?.path;
  if (!repoPath) throw new Error('未配置repo.path');
  const git = simpleGit({ baseDir: repoPath });

  const sinceIso = new Date(sinceTimestamp).toISOString();
  // 使用正确的git参数键，确保生成 --since=<ISO>
  const logs = await git.log({ '--since': sinceIso });

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