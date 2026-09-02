import { database } from '@/database/database';
import TodoModel from '@/database/models/TodoModel';
import {
  cancelTodoReminder,
  rescheduleTodoReminder,
  scheduleTodoReminder,
} from '@/lib/todoNotifications';
import {
  getDefaultTodoReminderState,
  normalizeTodoReminderState,
  type TodoReminderMode,
} from '@/utils/todoReminders';

type TodoKind = 'basic' | 'progress' | 'slider';

export type TodoSnapshot = {
  id: string;
  text: string;
  completed: boolean;
  details?: string;
  dueDate?: Date;
  hasDueTime: boolean;
  starred: boolean;
  workspace: string;
  amazonUrl?: string;
  isAmazonUrlLoaded: boolean;
  amazonUrlLoadAttempts: number;
  emailId?: string;
  type: TodoKind;
  startedAt?: Date;
  progress?: number;
  reminderEnabled: boolean;
  reminderMode: TodoReminderMode;
  reminderMinutesBefore?: number | null;
  notificationId?: string | null;
};

export type CreateTodoInput = {
  text: string;
  completed?: boolean;
  details?: string;
  dueDate?: Date;
  hasDueTime?: boolean;
  starred?: boolean;
  workspace?: string;
  amazonUrl?: string;
  isAmazonUrlLoaded?: boolean;
  amazonUrlLoadAttempts?: number;
  emailId?: string;
  type?: TodoKind;
  startedAt?: Date;
  progress?: number;
  reminderEnabled?: boolean | null;
  reminderMode?: TodoReminderMode | null;
  reminderMinutesBefore?: number | null;
};

export type UpdateTodoInput = Partial<{
  text: string;
  completed: boolean;
  details: string;
  dueDate: Date;
  hasDueTime: boolean;
  starred: boolean;
  workspace: string;
  amazonUrl: string;
  isAmazonUrlLoaded: boolean;
  amazonUrlLoadAttempts: number;
  emailId: string;
  type: TodoKind;
  startedAt: Date | null;
  progress: number | undefined;
  reminderEnabled: boolean;
  reminderMode: TodoReminderMode;
  reminderMinutesBefore: number | null;
}>;

type UpdateTodoSpec = {
  id: string;
  input: UpdateTodoInput;
  options?: {
    applyDefaultReminderWhenTimingAdded?: boolean;
    syncReminder?: boolean;
    requestPermission?: boolean;
  };
};

const applyReminderFields = (
  todo: TodoModel,
  reminder: ReturnType<typeof normalizeTodoReminderState>
) => {
  todo.reminderEnabled = reminder.reminderEnabled;
  todo.reminderMode = reminder.reminderMode;
  todo.reminderMinutesBefore = reminder.reminderMinutesBefore;
};

const applyCreateFields = (todo: TodoModel, input: CreateTodoInput) => {
  const hasDueTime = !!input.hasDueTime;
  const reminder = normalizeTodoReminderState(
    {
      reminderEnabled: input.reminderEnabled,
      reminderMode: input.reminderMode,
      reminderMinutesBefore: input.reminderMinutesBefore,
    },
    hasDueTime
  );
  const fallbackReminder =
    input.reminderMode == null &&
    input.reminderEnabled == null &&
    input.reminderMinutesBefore == null
      ? getDefaultTodoReminderState(hasDueTime)
      : reminder;

  todo.text = input.text;
  todo.completed = !!input.completed;
  todo.details = input.details || '';
  todo.dueDate = input.dueDate || new Date();
  todo.hasDueTime = hasDueTime;
  todo.starred = !!input.starred;
  todo.workspace = input.workspace || 'Personal';
  todo.amazonUrl = input.amazonUrl;
  todo.isAmazonUrlLoaded = !!input.isAmazonUrlLoaded;
  todo.amazonUrlLoadAttempts = input.amazonUrlLoadAttempts || 0;
  todo.emailId = input.emailId;
  // @ts-ignore
  todo.type = input.type || 'basic';
  // @ts-ignore
  todo.startedAt = input.startedAt;
  // @ts-ignore
  todo.progress = input.progress;
  applyReminderFields(todo, fallbackReminder);
  todo.notificationId = null;
};

