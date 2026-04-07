import fs from 'fs';
import path from 'path';

function resolveAuditPath(config) {
  const auditDir = config.audit?.dir
    ? (path.isAbsolute(config.audit.dir) ? config.audit.dir : path.join(process.cwd(), config.audit.dir))
    : path.join(process.cwd(), 'state');
  return path.join(auditDir, 'audit.log');
}

export function writeAuditLog(config, entry) {
  const filePath = resolveAuditPath(config);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify({
    ts: new Date().toISOString(),
    ...entry
  })}\n`, 'utf8');
}

export function auditInfo(config, event, details = {}) {
  writeAuditLog(config, { level: 'info', event, details });
}

export function auditError(config, event, error, details = {}) {
  writeAuditLog(config, {
    level: 'error',
    event,
    details: {
      ...details,
      name: error?.name,
      code: error?.code,
      message: error?.message
    }
  });
}
