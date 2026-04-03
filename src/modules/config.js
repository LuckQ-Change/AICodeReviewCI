import fs from 'fs';
import path from 'path';

/**
 * 轻量级加载 .env 文件到 process.env
 */
function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();
        // 去除引号
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log('[config] 已从 .env 文件加载环境变量。');
  }
}

/**
 * 递归替换配置对象中的 ${ENV_VAR} 占位符
 */
function replaceEnvPlaceholders(obj) {
  const optionalVars = [
    'LARK_ENABLED', 'LARK_SECRET', 'LARK_WEBHOOK', 'LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_CHAT_ID',
    'WECOM_ENABLED', 'WECOM_WEBHOOK',
    'EMAIL_ENABLED', 'EMAIL_SMTP_HOST', 'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASS', 'EMAIL_FROM',
    'AI_BASE_URL'
  ];
  
  if (typeof obj === 'string') {
    return obj.replace(/\${(\w+)}/g, (_, name) => {
      const val = process.env[name];
      if (val === undefined) {
        // 如果是已知可选的环境变量，不输出警告，直接返回空字符串
        if (optionalVars.includes(name)) {
          return '';
        }
        console.warn(`[config] 环境变量 \${${name}} 未定义，将保留原始占位符。`);
        return `\${${name}}`;
      }
      return val;
    });
  } else if (Array.isArray(obj)) {
    return obj.map(item => replaceEnvPlaceholders(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = replaceEnvPlaceholders(obj[key]);
    }
    return newObj;
  }
  return obj;
}

export async function loadConfig() {
  loadDotEnv();
  const configPath = path.join(process.cwd(), 'config', 'config.json');
  let config = {};

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // 替换占位符
      config = replaceEnvPlaceholders(config);
    } catch (err) {
      console.warn(`[config] 无法解析配置文件: ${configPath}, 将使用环境变量。`, err.message);
    }
  } else {
    console.log('[config] 未发现 config.json，完全依赖环境变量或默认值。');
  }

  // ==========================
  // 环境变量覆盖逻辑
  // ==========================

  const envMapping = {
    'REPO_PATH': 'config.repo.path',
    'AI_PROVIDER': 'config.model.provider',
    'AI_API_KEY': 'config.model.options.apiKey',
    'AI_BASE_URL': 'config.model.options.baseURL',
    'AI_MODEL': 'config.model.options.model',
    'LARK_ENABLED': 'config.notifications.lark.enabled',
    'LARK_WEBHOOK': 'config.notifications.lark.webhook',
    'LARK_SECRET': 'config.notifications.lark.secret',
    'LARK_APP_ID': 'config.notifications.lark.appId',
    'LARK_APP_SECRET': 'config.notifications.lark.appSecret',
    'LARK_CHAT_ID': 'config.notifications.lark.chatId',
    'WECOM_ENABLED': 'config.notifications.wecom.enabled',
    'WECOM_WEBHOOK': 'config.notifications.wecom.webhook',
    'EMAIL_ENABLED': 'config.notifications.email.enabled',
    'EMAIL_FROM': 'config.notifications.email.from',
    'EMAIL_SMTP_HOST': 'config.notifications.email.smtp.host',
    'EMAIL_SMTP_PORT': 'config.notifications.email.smtp.port',
    'EMAIL_SMTP_USER': 'config.notifications.email.smtp.user',
    'EMAIL_SMTP_PASS': 'config.notifications.email.smtp.pass'
  };

  for (const [envKey, configPathStr] of Object.entries(envMapping)) {
    const val = process.env[envKey];
    if (val !== undefined) {
      console.log(`[config] 识别到环境变量: ${envKey}`);
      // 设置值
      const keys = configPathStr.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (key === 'config') continue;
        current[key] = current[key] || {};
        current = current[key];
      }
      const lastKey = keys[keys.length - 1];
      if (envKey.endsWith('_ENABLED')) {
        current[lastKey] = val === 'true';
      } else if (envKey.endsWith('_PORT')) {
        current[lastKey] = parseInt(val, 10);
      } else {
        current[lastKey] = val;
      }
    }
  }

  // ==========================
  // 默认值补充
  // ==========================
  
  // 1. Repo Path 默认为当前目录
  if (!config.repo?.path || config.repo.path === '${REPO_PATH}') {
    config.repo = config.repo || {};
    config.repo.path = process.cwd();
    console.log(`[config] repo.path 未配置，已默认为当前路径: ${config.repo.path}`);
  }

  // 2. AI Provider 默认为 openai
  if (!config.model?.provider || config.model.provider === '${AI_PROVIDER}') {
    config.model = config.model || {};
    config.model.provider = 'openai';
    console.log('[config] model.provider 未配置，已默认为 openai');
  }

  // 3. 清理未替换的占位符（避免 SDK 报错）并确保 boolean 类型正确
  if (config.model?.options) {
    if (config.model.options.baseURL === '${AI_BASE_URL}') delete config.model.options.baseURL;
    if (config.model.options.apiKey === '${AI_API_KEY}') delete config.model.options.apiKey;
    if (config.model.options.model === '${AI_MODEL}') delete config.model.options.model;
  }

  // 确保通知渠道的 enabled 为 boolean
  if (config.notifications) {
    for (const channel of ['lark', 'wecom', 'email']) {
      if (config.notifications[channel] && typeof config.notifications[channel].enabled === 'string') {
        config.notifications[channel].enabled = config.notifications[channel].enabled === 'true';
      }
    }
  }

  return config;
}