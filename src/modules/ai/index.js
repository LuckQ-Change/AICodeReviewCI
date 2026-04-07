import { createOpenAIClient } from './providers/openai.js';
import { createOllamaClient } from './providers/ollama.js';
import { createHttpClient } from './providers/http.js';
import { ConfigError } from '../errors.js';

export async function createModelClient(config) {
  const provider = config.model?.provider;
  const options = config.model?.options || {};

  if (!provider) throw new ConfigError('未配置 model.provider');

  switch (provider) {
    case 'openai':
      return createOpenAIClient(options);
    case 'ollama':
      return createOllamaClient(options);
    case 'http':
      return createHttpClient(options);
    default:
      throw new ConfigError(`不支持的模型 provider: ${provider}`);
  }
}
