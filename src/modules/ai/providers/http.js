import axios from 'axios';

export function createHttpClient(options) {
  // 可选：超时与自定义请求头；支持Bearer令牌或自定义认证头
  const timeout = options.timeout || 30000;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.apiKey) {
    const prefix = options.authHeaderPrefix ?? 'Bearer ';
    headers['Authorization'] = `${prefix}${options.apiKey}`;
  }

  // 负载格式：默认使用项目自有的 {rules, diff, context}
  // 也支持 OpenAI 兼容的 chat/completions（方便直连第三方 OpenAI 风格接口，如混元）
  const payloadFormat = options.payloadFormat || 'native'; // 'native' | 'openai_chat'
  const model = options.model; // openai_chat 需要
  const temperature = options.temperature ?? 0.2;

  // 目标URL：基于 baseURL 生成
  const base = String(options.baseURL || '').replace(/\/+$/, '');
  if (!base) {
    throw new Error('HTTP模型需要配置options.baseURL');
  }
  const targetURL = payloadFormat === 'openai_chat'
    ? `${base}/chat/completions`
    : base;

  function buildPayload({ rulesText, diff, context }) {
    if (payloadFormat === 'openai_chat') {
      if (!model) throw new Error('HTTP(openai_chat) 需要配置 options.model');
      const prompt = [
        '你是资深代码审查助手，请依据以下规则与提交差异给出问题点和优化方案。',
        '',
        '【规则】',
        rulesText,
        '',
        '【提交上下文】',
        `作者: ${context.authorName} <${context.authorEmail}>`,
        `提交信息: ${context.message}`,
        '',
        '【差异】',
        diff,
        '',
        '指出是那个文件中的哪个代码片段，且优化建议也是用代码片段表示',
      ].join('\n');
      return {
        model,
        messages: [
          { role: 'system', content: '你严格遵循给定规则进行代码审查，输出中文要点。' },
          { role: 'user', content: prompt }
        ],
        temperature
      };
    }
    // 默认 native 格式
    return {
      rules: rulesText,
      diff,
      context
    };
  }

  return {
    async review({ rulesText, diff, context }) {
      const payload = buildPayload({ rulesText, diff, context });
      const res = await axios.post(targetURL, payload, { headers, timeout });
      // 解析返回
      if (payloadFormat === 'openai_chat') {
        const data = res.data;
        return data?.choices?.[0]?.message?.content || data?.review || JSON.stringify(data);
      }
      // native：约定返回 { review: "文本" }
      return res.data?.review || JSON.stringify(res.data);
    }
  };
}