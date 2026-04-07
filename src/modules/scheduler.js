import cron from 'node-cron';

export function parseDailyToCron(dailyTime) {
  const [HH, mm] = dailyTime.split(':');
  return `${mm} ${HH} * * *`;
}

export function scheduleJobs({ config, onTick, schedule = cron.schedule }) {
  const now = Date.now();
  let since = now;
  let running = false;

  async function runJob(jobName, nextSince) {
    if (running) {
      console.warn(`[scheduler] 跳过 ${jobName} 任务：上一轮执行尚未结束。`);
      return;
    }

    running = true;
    try {
      await onTick(nextSince);
      since = Date.now();
    } catch (e) {
      console.error(`[scheduler] ${jobName} 任务执行失败`, e);
    } finally {
      running = false;
    }
  }

  if (config.schedule?.intervalMinutes) {
    const m = config.schedule.intervalMinutes;
    const cronExp = `*/${m} * * * *`;
    schedule(cronExp, async () => {
      await runJob('interval', since);
    });
    console.log(`[scheduler] 已注册每 ${m} 分钟执行一次。`);
  }

  if (config.schedule?.dailyTime) {
    const cronExp = parseDailyToCron(config.schedule.dailyTime);
    schedule(cronExp, async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      await runJob('daily', todayStart.getTime());
    });
    console.log(`[scheduler] 已注册每日 ${config.schedule.dailyTime} 执行，审查当天提交。`);
  }

  if (config.schedule?.cron) {
    const cronExp = config.schedule.cron;
    schedule(cronExp, async () => {
      await runJob('cron', since);
    });
    console.log(`[scheduler] 已注册 cron 表达式: ${cronExp}`);
  }
}
