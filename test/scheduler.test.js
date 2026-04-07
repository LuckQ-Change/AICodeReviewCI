import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDailyToCron, scheduleJobs } from '../src/modules/scheduler.js';

test('parseDailyToCron converts HH:mm to cron expression', () => {
  assert.equal(parseDailyToCron('09:30'), '30 09 * * *');
});

test('scheduleJobs skips overlapping interval executions', async () => {
  const handlers = [];
  let releaseRun;
  let callCount = 0;

  scheduleJobs({
    config: {
      schedule: {
        intervalMinutes: 5
      }
    },
    onTick: () => {
      callCount += 1;
      return new Promise((resolve) => {
        releaseRun = resolve;
      });
    },
    schedule: (_expr, handler) => {
      handlers.push(handler);
    }
  });

  assert.equal(handlers.length, 1);

  const firstRun = handlers[0]();
  await Promise.resolve();
  await handlers[0]();
  assert.equal(callCount, 1);

  releaseRun();
  await firstRun;

  await handlers[0]();
  assert.equal(callCount, 2);
});
