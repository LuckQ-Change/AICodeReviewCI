import fs from 'fs';
import path from 'path';

/**
 * 轻量加载 .env 文件到 process.env。
 */
function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();

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
 * 递归替换配置对象中的 ${ENV_VAR} 占位符。
 */
function replaceEnvPlaceholders(obj) {
  const optionalVars = [
    'LARK_ENABLED', 'LARK_SECRET', 'LARK_WEBHOOK', 'LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_CHAT_ID',
    'WECOM_ENABLED', 'WECOM_WEBHOOK',
    'EMAIL_ENABLED', 'EMAIL_SMTP_HOST', 'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASS', 'EMAIL_FROM', 'EMAIL_SMTP_PORT', 'EMAIL_SECURE',
    'EMAIL_REQUIRE_TLS', 'EMAIL_IGNORE_TLS', 'EMAIL_TLS_SERVERNAME', 'EMAIL_TLS_REJECT_UNAUTHORIZED',
    'AI_BASE_URL'
  ];

  if (typeof obj === 'string') {
    return obj.replace(/\${(\w+)}/g, (_, name) => {
      const val = process.env[name];
      if (val === undefined) {
        if (optionalVars.includes(name)) {
          return '';
        }
        console.warn(`[config] 环境变量 \${${name}} 未定义，将保留原始占位符。`);
        return `\${${name}}`;
      }
      return val;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => replaceEnvPlaceholders(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = replaceEnvPlaceholders(obj[key]);
    }
    return newObj;
  }

  return obj;
}

function parseBoolean(value, envKey) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;

  throw new Error(`[config] 环境变量 ${envKey} 的布尔值无效: ${value}`);
}

function parseInteger(value, envKey) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return value;

  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`[config] 环境变量 ${envKey} 的整数值无效: ${value}`);
  }
  return parsed;
}

function validateConfig(config) {
  const errors = [];
  const provider = config.model?.provider;
  const repoPath = config.repo?.path;
  const notifications = config.notifications || {};
  const emailCfg = notifications.email || {};

  if (!repoPath) {
    errors.push('repo.path 不能为空');
  } else if (!fs.existsSync(repoPath)) {
    errors.push(`repo.path 不存在: ${repoPath}`);
  }

  if (!provider) {
    errors.push('model.provider 不能为空');
  } else if (!['openai', 'ollama', 'http'].includes(provider)) {
    errors.push(`model.provider 不支持: ${provider}`);
  }

  if (provider === 'openai') {
    if (!config.model?.options?.apiKey) errors.push('openai provider 需要 model.options.apiKey');
    if (!config.model?.options?.model) errors.push('openai provider 需要 model.options.model');
  }

  if (provider === 'ollama') {
    if (!config.model?.options?.model) errors.push('ollama provider 需要 model.options.model');
  }

  if (provider === 'http') {
    if (!config.model?.options?.baseURL) errors.push('http provider 需要 model.options.baseURL');
    if (config.model?.options?.payloadFormat === 'openai_chat' && !config.model?.options?.model) {
      errors.push('http provider 在 openai_chat 模式下需要 model.options.model');
    }
  }

  if (notifications.lark?.enabled) {
    const lark = notifications.lark;
    const hasWebhookMode = Boolean(lark.webhook);
    const hasOpenIdMapping = Object.keys(config.mention_map?.email_to_lark_open_id || {}).length > 0;
    const hasAppMode = Boolean(lark.appId && lark.appSecret && (lark.chatId || hasOpenIdMapping));
    if (!hasWebhookMode && !hasAppMode) {
      errors.push('启用飞书通知时，至少需要配置 webhook，或配置 appId/appSecret + chatId/openId 映射');
    }
  }

  if (notifications.wecom?.enabled && !notifications.wecom.webhook) {
    errors.push('启用企业微信通知时必须配置 webhook');
  }

  if (emailCfg.enabled) {
    if (!emailCfg.from) errors.push('启用邮件通知时必须配置 notifications.email.from');
    if (!emailCfg.smtp?.host) errors.push('启用邮件通知时必须配置 notifications.email.smtp.host');
    if (!emailCfg.smtp?.port) errors.push('启用邮件通知时必须配置 notifications.email.smtp.port');
  }

  const dailyTime = config.schedule?.dailyTime;
  if (dailyTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) {
    errors.push(`schedule.dailyTime 格式无效: ${dailyTime}，期望 HH:mm`);
  }

  const intervalMinutes = config.schedule?.intervalMinutes;
  if (intervalMinutes !== undefined && (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0)) {
    errors.push(`schedule.intervalMinutes 必须是正整数，当前为: ${intervalMinutes}`);
  }

  if (errors.length > 0) {
    throw new Error(`[config] 配置校验失败:\n- ${errors.join('\n- ')}`);
  }
}

