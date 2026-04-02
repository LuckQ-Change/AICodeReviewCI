import cron from 'node-cron';

function parseDailyToCron(dailyTime) {
  // HH:mm -> m H * * *
  const [HH, mm] = dailyTime.split(':');
  return `${mm} ${HH} * * *`;
}

export function scheduleJobs({ config, onTick }) {
  const now = Date.now();
  let since = now;

  // intervalMinutes
  if (config.schedule?.intervalMinutes) {
    const m = config.schedule.intervalMinutes;
    const cronExp = `*/${m} * * * *`;
    cron.schedule(cronExp, async () => {
      try {
        await onTick(since);
        since = Date.now();
      } catch (e) {
        console.error('[调度器] interval 任务失败', e);
      }
    });
    console.log(`[调度器] 已注册每${m}分钟运行一次`);
  }

  // dailyTime
  if (config.schedule?.dailyTime) {
    const cronExp = parseDailyToCron(config.schedule.dailyTime);
    cron.schedule(cronExp, async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        await onTick(todayStart.getTime());
      } catch (e) {
        console.error('[调度器] 每日任务失败', e);
      }
    });
    console.log(`[调度器] 已注册每日 ${config.schedule.dailyTime} 运行，审核当天到此时间点的提交`);
  }

  // custom cron
  if (config.schedule?.cron) {
    const cronExp = config.schedule.cron;
    cron.schedule(cronExp, async () => {
      try {
        await onTick(since);
        since = Date.now();
      } catch (e) {
        console.error('[调度器] cron任务失败', e);
      }
    });
    console.log(`[调度器] 已注册cron表达式: ${cronExp}`);
  }
}