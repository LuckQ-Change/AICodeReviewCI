import axios from 'axios';
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from '../prompt.js';
import { ProviderError } from '../../errors.js';

export function createOllamaClient(options) {
  const endpoint = options.endpoint || 'http://localhost:11434/api/generate';
  const model = options.model || 'qwen2.5-coder:latest';

  return {
    async review({ rulesText, diff, context }) {
      try {
        const prompt = [REVIEW_SYSTEM_PROMPT, '', buildReviewPrompt({ rulesText, diff, context })].join('\n');
        const res = await axios.post(endpoint, { model, prompt, stream: false });
        return res.data?.response || '';
      } catch (error) {
        throw new ProviderError('Ollama provider 调用失败', { cause: error });
      }
    }
  };
}
