import fs from 'fs';
import path from 'path';

export async function loadConfig() {
  const configPath = path.join(process.cwd(), 'config', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`缺少配置文件: ${configPath}。请复制config/config.example.json为config/config.json并填写。`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config;
}