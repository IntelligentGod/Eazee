import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { database } from '@/database/database';
import TodoModel from '@/database/models/TodoModel';
import {
  canScheduleTodoReminder,
  getTodoReminderLabel,
  getTodoReminderTriggerDate,
  normalizeTodoReminderState,
} from '@/utils/todoReminders';

const TODO_REMINDER_CHANNEL_ID = 'todo-reminders';
const TODO_REMINDER_KIND = 'todo_reminder';

let isConfigured = false;

export type TodoReminderResultStatus =
  | 'scheduled'
  | 'canceled'
  | 'skipped'
  | 'permission_denied'
  | 'unsupported';

export type TodoReminderResult = {
  status: TodoReminderResultStatus;
  notificationId?: string | null;
};

const isNotificationsSupported = () => Platform.OS === 'ios' || Platform.OS === 'android';

const isPermissionGranted = (settings: Notifications.NotificationPermissionsStatus) => settings.granted;

const applyReminderState = async (
  todoId: string,
  values: Partial<{
    reminderEnabled: boolean;
    reminderMode: TodoModel['reminderMode'];
    reminderMinutesBefore: number | null;
    notificationId: string | null;
  }>
) => {
  await database.write(async () => {
    const row = await database.collections.get<TodoModel>('todos').find(todoId);
    await row.update((todo) => {
      if (typeof values.reminderEnabled === 'boolean') {
        todo.reminderEnabled = values.reminderEnabled;
      }
      if (typeof values.reminderMode === 'string') {
        todo.reminderMode = values.reminderMode;
      }
      if (values.reminderMinutesBefore !== undefined) {
        todo.reminderMinutesBefore = values.reminderMinutesBefore;
      }
      if (values.notificationId !== undefined) {
        todo.notificationId = values.notificationId;
      }
    });
  });
};

const isTodoReminderNotification = (notification: Notifications.NotificationRequest) =>
  notification.content.data?.kind === TODO_REMINDER_KIND &&
  typeof notification.content.data?.todoId === 'string';

const getNotificationTodoId = (notification: Notifications.NotificationRequest) =>
  typeof notification.content.data?.todoId === 'string' ? notification.content.data.todoId : null;

const getScheduledNotificationDate = (notification: Notifications.NotificationRequest) => {
  const trigger = notification.trigger;
  if (trigger && typeof trigger === 'object' && 'type' in trigger && trigger.type === 'date' && 'date' in trigger) {
    const rawDate = trigger.date;
    if (rawDate instanceof Date) {
      return rawDate;
    }
    if (typeof rawDate === 'number' || typeof rawDate === 'string') {
      const nextDate = new Date(rawDate);
      return Number.isNaN(nextDate.getTime()) ? null : nextDate;
    }
  }

  return null;
};

const reminderDatesMatch = (left: Date | null, right: Date | null) => {
  if (!left || !right) {
    return false;
  }

  return Math.abs(left.getTime() - right.getTime()) < 1000;
};

