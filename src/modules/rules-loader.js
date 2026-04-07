import fs from 'fs';
import path from 'path';

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
  const contents = files.map((f) => fs.readFileSync(path.join(rulesDir, f), 'utf-8'));
  const combined = contents.join('\n\n');
  return { text: combined, files };
}
