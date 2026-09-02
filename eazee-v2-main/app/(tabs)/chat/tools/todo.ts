import { Q } from '@nozbe/watermelondb';
import UserPreferenceModel from '../../../../database/models/UserPreferenceModel';
import { database } from '../../../../database/database';
import TodoModel from '../../../../database/models/TodoModel';
import { createTodos, deleteTodos, updateTodos } from '@/lib/todoMutations';

export type ToolHandler = (args: any) => Promise<any>;

const isMidnight = (d: Date) =>
  d.getHours() === 0 &&
  d.getMinutes() === 0 &&
  d.getSeconds() === 0 &&
  d.getMilliseconds() === 0;

const getDefaultTodoDueDate = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const parseDueInput = (raw?: string, hasDueTime?: boolean): { dueDate?: Date; hasDueTime: boolean } => {
  if (!raw || typeof raw !== 'string') return { dueDate: undefined, hasDueTime: false };
  const lower = raw.toLowerCase();
  const now = new Date();
  if (lower === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { dueDate: d, hasDueTime: false };
  }
  if (lower === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return { dueDate: d, hasDueTime: false };
  }
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    d.setHours(0, 0, 0, 0);
    return { dueDate: d, hasDueTime: false };
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { dueDate: undefined, hasDueTime: false };
  const resolvedHasDueTime =
    typeof hasDueTime === 'boolean'
      ? hasDueTime
      : /^\d{4}-\d{2}-\d{2}T/.test(raw) || !isMidnight(d);
  if (!resolvedHasDueTime) {
    d.setHours(0, 0, 0, 0);
  }
  return { dueDate: d, hasDueTime: resolvedHasDueTime };
};

const toLocalYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDayInput = (s: string): string | null => {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const m1 = trimmed.match(dmy);
  if (m1) {
    const dd = parseInt(m1[1], 10);
    const mm = parseInt(m1[2], 10);
    const yyyy = parseInt(m1[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(yyyy, mm - 1, dd);
      if (!isNaN(d.getTime())) return toLocalYmd(d);
    }
    return null;
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m2 = trimmed.match(ymd);
  if (m2) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return toLocalYmd(d);
  }
  return null;
};

// Map user-provided workspace names to stable keys (e.g., "work" → "Goals")
const resolveWorkspaceKey = async (input?: string): Promise<string> => {
  const raw = String(input || '').trim();
  if (!raw) return 'Personal';
  const norm = raw.toLowerCase().replace(/\s+workspace$/i, '').trim();
  const builtin: Record<string, string> = { goals: 'Goals', personal: 'Personal', work: 'Goals', wishlist: 'Wishlist' };
  if (builtin[norm]) return builtin[norm];
  try {
    const prefs = await database.collections.get<UserPreferenceModel>('user_preferences').query().fetch();
    for (const p of prefs) {
      const key = String((p as any).original_name || (p as any).workspace_name || '');
      const disp = String((p as any).display_name || (p as any).workspace_name || '');
      if (!key) continue;
      const names = [key, disp].map((s) => s.toLowerCase());
      if (names.includes(norm)) return key;
    }
  } catch {}
  return raw;
};

export const createTodoItems = async (items: any[]) => {
  if (!items.length) return { created: 0, createdItems: [] };
  const createInputs = [];
  for (const it of items) {
    const wsKey = await resolveWorkspaceKey(it.workspace);
    const parsedDue = parseDueInput(it.dueDate, it.hasDueTime);
    createInputs.push({
      text: String(it.text || '').trim(),
      completed: false,
      details: it.details || '',
      dueDate: parsedDue.dueDate || getDefaultTodoDueDate(),
      hasDueTime: parsedDue.hasDueTime,
      starred: !!it.starred,
      workspace: wsKey || 'Personal',
      type: 'basic' as const,
      progress: 0,
      isAmazonUrlLoaded: false,
      amazonUrlLoadAttempts: 0,
    });
  }
  const results = await createTodos(createInputs);
  const createdItems: Array<{ id: string; text: string; dueDate: string | null; hasDueTime: boolean; workspace: string; starred: boolean }> = results.map(({ todo }) => ({
      id: String(todo.id),
      text: String(todo.text),
      dueDate: todo.dueDate ? new Date(todo.dueDate).toISOString() : null,
      hasDueTime: !!todo.hasDueTime,
      workspace: String(todo.workspace || 'Personal'),
      starred: !!todo.starred,
    }));
  return { created: items.length, createdItems };
};

const todo_create_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  return createTodoItems(items);
};

