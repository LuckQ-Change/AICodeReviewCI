import axios from 'axios';
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from '../prompt.js';
import { ConfigError, ProviderError } from '../../errors.js';

export function createHttpClient(options) {
  const timeout = options.timeout || 30000;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.apiKey) {
    const prefix = options.authHeaderPrefix ?? 'Bearer ';
    headers.Authorization = `${prefix}${options.apiKey}`;
  }

  const payloadFormat = options.payloadFormat || 'native';
  const model = options.model;
  const temperature = options.temperature ?? 0.2;

  const base = String(options.baseURL || '').replace(/\/+$/, '');
  if (!base) {
    throw new ConfigError('HTTP 模型需要配置 options.baseURL');
  }

  const targetURL = payloadFormat === 'openai_chat' ? `${base}/chat/completions` : base;

  function buildPayload({ rulesText, diff, context }) {
    if (payloadFormat === 'openai_chat') {
      if (!model) throw new ConfigError('HTTP(openai_chat) 需要配置 options.model');
      return {
        model,
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: buildReviewPrompt({ rulesText, diff, context }) }
        ],
        temperature,
        response_format: { type: 'json_object' }
      };
    }

    return {
      rules: rulesText,
      diff,
      context
    };
  }

  return {
    async review({ rulesText, diff, context }) {
      try {
        const payload = buildPayload({ rulesText, diff, context });
        const res = await axios.post(targetURL, payload, { headers, timeout });
        if (payloadFormat === 'openai_chat') {
          const data = res.data;
          return data?.choices?.[0]?.message?.content || data?.review || JSON.stringify(data);
        }
        return res.data?.review || JSON.stringify(res.data);
      } catch (error) {
        throw new ProviderError('HTTP provider 调用失败', { cause: error });
      }
    }
  };
}
