import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import simpleGit from 'simple-git';
import { isCodeFile } from './static/diff-parser.js';

const MAX_FILE_BYTES = 512 * 1024; // 单文件超过此大小不读取符号
const MAX_FILES_PER_SYMBOL = 8; // 每个符号最多记录多少个文件
const PROGRESS_EVERY = 200; // 每扫描多少文件输出一次进度

// 语言无关的“定义”启发式：尽量覆盖 Go / C# / C++ / Java / JS/TS / Python 等。
// 只索引函数/方法/类型等“跨文件可共享”的定义；刻意不索引局部变量
// （var/let/const），因为其名字通用、跨文件碰撞高，会误导模型。
const DEFINITION_PATTERNS = [
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/, // Go 函数/方法
  /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/, // JS/TS function
  /\bdef\s+([A-Za-z_][\w]*)\s*\(/, // Python
  /\b(?:class|interface|struct|enum|trait|type|record)\s+([A-Za-z_][\w]*)/, // 多语言类型定义
  /\b(?:public|private|protected|internal|static|virtual|override|async|final)\s+[\w<>\[\],\s.*&:]+?\s+([A-Za-z_][\w]*)\s*\(/ // C#/Java/C++ 方法
];

// 默认忽略的目录段（依赖、构建产物等），无论是否被 git 跟踪都跳过。
const DEFAULT_IGNORE_SEGMENTS = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'out', 'bin', 'obj', 'target',
  'third_party', 'Pods', 'packages', '__pycache__', 'coverage', '.git',
  '.idea', '.vscode', 'cmake-build-debug', 'cmake-build-release'
]);

function isIgnoredPath(relPath, ignoreSegments) {
  return relPath
    .split('/')
    .some((seg) => ignoreSegments.has(seg));
}

function repoHash(repoPath) {
  return crypto.createHash('sha256').update(String(repoPath)).digest('hex').slice(0, 12);
}

function resolveCachePath(config) {
  const repoPath = config.repo?.path || process.cwd();
  const stateDir = path.join(process.cwd(), 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  return path.join(stateDir, `project-index-${repoHash(repoPath)}.json`);
}

export function extractSymbols(content, maxSymbols = 40) {
  if (!content) return [];
  const found = new Set();
  for (const line of String(content).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 400) continue;
    for (const re of DEFINITION_PATTERNS) {
      const m = re.exec(trimmed);
      if (m && m[1]) {
        found.add(m[1]);
        break;
      }
    }
    if (found.size >= maxSymbols) break;
  }
  return [...found];
}

async function listSourceFiles(repoPath, extensions, extraIgnore = []) {
  const ignore = new Set([...DEFAULT_IGNORE_SEGMENTS, ...extraIgnore]);
  const git = simpleGit({ baseDir: repoPath });
  const raw = await git.raw(['ls-files']);
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .filter((f) => isCodeFile(f, extensions))
    .filter((f) => !isIgnoredPath(f, ignore));
}

/**
 * 构建工程索引：源文件清单 + 每文件定义符号 + symbol→files 映射。
 * 供 AI 跨文件判断（如某符号是否在他处定义/释放）。
 */
export async function buildProjectIndex(repoPath, options = {}) {
  const {
    extensions,
    exclude = [],
    maxFiles = 3000,
    maxSymbolsPerFile = 40,
    onProgress
  } = options;

  let files = await listSourceFiles(repoPath, extensions, exclude);
  const truncated = files.length > maxFiles;
  if (truncated) files = files.slice(0, maxFiles);

  const fileEntries = [];
  const symbols = new Map();
  let scanned = 0;

  for (const rel of files) {
    const normalized = rel.replace(/\\/g, '/');
    let content = '';
    try {
      const abs = path.join(repoPath, rel);
      if (fs.statSync(abs).size <= MAX_FILE_BYTES) {
        content = fs.readFileSync(abs, 'utf-8');
      }
    } catch {
      content = '';
    }

    const syms = extractSymbols(content, maxSymbolsPerFile);
    fileEntries.push({ path: normalized, symbols: syms });
    for (const s of syms) {
      let bucket = symbols.get(s);
      if (!bucket) {
        bucket = [];
        symbols.set(s, bucket);
      }
      if (bucket.length < MAX_FILES_PER_SYMBOL && !bucket.includes(normalized)) {
        bucket.push(normalized);
      }
    }

    scanned += 1;
    if (onProgress && (scanned % PROGRESS_EVERY === 0 || scanned === files.length)) {
      onProgress(scanned, files.length);
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    fileCount: fileEntries.length,
    symbolCount: symbols.size,
    truncated,
    files: fileEntries,
    symbols: Object.fromEntries(symbols)
  };
}

async function computeFileSetSignature(repoPath, extensions, exclude) {
  try {
    const files = await listSourceFiles(repoPath, extensions, exclude);
    return crypto.createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0, 16);
  } catch {
    return 'unknown';
  }
}