const todo_delete_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let deleted = 0;
  const deletedItems: Array<{ id: string; text: string }> = [];
  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const todos = database.collections.get<TodoModel>('todos');
  const idsToDelete: string[] = [];
  for (const it of items) {
    if (it?.id) {
      try {
        const row = await todos.find(String(it.id));
        deletedItems.push({ id: String(row.id), text: row.text });
        idsToDelete.push(String(row.id));
        continue;
      } catch {}
    }
    const target = normalize(it.text);
    const all = await todos.query().fetch();
    const matches = all.filter(t => normalize(t.text) === target);
    for (const row of matches) {
      deletedItems.push({ id: String(row.id), text: row.text });
      idsToDelete.push(String(row.id));
    }
  }
  if (idsToDelete.length) {
    await deleteTodos(idsToDelete);
    deleted = idsToDelete.length;
  }
  return { deleted, deletedItems };
};

const todo_complete_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let completed = 0;
  const completedItems: Array<{ text: string }> = [];
  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const todos = database.collections.get<TodoModel>('todos');
  const updates: Parameters<typeof updateTodos>[0] = [];
  for (const it of items) {
    if (it?.id) {
      try {
        const row = await todos.find(String(it.id));
        completedItems.push({ text: row.text });
        updates.push({ id: String(row.id), input: { completed: true }, options: { syncReminder: true } });
        continue;
      } catch {}
    }
    const target = normalize(it.text);
    const all = await todos.query().fetch();
    const matches = all.filter(t => normalize(t.text) === target);
    for (const row of matches) {
      completedItems.push({ text: row.text });
      updates.push({ id: String(row.id), input: { completed: true }, options: { syncReminder: true } });
    }
  }
  if (updates.length) {
    await updateTodos(updates);
    completed = updates.length;
  }
  return { completed, completedItems };
};

const todo_edit_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let updated = 0;
  const updatedItems: Array<{ id: string; oldText: string; newText?: string; workspace?: string; dueDate?: string | null; hasDueTime?: boolean; starred?: boolean }> = [];
  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const todos = database.collections.get<TodoModel>('todos');
  const updates: Parameters<typeof updateTodos>[0] = [];
  const apply = async (row: TodoModel, it: any) => {
    const wsKey = typeof it.workspace === 'string' ? await resolveWorkspaceKey(it.workspace) : undefined;
    const parsedDue = parseDueInput(it.dueDate, it.hasDueTime);
    updates.push({
      id: String(row.id),
      input: {
        text: it.newText ? String(it.newText) : undefined,
        details: typeof it.details === 'string' ? it.details : undefined,
        dueDate: parsedDue.dueDate,
        hasDueTime: parsedDue.dueDate ? parsedDue.hasDueTime : undefined,
        workspace: wsKey,
        starred: typeof it.starred === 'boolean' ? it.starred : undefined,
      },
      options: {
        applyDefaultReminderWhenTimingAdded: !!parsedDue.dueDate,
        syncReminder: !!parsedDue.dueDate,
      },
    });
    updated++;
    updatedItems.push({
      id: String(row.id),
      oldText: String(it.oldText || row.text),
      newText: it.newText ? String(it.newText) : undefined,
      workspace: typeof it.workspace === 'string' ? wsKey : undefined,
      dueDate: parsedDue.dueDate ? parsedDue.dueDate.toISOString() : undefined,
      hasDueTime: parsedDue.dueDate ? parsedDue.hasDueTime : undefined,
      starred: typeof it.starred === 'boolean' ? !!it.starred : undefined,
    });
  };
  for (const it of items) {
    if (it?.id) {
      try { const row = await todos.find(String(it.id)); await apply(row, it); continue; } catch {}
    }
    const target = normalize(it.oldText);
    const all = await todos.query().fetch();
    const matches = all.filter(t => normalize(t.text) === target);
    for (const row of matches) { await apply(row, it); }
  }
  if (updates.length) {
    await updateTodos(updates);
  }
  return { updated, updatedItems };
};

