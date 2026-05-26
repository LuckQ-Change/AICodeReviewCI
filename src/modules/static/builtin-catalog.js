import { checkSecretsInLogs } from './rules/secrets-in-logs.js';
import { checkNullSafety } from './rules/null-safety.js';
import { checkResourceCleanup } from './rules/resource-cleanup.js';

const CHECK_HANDLERS = {
  'secrets-in-logs': (fileEntry, hunkText) => checkSecretsInLogs(fileEntry),
  'null-safety': (fileEntry, hunkText) => checkNullSafety(fileEntry, hunkText),
  'resource-cleanup': (fileEntry, hunkText) => checkResourceCleanup(fileEntry, hunkText)
};

export const BUILTIN_CHECK_IDS = Object.keys(CHECK_HANDLERS);

export function runCheck(checkId, fileEntry, hunkText) {
  const handler = CHECK_HANDLERS[checkId];
  if (!handler) return [];
  return handler(fileEntry, hunkText);
}
