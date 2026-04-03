import fs from 'fs';
import path from 'path';

/**
 * 递归替换配置对象中的 ${ENV_VAR} 占位符
 */
function replaceEnvPlaceholders(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\${(\w+)}/g, (_, name) => process.env[name] || '');
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

  // 1. Repo
  if (process.env.REPO_PATH) {
    config.repo = config.repo || {};
    config.repo.path = process.env.REPO_PATH;
  }

  // 2. AI Model
  if (process.env.AI_PROVIDER) {
    config.model = config.model || {};
    config.model.provider = process.env.AI_PROVIDER;
  }
  if (process.env.AI_API_KEY || process.env.AI_BASE_URL || process.env.AI_MODEL) {
    config.model = config.model || {};
    config.model.options = config.model.options || {};
    if (process.env.AI_API_KEY) config.model.options.apiKey = process.env.AI_API_KEY;
    if (process.env.AI_BASE_URL) config.model.options.baseURL = process.env.AI_BASE_URL;
    if (process.env.AI_MODEL) config.model.options.model = process.env.AI_MODEL;
  }

  // 3. Notifications - Lark
  if (process.env.LARK_ENABLED !== undefined) {
    config.notifications = config.notifications || {};
    config.notifications.lark = config.notifications.lark || {};
    config.notifications.lark.enabled = process.env.LARK_ENABLED === 'true';
  }
  if (process.env.LARK_WEBHOOK || process.env.LARK_SECRET || process.env.LARK_APP_ID || process.env.LARK_APP_SECRET || process.env.LARK_CHAT_ID) {
    config.notifications = config.notifications || {};
    config.notifications.lark = config.notifications.lark || {};
    if (process.env.LARK_WEBHOOK) config.notifications.lark.webhook = process.env.LARK_WEBHOOK;
    if (process.env.LARK_SECRET) config.notifications.lark.secret = process.env.LARK_SECRET;
    if (process.env.LARK_APP_ID) config.notifications.lark.appId = process.env.LARK_APP_ID;
    if (process.env.LARK_APP_SECRET) config.notifications.lark.appSecret = process.env.LARK_APP_SECRET;
    if (process.env.LARK_CHAT_ID) config.notifications.lark.chatId = process.env.LARK_CHAT_ID;
  }

  // 4. Notifications - WeCom
  if (process.env.WECOM_ENABLED !== undefined) {
    config.notifications = config.notifications || {};
    config.notifications.wecom = config.notifications.wecom || {};
    config.notifications.wecom.enabled = process.env.WECOM_ENABLED === 'true';
  }
  if (process.env.WECOM_WEBHOOK) {
    config.notifications = config.notifications || {};
    config.notifications.wecom = config.notifications.wecom || {};
    config.notifications.wecom.webhook = process.env.WECOM_WEBHOOK;
  }

  // 5. Notifications - Email
  if (process.env.EMAIL_ENABLED !== undefined) {
    config.notifications = config.notifications || {};
    config.notifications.email = config.notifications.email || {};
    config.notifications.email.enabled = process.env.EMAIL_ENABLED === 'true';
  }
  if (process.env.EMAIL_FROM) {
    config.notifications = config.notifications || {};
    config.notifications.email = config.notifications.email || {};
    config.notifications.email.from = process.env.EMAIL_FROM;
  }
  if (process.env.EMAIL_SMTP_HOST || process.env.EMAIL_SMTP_PORT || process.env.EMAIL_SMTP_USER || process.env.EMAIL_SMTP_PASS) {
    config.notifications = config.notifications || {};
    config.notifications.email = config.notifications.email || {};
    config.notifications.email.smtp = config.notifications.email.smtp || {};
    if (process.env.EMAIL_SMTP_HOST) config.notifications.email.smtp.host = process.env.EMAIL_SMTP_HOST;
    if (process.env.EMAIL_SMTP_PORT) config.notifications.email.smtp.port = parseInt(process.env.EMAIL_SMTP_PORT, 10);
    if (process.env.EMAIL_SMTP_USER) config.notifications.email.smtp.user = process.env.EMAIL_SMTP_USER;
    if (process.env.EMAIL_SMTP_PASS) config.notifications.email.smtp.pass = process.env.EMAIL_SMTP_PASS;
  }

  return config;
}