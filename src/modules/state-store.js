import fs from 'fs';

const DEFAULT_STATE = {
  lastRun: undefined,
  processedHashes: []
};

export function mergeProcessedHashes(...hashGroups) {
  return [...new Set(
    hashGroups
      .flat()
      .filter((hash) => typeof hash === 'string' && hash.trim() !== '')
  )].slice(-200);
}

export function readState(stateFile) {
  if (!fs.existsSync(stateFile)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    return {
      lastRun: Number.isFinite(data?.lastRun) ? data.lastRun : undefined,
      processedHashes: Array.isArray(data?.processedHashes)
        ? data.processedHashes.filter((hash) => typeof hash === 'string' && hash.trim() !== '')
        : []
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeState(stateFile, state) {
  const normalized = {
    lastRun: Number.isFinite(state?.lastRun) ? state.lastRun : Date.now(),
    processedHashes: mergeProcessedHashes(state?.processedHashes || [])
  };

  fs.writeFileSync(stateFile, JSON.stringify(normalized, null, 2), 'utf-8');
}