const todo_star_toggle_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let affected = 0;
  const affectedItems: Array<{ text: string; starred?: boolean }> = [];
  const todos = database.collections.get<TodoModel>('todos');
  const updates: Parameters<typeof updateTodos>[0] = [];
  for (const it of items) {
    if (it?.id) {
      try {
        const row = await todos.find(String(it.id));
        affectedItems.push({ text: row.text, starred: typeof it.starred === 'boolean' ? !!it.starred : undefined });
        updates.push({ id: String(row.id), input: { starred: typeof it.starred === 'boolean' ? it.starred : !row.starred } });
        continue;
      } catch {}
    }
    const rows = await todos.query(Q.where('text', Q.eq(String(it.text || '')))).fetch();
    for (const row of rows) {
      affectedItems.push({ text: row.text, starred: typeof it.starred === 'boolean' ? !!it.starred : undefined });
      updates.push({ id: String(row.id), input: { starred: typeof it.starred === 'boolean' ? it.starred : !row.starred } });
    }
  }
  if (updates.length) {
    await updateTodos(updates);
    affected = updates.length;
  }
  return { affected, affectedItems };
};

const todo_query: ToolHandler = async (args: any) => {
  const limit = Math.min(Math.max(Number(args?.limit || 50), 1), 200);
  const normalize = (s: string) => String(s || '').toLowerCase();
  const dayStrRaw = typeof args?.dueDateDay === 'string' ? args.dueDateDay : undefined;
  const dayStr = dayStrRaw ? parseDayInput(dayStrRaw) : undefined; // normalize to YYYY-MM-DD
  const parseDayToDate = (s?: string | null) => {
    if (!s) return null;
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m = s.match(ymd);
    if (m) {
      // Correctly map capture groups: 1=year, 2=month, 3=day
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      return new Date(year, month, day);
    }
    const norm = parseDayInput(s);
    if (norm) return parseDayToDate(norm);
    return null;
  };
  const rangeFrom = typeof args?.range?.from === 'string' ? parseDayToDate(args.range.from) : null;
  const rangeTo = typeof args?.range?.to === 'string' ? parseDayToDate(args.range.to) : null;
  const textContains = typeof args?.textContains === 'string' ? normalize(args.textContains) : undefined;
  const completed = typeof args?.completed === 'boolean' ? args.completed : false;
  const overdueOnly = args?.overdueOnly === true;
  const starred = typeof args?.starred === 'boolean' ? args.starred : undefined;
  const workspace = typeof args?.workspace === 'string' ? args.workspace : undefined;
  const matchingItems: Array<{ id: string; text: string; dueDate: string | null; hasDueTime: boolean; completed: boolean; starred: boolean; workspace?: string }> = [];
  const todos = database.collections.get<TodoModel>('todos');
  const rows = await todos.query().fetch();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayKey = toLocalYmd(todayStart);
  const dayCheck = (d?: Date | null) => {
    if (!dayStr) return true;
    if (!d) return false;
    return toLocalYmd(d) === dayStr;
  };
  const rangeCheck = (d?: Date | null) => {
    if (!rangeFrom && !rangeTo) return true;
    if (!d) return false;
    const t = d.getTime();
    if (rangeFrom && t < rangeFrom.getTime()) return false;
    if (rangeTo && t > rangeTo.getTime()) return false;
    return true;
  };
  const overdueCheck = (d?: Date | null) => {
    if (!overdueOnly) return true;
    if (!d) return false;
    return d.getTime() < todayStart.getTime();
  };
  for (const row of rows) {
    if (typeof workspace === 'string' && row.workspace !== workspace) continue;
    if (typeof completed === 'boolean' && !!row.completed !== completed) continue;
    if (typeof starred === 'boolean' && !!row.starred !== starred) continue;
    const d = row.dueDate ? new Date(row.dueDate) : null;
    if (!dayCheck(d)) continue;
    if (!rangeCheck(d)) continue;
    if (!overdueCheck(d)) continue;
    if (textContains && !normalize(row.text).includes(textContains)) continue;
    matchingItems.push({
      id: String(row.id),
      text: row.text,
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
      hasDueTime: !!row.hasDueTime,
      completed: !!row.completed,
      starred: !!row.starred,
      workspace: row.workspace,
    });
  }
  matchingItems.sort((left, right) => {
    const leftDate = left.dueDate ? new Date(left.dueDate) : null;
    const rightDate = right.dueDate ? new Date(right.dueDate) : null;

    const bucketFor = (date: Date | null) => {
      if (!date || isNaN(date.getTime())) return 3;
      const dateKey = toLocalYmd(date);
      if (dateKey === todayKey) return 0;
      if (date.getTime() < todayStart.getTime()) return 1;
      return 2;
    };

    const leftBucket = bucketFor(leftDate);
    const rightBucket = bucketFor(rightDate);
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;

    const leftTime = leftDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightTime = rightDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

    if (leftBucket === 1) return rightTime - leftTime;
    if (leftBucket === 0 || leftBucket === 2) return leftTime - rightTime;
    return left.text.localeCompare(right.text);
  });

  return { items: matchingItems.slice(0, limit) };
};

