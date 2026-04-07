import OpenAI from 'openai';
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from '../prompt.js';
import { ProviderError } from '../../errors.js';

export function createOpenAIClient(options) {
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  const model = options.model || 'gpt-4o-mini';

  return {
    async review({ rulesText, diff, context }) {
      try {
        const res = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: REVIEW_SYSTEM_PROMPT },
            { role: 'user', content: buildReviewPrompt({ rulesText, diff, context }) }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });
        return res.choices?.[0]?.message?.content || '';
      } catch (error) {
        throw new ProviderError('OpenAI provider 调用失败', { cause: error });
      }
    }
  };
}