export async function loadConfig() {
  loadDotEnv();
  const configPath = path.join(process.cwd(), 'config', 'config.json');
  let config = {};

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = replaceEnvPlaceholders(config);
    } catch (err) {
      console.warn(`[config] 无法解析配置文件: ${configPath}，将改为使用环境变量。`, err.message);
    }
  } else {
    console.log('[config] 未发现 config.json，将完全依赖环境变量或默认值。');
  }

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
    'EMAIL_SECURE': 'config.notifications.email.smtp.secure',
    'EMAIL_REQUIRE_TLS': 'config.notifications.email.smtp.requireTLS',
    'EMAIL_IGNORE_TLS': 'config.notifications.email.smtp.ignoreTLS',
    'EMAIL_TLS_SERVERNAME': 'config.notifications.email.smtp.tls.servername',
    'EMAIL_TLS_REJECT_UNAUTHORIZED': 'config.notifications.email.smtp.tls.rejectUnauthorized',
    'EMAIL_SMTP_USER': 'config.notifications.email.smtp.user',
    'EMAIL_SMTP_PASS': 'config.notifications.email.smtp.pass'
  };

  for (const [envKey, configPathStr] of Object.entries(envMapping)) {
    const val = process.env[envKey];
    if (val !== undefined) {
      console.log(`[config] 识别到环境变量: ${envKey}`);
      const keys = configPathStr.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (key === 'config') continue;
        current[key] = current[key] || {};
        current = current[key];
      }

      const lastKey = keys[keys.length - 1];
      if (
        envKey.endsWith('_ENABLED') ||
        envKey.endsWith('_SECURE') ||
        envKey === 'EMAIL_REQUIRE_TLS' ||
        envKey === 'EMAIL_IGNORE_TLS' ||
        envKey === 'EMAIL_TLS_REJECT_UNAUTHORIZED'
      ) {
        current[lastKey] = parseBoolean(val, envKey);
      } else if (envKey.endsWith('_PORT')) {
        current[lastKey] = parseInteger(val, envKey);
      } else {
        current[lastKey] = val;
      }
    }
  }

  if (!config.repo?.path || config.repo.path === '${REPO_PATH}') {
    config.repo = config.repo || {};
    config.repo.path = process.cwd();
    console.log(`[config] repo.path 未配置，默认使用当前路径: ${config.repo.path}`);
  }

  if (!config.model?.provider || config.model.provider === '${AI_PROVIDER}') {
    config.model = config.model || {};
    config.model.provider = 'openai';
    console.log('[config] model.provider 未配置，默认使用 openai');
  }

  if (config.model?.options) {
    if (config.model.options.baseURL === '${AI_BASE_URL}') delete config.model.options.baseURL;
    if (config.model.options.apiKey === '${AI_API_KEY}') delete config.model.options.apiKey;
    if (config.model.options.model === '${AI_MODEL}') delete config.model.options.model;
  }

  if (config.notifications) {
    for (const channel of ['lark', 'wecom', 'email']) {
      if (config.notifications[channel] && typeof config.notifications[channel].enabled === 'string') {
        config.notifications[channel].enabled = parseBoolean(
          config.notifications[channel].enabled,
          `${channel.toUpperCase()}_ENABLED`
        );
      }
    }
  }

  if (typeof config.notifications?.email?.smtp?.secure === 'string') {
    config.notifications.email.smtp.secure = parseBoolean(config.notifications.email.smtp.secure, 'EMAIL_SECURE');
  }

  if (typeof config.notifications?.email?.smtp?.requireTLS === 'string') {
    config.notifications.email.smtp.requireTLS = parseBoolean(config.notifications.email.smtp.requireTLS, 'EMAIL_REQUIRE_TLS');
  }

  if (typeof config.notifications?.email?.smtp?.ignoreTLS === 'string') {
    config.notifications.email.smtp.ignoreTLS = parseBoolean(config.notifications.email.smtp.ignoreTLS, 'EMAIL_IGNORE_TLS');
  }

  if (typeof config.notifications?.email?.smtp?.tls?.rejectUnauthorized === 'string') {
    config.notifications.email.smtp.tls.rejectUnauthorized = parseBoolean(
      config.notifications.email.smtp.tls.rejectUnauthorized,
      'EMAIL_TLS_REJECT_UNAUTHORIZED'
    );
  }

  if (typeof config.notifications?.email?.smtp?.port === 'string') {
    config.notifications.email.smtp.port = parseInteger(config.notifications.email.smtp.port, 'EMAIL_SMTP_PORT');
  }

  validateConfig(config);

  return config;
}
