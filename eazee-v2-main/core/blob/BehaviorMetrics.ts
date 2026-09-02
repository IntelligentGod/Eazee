export type BehaviorMetrics = {
  dueSoon: number;
  overdue: number;
  completedToday: number;
  missedToday: number;
  calendarChanges: number;
  contextSwitches: number;
  inboxTrend: number;
  lateNightActivity: number;
};

// Minimal domain shapes used by this module. These can be replaced with
// canonical app types later via imports.

export interface Task {
  id: string;
  dueAt?: Date | null;
  completedAt?: Date | null;
  isCompleted?: boolean;
}

export interface CalendarEvent {
  id: string;
  startAt: Date;
  endAt?: Date | null;
}

export interface EmailSummary {
  unreadNow: number;
  unread24hAgo: number;
}

export type ActivityEventType =
  | 'calendar_reschedule'
  | 'context_switch'
  | 'task_completed'
  | 'generic';

export interface ActivityEvent {
  type: ActivityEventType;
  at: Date;
}

export interface ActivityLog {
  events: ActivityEvent[];
  averageDailyTaskCompletions?: number;
  averageDailyContextSwitches?: number;
  // Optional user sleep window in local hours [0, 24).
  usualSleepStartHour?: number;
  usualSleepEndHour?: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function ratio(count: number, denom: number, cap: number): number {
  if (denom <= 0) {
    return 0;
  }
  const raw = count / denom;
  return clamp01(raw / cap);
}

export function computeBehaviorMetrics(input: {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  emailSummary: EmailSummary;
  activityLog: ActivityLog;
}): BehaviorMetrics {
  const { tasks, calendarEvents, emailSummary, activityLog } = input;
  const now = new Date();
  const nowTime = now.getTime();

  const sixHoursMs = 6 * 60 * 60 * 1000;
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  const horizon6h = new Date(nowTime + sixHoursMs);
  const sixHoursAgo = new Date(nowTime - sixHoursMs);
  const twoHoursAgo = new Date(nowTime - twoHoursMs);
  const dayAgo = new Date(nowTime - oneDayMs);

  // dueSoon: fraction of tasks or events due in next 6 hours.
  const dueSoonTasks = tasks.filter(task => {
    if (!task.dueAt || task.isCompleted) return false;
    const t = task.dueAt.getTime();
    return t >= nowTime && t <= horizon6h.getTime();
  }).length;

  const dueSoonEvents = calendarEvents.filter(event => {
    const start = event.startAt.getTime();
    return start >= nowTime && start <= horizon6h.getTime();
  }).length;

  const totalDueItems = tasks.length + calendarEvents.length;
  const dueSoon = clamp01(
    totalDueItems > 0 ? (dueSoonTasks + dueSoonEvents) / totalDueItems : 0
  );

  // overdue: fraction of tasks past due time.
  const overdueTasks = tasks.filter(task => {
    if (!task.dueAt || task.isCompleted) return false;
    return task.dueAt.getTime() < nowTime;
  }).length;
  const overdue = clamp01(tasks.length > 0 ? overdueTasks / tasks.length : 0);

  // completedToday: tasks completed in last 6 hours normalized by daily average.
  const completedRecently = tasks.filter(task => {
    if (!task.completedAt) return false;
    const t = task.completedAt.getTime();
    return t >= sixHoursAgo.getTime() && t <= nowTime;
  }).length;
  const avgDailyCompletions =
    activityLog.averageDailyTaskCompletions && activityLog.averageDailyTaskCompletions > 0
      ? activityLog.averageDailyTaskCompletions
      : 8; // heuristic cap
  const completedToday = clamp01(completedRecently / avgDailyCompletions);

  // missedToday: tasks that passed due time today.
  const today = now;
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();
  const startOfDay = new Date(year, month, date).getTime();
  const endOfDay = startOfDay + oneDayMs;

  const tasksDueToday = tasks.filter(task => {
    if (!task.dueAt) return false;
    const t = task.dueAt.getTime();
    return t >= startOfDay && t < endOfDay;
  });

  const missedTodayCount = tasksDueToday.filter(task => {
    if (task.isCompleted) return false;
    return (task.dueAt as Date).getTime() < nowTime;
  }).length;

  const missedToday =
    tasksDueToday.length > 0
      ? clamp01(missedTodayCount / tasksDueToday.length)
      : 0;

  // calendarChanges: reschedules in last 2 hours normalized.
  const reschedulesLast2h = activityLog.events.filter(
    e => e.type === 'calendar_reschedule' && e.at.getTime() >= twoHoursAgo.getTime()
  ).length;
  // Assume 4 reschedules in 2 hours is already high.
  const calendarChanges = clamp01(reschedulesLast2h / 4);

  // contextSwitches: rapid tab/app switching events normalized.
  const contextSwitchEvents = activityLog.events.filter(
    e => e.type === 'context_switch' && e.at.getTime() >= sixHoursAgo.getTime()
  ).sort((a, b) => a.at.getTime() - b.at.getTime());

  let rapidSwitches = 0;
  for (let i = 1; i < contextSwitchEvents.length; i++) {
    const prev = contextSwitchEvents[i - 1].at.getTime();
    const curr = contextSwitchEvents[i].at.getTime();
    // Consider switches within 3 minutes as part of a rapid switching pattern.
    if (curr - prev <= 3 * 60 * 1000) {
      rapidSwitches += 1;
    }
  }

  const contextBaseline =
    activityLog.averageDailyContextSwitches && activityLog.averageDailyContextSwitches > 0
      ? activityLog.averageDailyContextSwitches
      : 20;
  const contextSwitches = clamp01(rapidSwitches / contextBaseline);

  // inboxTrend: increase in unread emails over last 24h normalized.
  const unreadDelta = emailSummary.unreadNow - emailSummary.unread24hAgo;
  const inboxTrend =
    unreadDelta <= 0 ? 0 : clamp01(unreadDelta / 50); // assume +50 is \"maxed\" trend

  // lateNightActivity: activity after midnight relative to user's normal sleep window.
  const sleepStart =
    activityLog.usualSleepStartHour !== undefined
      ? activityLog.usualSleepStartHour
      : 0; // default midnight
  const sleepEnd =
    activityLog.usualSleepEndHour !== undefined
      ? activityLog.usualSleepEndHour
      : 6; // default 6am

  const recentEvents = activityLog.events.filter(
    e => e.at.getTime() >= dayAgo.getTime() && e.at.getTime() <= nowTime
  );

  let lateNightCount = 0;
  for (const e of recentEvents) {
    const hour = e.at.getHours();
    if (sleepStart < sleepEnd) {
      // Simple window, e.g. 0-6
      if (hour >= sleepStart && hour < sleepEnd) {
        lateNightCount += 1;
      }
    } else {
      // Window wraps past midnight, e.g. 23-7
      if (hour >= sleepStart || hour < sleepEnd) {
        lateNightCount += 1;
      }
    }
  }

  const lateNightActivity =
    recentEvents.length > 0
      ? clamp01(lateNightCount / recentEvents.length)
      : 0;

  return {
    dueSoon,
    overdue,
    completedToday,
    missedToday,
    calendarChanges,
    contextSwitches,
    inboxTrend,
    lateNightActivity,
  };
}

