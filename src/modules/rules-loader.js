import fs from 'fs';
import path from 'path';
import { BUILTIN_CHECK_IDS } from './static/builtin-catalog.js';

function parseFrontmatter(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // list start
    if (line === 'checks:') {
      meta.checks = [];
      meta._currentList = 'checks';
      continue;
    }

    // list item
    const listItem = /^-\s+(.+)$/.exec(line);
    if (listItem && meta._currentList) {
      meta[meta._currentList].push(listItem[1].trim());
      continue;
    }

    // key-value
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) {
      meta[kv[1]] = kv[2].trim();
      meta._currentList = undefined;
    }
  }
  delete meta._currentList;

  return { meta, body: match[2] };
}

function normalizeChecks(checks) {
  if (!Array.isArray(checks)) return [];
  return checks.filter((id) => BUILTIN_CHECK_IDS.includes(id));
}

export async function loadRules(config) {
  const configured = config.rules?.dir;
  const rulesDir = configured
    ? (path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured))
    : path.join(process.cwd(), 'rules');

  if (!fs.existsSync(rulesDir)) {
    console.warn(`[rules] 规则目录不存在，将创建: ${rulesDir}`);
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md'));
  const builtinChecks = new Set();
  const aiParts = [];
  const builtinFiles = [];
  const aiFiles = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const reviewType = (meta.review || 'ai').toLowerCase();

    if (reviewType === 'builtin') {
      builtinFiles.push(file);
      for (const id of normalizeChecks(meta.checks)) {
        builtinChecks.add(id);
      }
    } else {
      const trimmed = body.trim();
      if (trimmed) {
        aiParts.push(`<!-- ${file} -->\n${trimmed}`);
        aiFiles.push(file);
      }
    }
  }

  const checks = [...builtinChecks];
  const aiText = aiParts.join('\n\n');
  const needsAiReview = aiText.length > 0;

  // 兼容：无 frontmatter 的旧规则文件整体作为 ai 规则
  const legacyText = files.length > 0 && !needsAiReview && checks.length === 0
    ? files.map((f) => fs.readFileSync(path.join(rulesDir, f), 'utf-8')).join('\n\n').trim()
    : '';

  const finalAiText = needsAiReview ? aiText : legacyText;
  const finalNeedsAi = finalAiText.length > 0;

  return {
    text: finalAiText,
    ai: { text: finalAiText, files: finalNeedsAi ? (aiFiles.length ? aiFiles : files) : [] },
    builtin: { checks, files: builtinFiles },
    needsAiReview: finalNeedsAi,
    files
  };
}
