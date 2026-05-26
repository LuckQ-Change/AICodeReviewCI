/**
 * 计算 Git 提交抓取的起始时间。
 * 仅用于 git log --since，不读取 state.lastRun（那是应用运行时间，不是提交时间）。
 */
export function resolveReviewSince({
  now = Date.now(),
  reviewSince,
  reviewMode,
  intervalMinutes = 60
}) {
  if (reviewSince !== undefined && Number.isFinite(reviewSince)) {
    return reviewSince;
  }

  if (reviewMode === 'daily') {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    return todayStart.getTime();
  }

  const minutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0
    ? intervalMinutes
    : 60;

  return now - 1000 * 60 * minutes;
}

/**
 * 首次运行（尚无已审查提交）时扩大查询窗口，避免 schedule.intervalMinutes 过小导致 0 条。
 */
export function resolveFirstRunSince({
  since,
  now = Date.now(),
  intervalMinutes = 60,
  neverReviewed = false,
  reviewSince,
  reviewMode
}) {
  if (!neverReviewed || reviewSince !== undefined || reviewMode === 'daily') {
    return { since, widened: false };
  }

  const minLookbackMinutes = Math.max(
    Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 60,
    60
  );
  const intervalSince = now - minLookbackMinutes * 60 * 1000;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const daySince = todayStart.getTime();

  const earliestSince = Math.min(intervalSince, daySince);
  if (earliestSince >= since) {
    return { since, widened: false };
  }

  const useDayWindow = daySince <= intervalSince;
  return {
    since: earliestSince,
    widened: true,
    lookbackMinutes: minLookbackMinutes,
    useDayWindow
  };
}
