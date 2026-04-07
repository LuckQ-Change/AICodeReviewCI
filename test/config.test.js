import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../src/modules/config.js';

async function runInTempProject(setupFn, runFn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicodereviewci-config-'));
  const previousCwd = process.cwd();
  const envBackup = { ...process.env };

  fs.mkdirSync(path.join(tempDir, 'config'), { recursive: true });

  try {
    await setupFn(tempDir);
    process.chdir(tempDir);
    return await runFn(tempDir);
  } finally {
    process.chdir(previousCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('loadConfig parses email secure and port from placeholders', async () => {
  const loaded = await runInTempProject(
    async (tempDir) => {
      const config = {
        repo: { path: tempDir },
        model: {
          provider: 'openai',
          options: {
            apiKey: '${AI_API_KEY}',
            model: '${AI_MODEL}'
          }
        },
        notifications: {
          email: {
            enabled: 'true',
            from: 'bot@example.com',
            smtp: {
              host: 'smtp.example.com',
              port: '${EMAIL_SMTP_PORT}',
              secure: '${EMAIL_SECURE}'
            }
          }
        },
        schedule: {
          intervalMinutes: 5
        }
      };

      fs.writeFileSync(
        path.join(tempDir, 'config', 'config.json'),
        JSON.stringify(config, null, 2),
        'utf-8'
      );

      process.env.AI_API_KEY = 'test-key';
      process.env.AI_MODEL = 'gpt-4o-mini';
      process.env.EMAIL_SMTP_PORT = '465';
      process.env.EMAIL_SECURE = 'true';
    },
    async () => loadConfig()
  );

  assert.equal(loaded.notifications.email.smtp.port, 465);
  assert.equal(loaded.notifications.email.smtp.secure, true);
});

test('loadConfig validates enabled email configuration', async () => {
  await assert.rejects(
    runInTempProject(
      async (tempDir) => {
        const config = {
          repo: { path: tempDir },
          model: {
            provider: 'openai',
            options: {
              apiKey: 'test-key',
              model: 'gpt-4o-mini'
            }
          },
          notifications: {
            email: {
              enabled: true,
              smtp: {
                host: 'smtp.example.com',
                port: 465
              }
            }
          },
          schedule: {
            intervalMinutes: 5
          }
        };

        fs.writeFileSync(
          path.join(tempDir, 'config', 'config.json'),
          JSON.stringify(config, null, 2),
          'utf-8'
        );
      },
      async () => loadConfig()
    ),
    /notifications\.email\.from/
  );
});