/**
 * 加载或构建工程索引（首次审核时构建并打印进度，之后命中缓存）。
 * 缓存按“源文件集合签名”失效：新增/删除文件会重建，单纯改内容则复用。
 */
export async function loadOrBuildProjectIndex(config, runtime = {}) {
  if (config.review?.context?.index?.enabled === false) return null;

  const repoPath = config.repo?.path;
  if (!repoPath) return null;

  const extensions = config.review?.codeExtensions;
  const exclude = config.review?.context?.index?.exclude ?? [];
  const cachePath = resolveCachePath(config);
  const signature = await computeFileSetSignature(repoPath, extensions, exclude);

  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (cached.signature === signature) {
        runtime.log?.(`[index] 命中缓存的工程索引（${cached.fileCount} 文件 / ${cached.symbolCount} 符号）`);
        return cached;
      }
    } catch {
      // 落空则重建
    }
  }

  const startedAt = Date.now();
  runtime.log?.(`[index] 首次审核，开始构建工程索引: ${repoPath}`);
  const index = await buildProjectIndex(repoPath, {
    extensions,
    exclude,
    maxFiles: config.review?.context?.index?.maxFiles ?? 3000,
    maxSymbolsPerFile: config.review?.context?.index?.maxSymbolsPerFile ?? 40,
    onProgress: (done, total) => {
      const pct = total ? Math.round((done / total) * 100) : 100;
      runtime.log?.(`[index] 已扫描 ${done}/${total} 文件（${pct}%）...`);
    }
  });

  const payload = { ...index, signature };
  try {
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // 写缓存失败不影响本次使用
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  runtime.log?.(
    `[index] 工程索引构建完成：${index.fileCount} 文件 / ${index.symbolCount} 符号` +
      `${index.truncated ? '（已按 maxFiles 截断）' : ''}，耗时 ${seconds}s`
  );
  return payload;
}

function collectDiffIdentifiers(diffText) {
  const ids = new Set();
  for (const line of String(diffText || '').split(/\r?\n/)) {
    // 只看新增行，去掉前导 +
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const body = line.slice(1);
    const matches = body.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || [];
    for (const m of matches) ids.add(m);
  }
  return ids;
}

/**
 * 针对本次变更，从工程索引中挑出“在其他文件也有定义/出现”的标识符，
 * 生成跨文件线索段落，提示模型这些符号的生命周期/使用可能由他处负责。
 */
export function formatProjectIndexForPrompt(index, options = {}) {
  if (!index || !index.symbols) return '';
  const { diff, maxRefs = 15, maxFilesEach = 5 } = options;

  const lines = [
    '## 工程索引（首次审核已建立，供跨文件判断）',
    `索引规模：${index.fileCount} 文件 / ${index.symbolCount} 符号${index.truncated ? '（已截断）' : ''}`
  ];

  const ids = collectDiffIdentifiers(diff);
  const clues = [];
  for (const id of ids) {
    const files = Object.prototype.hasOwnProperty.call(index.symbols, id) ? index.symbols[id] : null;
    if (files && files.length) {
      clues.push(`- ${id}: ${files.slice(0, maxFilesEach).join(', ')}`);
      if (clues.length >= maxRefs) break;
    }
  }

  if (clues.length) {
    lines.push(
      '与本次变更相关的跨文件符号（这些标识符在以下文件中也有定义/出现，',
      '其生命周期/释放/调用可能由他处负责——缺乏 diff 内确凿证据时，不要据此判定缺陷）：',
      ...clues
    );
  } else {
    lines.push('（本次变更未匹配到跨文件符号线索。）');
  }

  return lines.join('\n');
}
