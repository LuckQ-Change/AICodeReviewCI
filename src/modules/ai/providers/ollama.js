import axios from 'axios';

export function createOllamaClient(options) {
  const endpoint = options.endpoint || 'http://localhost:11434/api/generate';
  const model = options.model || 'qwen2.5-coder:latest';
  return {
    async review({ rulesText, diff, context }) {
      const prompt = [
        '你是资深代码审查助手，请依据以下规则与提交差异给出问题点和优化方案。',
        '【规则】',
        rulesText,
        '【提交上下文】',
        `作者: ${context.authorName} <${context.authorEmail}>`,
        `提交信息: ${context.message}`,
        '【差异】',
        diff,
        '请输出：问题列表与优化建议（中文，简明）。'
      ].join('\n');

      const res = await axios.post(endpoint, { model, prompt, stream: false });
      return res.data?.response || '';
    }
  };
}