const applyUpdateFields = (
  todo: TodoModel,
  input: UpdateTodoInput,
  options?: { applyDefaultReminderWhenTimingAdded?: boolean }
) => {
  const previousHasDueTime = todo.hasDueTime;
  const previousReminderEnabled = todo.reminderEnabled;
  const previousReminderMode = todo.reminderMode;

  if (input.text !== undefined) todo.text = input.text;
  if (input.completed !== undefined) todo.completed = input.completed;
  if (input.details !== undefined) todo.details = input.details;
  if (input.dueDate !== undefined) todo.dueDate = input.dueDate;
  if (input.hasDueTime !== undefined) todo.hasDueTime = input.hasDueTime;
  if (input.starred !== undefined) todo.starred = input.starred;
  if (input.workspace !== undefined) todo.workspace = input.workspace;
  if (input.amazonUrl !== undefined) todo.amazonUrl = input.amazonUrl;
  if (input.isAmazonUrlLoaded !== undefined) todo.isAmazonUrlLoaded = input.isAmazonUrlLoaded;
  if (input.amazonUrlLoadAttempts !== undefined) todo.amazonUrlLoadAttempts = input.amazonUrlLoadAttempts;
  if (input.emailId !== undefined) todo.emailId = input.emailId;
  if (input.type !== undefined) {
    // @ts-ignore
    todo.type = input.type;
  }
  if (input.startedAt !== undefined) {
    // @ts-ignore
    todo.startedAt = input.startedAt ?? undefined;
  }
  if (input.progress !== undefined) {
    // @ts-ignore
    todo.progress = input.progress;
  }

  const hasExplicitReminderChange =
    input.reminderEnabled !== undefined ||
    input.reminderMode !== undefined ||
    input.reminderMinutesBefore !== undefined;

  const shouldApplyDefaultReminder =
    !hasExplicitReminderChange &&
    !!options?.applyDefaultReminderWhenTimingAdded &&
    !previousHasDueTime &&
    !!todo.hasDueTime &&
    !previousReminderEnabled &&
    previousReminderMode === 'none';

  const reminder = shouldApplyDefaultReminder
    ? getDefaultTodoReminderState(true)
    : normalizeTodoReminderState(
        {
          reminderEnabled: input.reminderEnabled ?? todo.reminderEnabled,
          reminderMode: input.reminderMode ?? todo.reminderMode,
          reminderMinutesBefore:
            input.reminderMinutesBefore !== undefined
              ? input.reminderMinutesBefore
              : todo.reminderMinutesBefore,
        },
        todo.hasDueTime
      );

  applyReminderFields(todo, reminder);
};

export const snapshotTodo = (todo: Pick<
  TodoModel,
  | 'id'
  | 'text'
  | 'completed'
  | 'details'
  | 'dueDate'
  | 'hasDueTime'
  | 'starred'
  | 'workspace'
  | 'amazonUrl'
  | 'isAmazonUrlLoaded'
  | 'amazonUrlLoadAttempts'
  | 'emailId'
  | 'type'
  | 'startedAt'
  | 'progress'
  | 'reminderEnabled'
  | 'reminderMode'
  | 'reminderMinutesBefore'
  | 'notificationId'
>) => {
  const reminder = normalizeTodoReminderState(todo, todo.hasDueTime);

  return {
    id: todo.id,
    text: todo.text,
    completed: todo.completed,
    details: todo.details,
    dueDate: todo.dueDate || undefined,
    hasDueTime: todo.hasDueTime,
    starred: todo.starred,
    workspace: todo.workspace,
    amazonUrl: todo.amazonUrl,
    isAmazonUrlLoaded: todo.isAmazonUrlLoaded,
    amazonUrlLoadAttempts: todo.amazonUrlLoadAttempts,
    emailId: todo.emailId,
    type: todo.type || 'basic',
    startedAt: todo.startedAt || undefined,
    progress: todo.progress,
    reminderEnabled: reminder.reminderEnabled,
    reminderMode: reminder.reminderMode,
    reminderMinutesBefore: reminder.reminderMinutesBefore,
    notificationId: todo.notificationId ?? null,
  } satisfies TodoSnapshot;
};

const syncReminderForTodo = async (todo: TodoModel, requestPermission = true) => {
  const result = todo.reminderMode === 'none' || !todo.hasDueTime || todo.completed
    ? await cancelTodoReminder(todo)
    : await rescheduleTodoReminder(todo, { requestPermission });

  return {
    todo: await database.collections.get<TodoModel>('todos').find(todo.id),
    reminderStatus: result.status,
  };
};

export const createTodo = async (input: CreateTodoInput, options?: { requestPermission?: boolean }) => {
  const [result] = await createTodos([input], options);
  return result;
};