const todo_delete_by_day: ToolHandler = async (args: any) => {
  const day = parseDayInput(args?.date);
  if (!day) return { deleted: 0, deletedItems: [] };
  const deletedItems: Array<{ id: string; text: string }> = [];
  const todos = database.collections.get<TodoModel>('todos');
  const all = await todos.query().fetch();
  const idsToDelete: string[] = [];
  for (const row of all) {
    const dd = row.dueDate ? new Date(row.dueDate) : null;
    if (dd && toLocalYmd(dd) === day) {
      deletedItems.push({ id: String(row.id), text: row.text });
      idsToDelete.push(String(row.id));
    }
  }
  if (idsToDelete.length) {
    await deleteTodos(idsToDelete);
  }
  const deleted = idsToDelete.length;
  return { deleted, deletedItems };
};

const todo_delete_by_day_except: ToolHandler = async (args: any) => {
  const day = parseDayInput(args?.date);
  const exceptItems = Array.isArray(args?.except) ? args.except : [];
  if (!day) return { deleted: 0, deletedItems: [], keptItems: [] };

  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const keepIds = new Set(exceptItems.map((item: any) => String(item?.id || '')).filter(Boolean));
  const keepTexts = new Set(exceptItems.map((item: any) => normalize(item?.text)).filter(Boolean));
  const deletedItems: Array<{ id: string; text: string }> = [];
  const keptItems: Array<{ id: string; text: string }> = [];
  const todos = database.collections.get<TodoModel>('todos');
  const all = await todos.query().fetch();
  const idsToDelete: string[] = [];

  for (const row of all) {
    const dueDate = row.dueDate ? new Date(row.dueDate) : null;
    if (!dueDate || toLocalYmd(dueDate) !== day) continue;

    const rowId = String(row.id);
    const rowText = normalize(row.text);
    if (keepIds.has(rowId) || keepTexts.has(rowText)) {
      keptItems.push({ id: rowId, text: row.text });
      continue;
    }

    deletedItems.push({ id: rowId, text: row.text });
    idsToDelete.push(rowId);
  }

  if (idsToDelete.length) {
    await deleteTodos(idsToDelete);
  }

  return { deleted: idsToDelete.length, deletedItems, keptItems };
};

const todo_complete_by_day: ToolHandler = async (args: any) => {
  const day = parseDayInput(args?.date);
  if (!day) return { completed: 0 };
  const todos = database.collections.get<TodoModel>('todos');
  const all = await todos.query().fetch();
  const updates: Parameters<typeof updateTodos>[0] = [];
  for (const row of all) {
    const dd = row.dueDate ? new Date(row.dueDate) : null;
    if (dd && toLocalYmd(dd) === day) {
      updates.push({ id: String(row.id), input: { completed: true }, options: { syncReminder: true } });
    }
  }
  if (updates.length) {
    await updateTodos(updates);
  }
  const completed = updates.length;
  return { completed };
};

export const todoToolHandlers: Record<string, ToolHandler> = {
  'todo.create_many': todo_create_many,
  'todo_create_many': todo_create_many,
  'todo.delete_many': todo_delete_many,
  'todo_delete_many': todo_delete_many,
  'todo.complete_many': todo_complete_many,
  'todo_complete_many': todo_complete_many,
  'todo.edit_many': todo_edit_many,
  'todo_edit_many': todo_edit_many,
  'todo.star_toggle_many': todo_star_toggle_many,
  'todo_star_toggle_many': todo_star_toggle_many,
  'todo_query': todo_query,
  'todo_delete_by_day': todo_delete_by_day,
  'todo_delete_by_day_except': todo_delete_by_day_except,
  'todo_complete_by_day': todo_complete_by_day,
};
