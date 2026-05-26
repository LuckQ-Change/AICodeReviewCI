import simpleGit from 'simple-git';
import { GitCollectorError } from './errors.js';

export function filterNewCommits(logs, processedHashes = []) {
  const seen = new Set(processedHashes);
  return logs.filter((log) => !seen.has(log.hash));
}

async function resolveCurrentBranch(git) {
  try {
    const name = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    return name && name !== 'HEAD' ? name : null;
  } catch {
    return null;
  }
}

async function resolveUpstream(git, branch) {
  try {
    const up = (await git.revparse(['--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`])).trim();
    return up || null;
  } catch {
    return null;
  }
}

async function refExists(git, ref) {
  try {
    await git.revparse(['--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析待抓取的提交范围 ref：
 * - 默认自动取目标仓库当前所在分支（可用 config.repo.branch 覆盖）；
 * - 一并纳入该分支的远程跟踪分支（如 origin/<branch>），以便捕获已推送但本地未合并的提交；
 * - detached HEAD 且未显式配置分支时回退到当前 HEAD。
 *
 * 说明：不能用 git log --branches=<name>（其会被当作 glob 并隐式补 /*，匹配不到分支本身），
 * 因此这里把分支名作为 revision 位置参数传入。
 */
export async function resolveLogRefs(git, config = {}) {
  const configured = config.repo?.branch;
  const branch = configured || (await resolveCurrentBranch(git));
  if (!branch) return { branch: null, refs: [] };

  const refs = [];
  if (await refExists(git, branch)) refs.push(branch);

  const upstream = await resolveUpstream(git, branch);
  if (upstream && upstream !== branch && (await refExists(git, upstream))) {
    refs.push(upstream);
  }

  // 本地不存在该分支（如仅配置了远程分支名）时，回退到 origin/<branch>
  if (!refs.length && (await refExists(git, `origin/${branch}`))) {
    refs.push(`origin/${branch}`);
  }

  return { branch, refs };
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

    const { branch, refs } = await resolveLogRefs(git, config);
    if (branch) {
      console.log(
        `[git] 抓取分支 ${branch}${refs.length > 1 ? '（含远程跟踪分支）' : ''}` +
          `，since=${sinceIso}（本地 ${new Date(safeSinceTimestamp).toLocaleString()}）`
      );
    } else {
      console.log(
        `[git] 未检测到具名分支（detached HEAD），按当前 HEAD 抓取，since=${sinceIso}`
      );
    }

    const logs = await git.log([`--since=${sinceIso}`, ...refs]);
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
