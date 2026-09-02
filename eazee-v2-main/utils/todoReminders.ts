export type TodoReminderMode = 'none' | 'on_time' | 'preset' | 'custom';

export type TodoReminderState = {
  reminderEnabled?: boolean | null;
  reminderMode?: TodoReminderMode | null;
  reminderMinutesBefore?: number | null;
  notificationId?: string | null;
};

export type TodoReminderSubject = TodoReminderState & {
  dueDate?: Date | null;
  hasDueTime?: boolean | null;
  completed?: boolean | null;
};

export const TODO_REMINDER_PRESETS = [
  { minutes: 5, label: '5 minutes early' },
  { minutes: 30, label: '30 minutes early' },
  { minutes: 60, label: '1 hour early' },
  { minutes: 1440, label: '1 day early' },
] as const;

export const DEFAULT_CUSTOM_REMINDER = {
  days: 0,
  hours: 0,
  minutes: 15,
} as const;

export const DEFAULT_CUSTOM_REMINDER_MINUTES =
  DEFAULT_CUSTOM_REMINDER.days * 24 * 60 +
  DEFAULT_CUSTOM_REMINDER.hours * 60 +
  DEFAULT_CUSTOM_REMINDER.minutes;

export const buildCustomReminderMinutes = (days: number, hours: number, minutes: number) =>
  Math.max(0, days * 24 * 60 + hours * 60 + minutes);

export const splitCustomReminderMinutes = (totalMinutes?: number | null) => {
  const safeMinutes = Math.max(0, totalMinutes ?? DEFAULT_CUSTOM_REMINDER_MINUTES);
  const days = Math.floor(safeMinutes / 1440);
  const hours = Math.floor((safeMinutes % 1440) / 60);
  const minutes = safeMinutes % 60;

  return { days, hours, minutes };
};

export const getDefaultTodoReminderState = (hasDueTime?: boolean | null) => {
  if (hasDueTime) {
    return {
      reminderEnabled: true,
      reminderMode: 'on_time' as const,
      reminderMinutesBefore: 0,
      notificationId: null,
    };
  }

  return {
    reminderEnabled: false,
    reminderMode: 'none' as const,
    reminderMinutesBefore: null,
    notificationId: null,
  };
};

export const normalizeTodoReminderState = <T extends TodoReminderState>(
  subject: T,
  hasDueTime?: boolean | null
) => {
  const fallback = getDefaultTodoReminderState(hasDueTime);
  const rawMode = subject.reminderMode;
  const rawMinutes =
    typeof subject.reminderMinutesBefore === 'number' && Number.isFinite(subject.reminderMinutesBefore)
      ? Math.max(0, Math.round(subject.reminderMinutesBefore))
      : null;

  let reminderMode: TodoReminderMode =
    rawMode === 'none' || rawMode === 'on_time' || rawMode === 'preset' || rawMode === 'custom'
      ? rawMode
      : fallback.reminderMode;

  let reminderEnabled =
    typeof subject.reminderEnabled === 'boolean' ? subject.reminderEnabled : fallback.reminderEnabled;
  let reminderMinutesBefore =
    rawMode === 'none'
      ? null
      : rawMode === 'on_time'
        ? 0
        : rawMinutes;

  if (!reminderEnabled || reminderMode === 'none') {
    reminderEnabled = false;
    reminderMode = 'none';
    reminderMinutesBefore = null;
  } else if (reminderMode === 'on_time' || reminderMinutesBefore === 0) {
    reminderEnabled = true;
    reminderMode = 'on_time';
    reminderMinutesBefore = 0;
  } else if ((reminderMode === 'preset' || reminderMode === 'custom') && reminderMinutesBefore == null) {
    reminderEnabled = true;
    reminderMode = fallback.reminderEnabled ? fallback.reminderMode : 'none';
    reminderMinutesBefore = reminderMode === 'on_time' ? 0 : fallback.reminderMinutesBefore;
  }

  return {
    reminderEnabled,
    reminderMode,
    reminderMinutesBefore,
    notificationId: subject.notificationId ?? null,
  };
};

export const getTodoReminderMinutesBefore = (subject: TodoReminderState, hasDueTime?: boolean | null) => {
  const normalized = normalizeTodoReminderState(subject, hasDueTime);
  return normalized.reminderMode === 'none' ? null : normalized.reminderMinutesBefore ?? 0;
};

export const canScheduleTodoReminder = (subject: TodoReminderSubject) => {
  const normalized = normalizeTodoReminderState(subject, subject.hasDueTime);
  return !!subject.dueDate && !!subject.hasDueTime && !subject.completed && normalized.reminderMode !== 'none';
};

export const getTodoReminderTriggerDate = (subject: TodoReminderSubject) => {
  if (!canScheduleTodoReminder(subject) || !subject.dueDate) {
    return null;
  }

  const dueDate = subject.dueDate instanceof Date ? subject.dueDate : new Date(subject.dueDate);
  const minutesBefore = getTodoReminderMinutesBefore(subject, subject.hasDueTime) ?? 0;
  const trigger = new Date(dueDate.getTime() - minutesBefore * 60_000);

  return trigger.getTime() > Date.now() ? trigger : null;
};

const formatCustomReminderLabel = (totalMinutes: number) => {
  if (totalMinutes <= 0) {
    return 'On time';
  }

  const { days, hours, minutes } = splitCustomReminderMinutes(totalMinutes);
  const parts = [
    days ? `${days} day${days === 1 ? '' : 's'}` : '',
    hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '',
    minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  return `${parts.join(' ')} early`;
};

export const getTodoReminderLabel = (subject: TodoReminderState, hasDueTime?: boolean | null) => {
  const normalized = normalizeTodoReminderState(subject, hasDueTime);

  if (normalized.reminderMode === 'none') {
    return 'None';
  }

  if (normalized.reminderMode === 'on_time') {
    return 'On time';
  }

  const preset = TODO_REMINDER_PRESETS.find((option) => option.minutes === normalized.reminderMinutesBefore);
  if (preset) {
    return preset.label;
  }

  return formatCustomReminderLabel(normalized.reminderMinutesBefore ?? 0);
};