export const createTodos = async (
  inputs: CreateTodoInput[],
  options?: { requestPermission?: boolean }
) => {
  if (!inputs.length) {
    return [];
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  let createdTodos: TodoModel[] = [];

  await database.write(async () => {
    createdTodos = inputs.map((input) =>
      todosCollection.prepareCreate((todo) => {
        applyCreateFields(todo, input);
      })
    );
    await database.batch(createdTodos);
  });

  const results = [];
  for (const todo of createdTodos) {
    if (todo.completed || !todo.hasDueTime) {
      results.push({ todo, reminderStatus: 'skipped' as const });
      continue;
    }

    const result = await scheduleTodoReminder(todo, {
      requestPermission: options?.requestPermission ?? true,
    });
    results.push({
      todo: await todosCollection.find(todo.id),
      reminderStatus: result.status,
    });
  }

  return results;
};

export const updateTodo = async (
  id: string,
  input: UpdateTodoInput,
  options?: {
    applyDefaultReminderWhenTimingAdded?: boolean;
    syncReminder?: boolean;
    requestPermission?: boolean;
  }
) => {
  const [result] = await updateTodos([{ id, input, options }]);
  return result;
};

export const updateTodos = async (specs: UpdateTodoSpec[]) => {
  if (!specs.length) {
    return [];
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  let updatedTodos: TodoModel[] = [];

  await database.write(async () => {
    updatedTodos = await Promise.all(
      specs.map(async (spec) => {
        const todo = await todosCollection.find(spec.id);
        return todo.prepareUpdate((row) => {
          applyUpdateFields(row, spec.input, {
            applyDefaultReminderWhenTimingAdded: spec.options?.applyDefaultReminderWhenTimingAdded,
          });
        });
      })
    );
    await database.batch(updatedTodos);
  });

  const results = [];
  for (let index = 0; index < updatedTodos.length; index += 1) {
    const todo = updatedTodos[index];
    const spec = specs[index];

    if (!spec.options?.syncReminder) {
      results.push({ todo, reminderStatus: 'skipped' as const });
      continue;
    }

    results.push(await syncReminderForTodo(todo, spec.options?.requestPermission ?? true));
  }

  return results;
};

export const deleteTodo = async (id: string) => {
  const [snapshot] = await deleteTodos([id]);
  return snapshot;
};

export const deleteTodos = async (ids: string[]) => {
  if (!ids.length) {
    return [];
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  const rows = await Promise.all(ids.map((id) => todosCollection.find(id)));
  const snapshots = rows.map(snapshotTodo);
  const notificationTargets = rows.map((row) => ({ id: row.id, notificationId: row.notificationId }));

  await database.write(async () => {
    await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
  });

  for (const target of notificationTargets) {
    await cancelTodoReminder(target, { persist: false });
  }

  return snapshots;
};

const buildDirtyRawFromSnapshot = (snapshot: TodoSnapshot) => {
  const now = Date.now();

  return {
    id: snapshot.id,
    text: snapshot.text,
    completed: snapshot.completed,
    details: snapshot.details ?? '',
    due_date: snapshot.dueDate ? snapshot.dueDate.getTime() : null,
    has_due_time: snapshot.hasDueTime,
    starred: snapshot.starred,
    workspace: snapshot.workspace,
    amazon_url: snapshot.amazonUrl ?? null,
    is_amazon_url_loaded: snapshot.isAmazonUrlLoaded,
    amazon_url_load_attempts: snapshot.amazonUrlLoadAttempts,
    created_at: now,
    updated_at: now,
    email_id: snapshot.emailId ?? null,
    type: snapshot.type,
    started_at: snapshot.startedAt ? snapshot.startedAt.getTime() : null,
    progress: snapshot.progress ?? null,
    reminder_enabled: snapshot.reminderEnabled,
    reminder_mode: snapshot.reminderMode,
    reminder_minutes_before: snapshot.reminderMinutesBefore ?? null,
    notification_id: null,
  };
};

export const restoreTodo = async (snapshot: TodoSnapshot, options?: { requestPermission?: boolean }) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  let restoredTodo!: TodoModel;

  await database.write(async () => {
    restoredTodo = todosCollection.prepareCreateFromDirtyRaw(buildDirtyRawFromSnapshot(snapshot));
    await database.batch(restoredTodo);
  });

  if (restoredTodo.completed || !restoredTodo.hasDueTime) {
    return { todo: restoredTodo, reminderStatus: 'skipped' as const };
  }

  const result = await scheduleTodoReminder(restoredTodo, {
    requestPermission: options?.requestPermission ?? true,
  });

  return {
    todo: await todosCollection.find(restoredTodo.id),
    reminderStatus: result.status,
  };
};
