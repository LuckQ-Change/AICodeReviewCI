import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import simpleGit from 'simple-git';

function repoHash(repoPath) {
  return crypto.createHash('sha256').update(repoPath).digest('hex').slice(0, 12);
}

function resolveCachePath(config) {
  const repoPath = config.repo?.path || process.cwd();
  const stateDir = path.join(process.cwd(), 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  return path.join(stateDir, `repo-context-${repoHash(repoPath)}.json`);
}

function readPackageSummary(repoPath) {
  const pkgPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { projectName: path.basename(repoPath), dependencies: [], scripts: {} };
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).slice(0, 30);
    const scripts = pkg.scripts || {};
    const scriptEntries = Object.fromEntries(
      Object.entries(scripts).slice(0, 12)
    );
    return {
      projectName: pkg.name || path.basename(repoPath),
      dependencies: deps,
      scripts: scriptEntries
    };
  } catch {
    return { projectName: path.basename(repoPath), dependencies: [], scripts: {} };
  }
}

function readTopLevelDirs(repoPath) {
  try {
    return fs.readdirSync(repoPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .map((d) => d.name)
      .slice(0, 20);
  } catch {
    return [];
  }
}

async function collectModuleHints(repoPath, maxHints = 30) {
  const git = simpleGit({ baseDir: repoPath });
  try {
    const hints = new Set();
    const raw = await git.raw(['log', '-20', '--name-only', '--pretty=format:']);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('commit ')) continue;
      if (/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(trimmed) && trimmed.includes('/')) {
        hints.add(trimmed.replace(/\\/g, '/'));
      }
      if (hints.size >= maxHints) break;
    }
    return [...hints];
  } catch {
    return [];
  }
}

export async function loadOrBuildRepoContext(config) {
  if (config.review?.context?.enabled === false) {
    return null;
  }

  const repoPath = config.repo?.path;
  if (!repoPath) return null;

  const cachePath = resolveCachePath(config);
  const pkgPath = path.join(repoPath, 'package.json');
  const signature = fs.existsSync(pkgPath)
    ? String(fs.statSync(pkgPath).mtimeMs)
    : 'no-package';

  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (cached.signature === signature) {
        return cached;
      }
    } catch {
      // rebuild
    }
  }

  const maxHints = config.review?.context?.maxModuleHints ?? 30;
  const pkg = readPackageSummary(repoPath);
  const context = {
    updatedAt: new Date().toISOString(),
    signature,
    projectName: pkg.projectName,
    dependencies: pkg.dependencies,
    scripts: pkg.scripts,
    topLevelDirs: readTopLevelDirs(repoPath),
    moduleHints: await collectModuleHints(repoPath, maxHints)
  };

  fs.writeFileSync(cachePath, JSON.stringify(context, null, 2), 'utf-8');
  return context;
}

export function formatRepoContextForPrompt(repoContext) {
  if (!repoContext) return '';

  const lines = [
    '## 工程上下文',
    `项目: ${repoContext.projectName}`,
    `顶层目录: ${(repoContext.topLevelDirs || []).join(', ') || '无'}`,
    `主要依赖: ${(repoContext.dependencies || []).slice(0, 15).join(', ') || '无'}`,
    `近期改动模块: ${(repoContext.moduleHints || []).slice(0, 15).join(', ') || '无'}`
  ];
  return lines.join('\n');
}
