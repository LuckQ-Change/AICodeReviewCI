export async function retryAsync(task, options = {}) {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 200;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error, attempt)) {
        throw error;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