export const configureTodoNotifications = async () => {
  if (!isNotificationsSupported() || isConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(TODO_REMINDER_CHANNEL_ID, {
      name: 'Todo reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  isConfigured = true;
};

export const ensureNotificationPermission = async () => {
  if (!isNotificationsSupported()) {
    return { granted: false, status: 'unsupported' as const };
  }

  await configureTodoNotifications();

  const currentSettings = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(currentSettings)) {
    return { granted: true, status: currentSettings.status };
  }

  const requestedSettings = await Notifications.requestPermissionsAsync();
  return { granted: isPermissionGranted(requestedSettings), status: requestedSettings.status };
};

const scheduleFreshTodoReminder = async (
  todo: TodoModel,
  requestPermission: boolean
): Promise<TodoReminderResult> => {
  if (!canScheduleTodoReminder(todo)) {
    await applyReminderState(todo.id, { notificationId: null });
    return { status: 'skipped', notificationId: null };
  }

  const triggerDate = getTodoReminderTriggerDate(todo);
  if (!triggerDate) {
    await applyReminderState(todo.id, { notificationId: null });
    return { status: 'skipped', notificationId: null };
  }

  if (!isNotificationsSupported()) {
    return { status: 'unsupported', notificationId: null };
  }

  const permission = requestPermission
    ? await ensureNotificationPermission()
    : await Notifications.getPermissionsAsync().then((settings) => ({
        granted: isPermissionGranted(settings),
        status: settings.status,
      }));

  if (!permission.granted) {
    await applyReminderState(todo.id, { notificationId: null });
    return { status: 'permission_denied', notificationId: null };
  }

  await configureTodoNotifications();

  const dueDate = todo.dueDate
    ? todo.dueDate instanceof Date
      ? todo.dueDate
      : new Date(todo.dueDate)
    : triggerDate;
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: todo.text,
      body:
        getTodoReminderLabel(todo, todo.hasDueTime) === 'On time'
          ? 'Task due now'
          : `Task due at ${dueDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      sound: true,
      data: {
        kind: TODO_REMINDER_KIND,
        todoId: todo.id,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: Platform.OS === 'android' ? TODO_REMINDER_CHANNEL_ID : undefined,
    } as Notifications.DateTriggerInput,
  });

  await applyReminderState(todo.id, { notificationId: identifier });

  return { status: 'scheduled', notificationId: identifier };
};

export const scheduleTodoReminder = async (
  todo: TodoModel,
  options?: { requestPermission?: boolean }
): Promise<TodoReminderResult> => {
  return scheduleFreshTodoReminder(todo, options?.requestPermission ?? true);
};

export const cancelTodoReminder = async (
  todo: Pick<TodoModel, 'id' | 'notificationId'>,
  options?: { persist?: boolean }
): Promise<TodoReminderResult> => {
  if (isNotificationsSupported() && todo.notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(todo.notificationId);
    } catch (error) {
      console.warn('Failed to cancel todo reminder', error);
    }
  }

  if (options?.persist !== false) {
    await applyReminderState(todo.id, { notificationId: null });
  }

  return { status: 'canceled', notificationId: null };
};

export const rescheduleTodoReminder = async (
  todo: TodoModel,
  options?: { requestPermission?: boolean }
): Promise<TodoReminderResult> => {
  await cancelTodoReminder(todo, { persist: false });
  return scheduleFreshTodoReminder(todo, options?.requestPermission ?? true);
};

export const syncAllTodoReminders = async () => {
  if (!isNotificationsSupported()) {
    return;
  }

  await configureTodoNotifications();

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const todoNotifications = scheduledNotifications.filter(isTodoReminderNotification);
  const notificationsByTodoId = new Map<string, Notifications.NotificationRequest[]>();
  for (const notification of todoNotifications) {
    const todoId = getNotificationTodoId(notification);
    if (!todoId) {
      continue;
    }
    const existing = notificationsByTodoId.get(todoId) || [];
    existing.push(notification);
    notificationsByTodoId.set(todoId, existing);
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  const todos = await todosCollection.query().fetch();
  const todoIds = new Set(todos.map((todo) => todo.id));

  await database.write(async () => {
    for (const todo of todos) {
      const normalized = normalizeTodoReminderState(todo, todo.hasDueTime);
      const needsNormalization =
        todo.reminderEnabled !== normalized.reminderEnabled ||
        todo.reminderMode !== normalized.reminderMode ||
        todo.reminderMinutesBefore !== normalized.reminderMinutesBefore ||
        todo.notificationId !== null;

      if (!needsNormalization) {
        continue;
      }

      await todo.update((row) => {
        row.reminderEnabled = normalized.reminderEnabled;
        row.reminderMode = normalized.reminderMode;
        row.reminderMinutesBefore = normalized.reminderMinutesBefore;
        row.notificationId = null;
      });
    }
  });

  for (const notification of todoNotifications) {
    const todoId = getNotificationTodoId(notification);
    if (!todoId || !todoIds.has(todoId)) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }

  const freshTodos = await todosCollection.query().fetch();
  const permissions = await Notifications.getPermissionsAsync();
  const hasPermission = isPermissionGranted(permissions);

  for (const todo of freshTodos) {
    const expectedTriggerDate = getTodoReminderTriggerDate(todo);
    const scheduledForTodo = notificationsByTodoId.get(todo.id) || [];
    const exactMatch = scheduledForTodo.find((notification) =>
      reminderDatesMatch(getScheduledNotificationDate(notification), expectedTriggerDate)
    );

    if (!expectedTriggerDate || !hasPermission) {
      for (const notification of scheduledForTodo) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
      if (todo.notificationId !== null) {
        await applyReminderState(todo.id, { notificationId: null });
      }
      continue;
    }

    if (exactMatch) {
      for (const notification of scheduledForTodo) {
        if (notification.identifier !== exactMatch.identifier) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        }
      }
      if (todo.notificationId !== exactMatch.identifier) {
        await applyReminderState(todo.id, { notificationId: exactMatch.identifier });
      }
      continue;
    }

    for (const notification of scheduledForTodo) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }

    await scheduleFreshTodoReminder(todo, false);
  }
};
