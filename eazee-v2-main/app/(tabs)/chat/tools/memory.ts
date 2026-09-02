import type { ToolMemory } from './types';

const memory: ToolMemory = {
  lastQueryItems: [],
  createdTodoItems: [],
  lastEmailItems: [],
  lastCalendarItems: [],
  createdCalendarItems: [],
  lastEmailDraft: null,
  lastEmailPageToken: null,
  lastDayPlan: null,
};

const todoMemoryKey = (item: { id?: string; text?: string; dueDate?: string | null; workspace?: string }) =>
  item.id || `${String(item.text || '').trim().toLowerCase()}|${item.dueDate || ''}|${String(item.workspace || '').trim().toLowerCase()}`;

const calendarMemoryKey = (item: { id?: string; source?: 'local' | 'google' }) =>
  `${item.source || 'local'}|${item.id || ''}`;

export function getToolMemory(): ToolMemory {
  return memory;
}

export function getLastQueryItems() {
  return memory.lastQueryItems;
}
export function setLastQueryItems(items: ToolMemory['lastQueryItems']) {
  memory.lastQueryItems = Array.isArray(items) ? items : [];
}
export function removeLastQueryItems(items: Array<{ id?: string; text?: string; dueDate?: string | null; workspace?: string }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(todoMemoryKey));
  if (!targets.size) return;
  memory.lastQueryItems = memory.lastQueryItems.filter((item) => !targets.has(todoMemoryKey(item)));
}

export function getCreatedTodoItems() {
  return memory.createdTodoItems;
}
export function appendCreatedTodoItems(items: ToolMemory['createdTodoItems']) {
  const nextItems = Array.isArray(items) ? items : [];
  if (!nextItems.length) return;
  const incomingKeys = new Set(nextItems.map(todoMemoryKey));
  memory.createdTodoItems = [
    ...memory.createdTodoItems.filter((item) => !incomingKeys.has(todoMemoryKey(item))),
    ...nextItems,
  ].slice(-100);
}
export function updateCreatedTodoItems(items: ToolMemory['createdTodoItems']) {
  const nextItems = Array.isArray(items) ? items : [];
  if (!nextItems.length) return;
  const updates = new Map(nextItems.map((item) => [todoMemoryKey(item), item]));
  memory.createdTodoItems = memory.createdTodoItems.map((item) => updates.get(todoMemoryKey(item)) || item);
}
export function removeCreatedTodoItems(items: Array<{ id?: string; text?: string; dueDate?: string | null; workspace?: string }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(todoMemoryKey));
  if (!targets.size) return;
  memory.createdTodoItems = memory.createdTodoItems.filter((item) => !targets.has(todoMemoryKey(item)));
}

export function getLastEmailItems() {
  return memory.lastEmailItems;
}
export function appendLastEmailItems(items: ToolMemory['lastEmailItems']) {
  const prev = Array.isArray(memory.lastEmailItems) ? memory.lastEmailItems : [];
  const next = Array.isArray(items) ? items : [];
  memory.lastEmailItems = [...prev, ...next].slice(-100);
}
export function setLastEmailItems(items: ToolMemory['lastEmailItems']) {
  memory.lastEmailItems = Array.isArray(items) ? items : [];
}

export function getLastCalendarItems() {
  return memory.lastCalendarItems;
}
export function setLastCalendarItems(items: ToolMemory['lastCalendarItems']) {
  memory.lastCalendarItems = Array.isArray(items) ? items : [];
}
export function removeLastCalendarItems(items: Array<{ id?: string; source?: 'local' | 'google' }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(calendarMemoryKey));
  if (!targets.size) return;
  memory.lastCalendarItems = memory.lastCalendarItems.filter((item) => !targets.has(calendarMemoryKey(item)));
}
export function appendLastCalendarItems(items: ToolMemory['lastCalendarItems']) {
  const prev = Array.isArray(memory.lastCalendarItems) ? memory.lastCalendarItems : [];
  const next = Array.isArray(items) ? items : [];
  memory.lastCalendarItems = [...prev, ...next].slice(-200);
}

export function getCreatedCalendarItems() {
  return memory.createdCalendarItems;
}
export function appendCreatedCalendarItems(items: ToolMemory['createdCalendarItems']) {
  const nextItems = Array.isArray(items) ? items : [];
  if (!nextItems.length) return;
  const incomingKeys = new Set(nextItems.map(calendarMemoryKey));
  memory.createdCalendarItems = [
    ...memory.createdCalendarItems.filter((item) => !incomingKeys.has(calendarMemoryKey(item))),
    ...nextItems,
  ].slice(-100);
}
export function updateCreatedCalendarItems(items: ToolMemory['createdCalendarItems']) {
  const nextItems = Array.isArray(items) ? items : [];
  if (!nextItems.length) return;
  const updates = new Map(nextItems.map((item) => [calendarMemoryKey(item), item]));
  memory.createdCalendarItems = memory.createdCalendarItems.map((item) => updates.get(calendarMemoryKey(item)) || item);
}
export function removeCreatedCalendarItems(items: Array<{ id?: string; source?: 'local' | 'google' }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(calendarMemoryKey));
  if (!targets.size) return;
  memory.createdCalendarItems = memory.createdCalendarItems.filter((item) => !targets.has(calendarMemoryKey(item)));
}

export function getLastEmailDraft() {
  return memory.lastEmailDraft;
}
export function setLastEmailDraft(draft: ToolMemory['lastEmailDraft']) {
  memory.lastEmailDraft = draft || null;
}

export function getLastEmailPageToken() {
  return memory.lastEmailPageToken;
}
export function setLastEmailPageToken(token: string | null) {
  memory.lastEmailPageToken = token || null;
}

export function getLastDayPlan() {
  return memory.lastDayPlan;
}
export function setLastDayPlan(plan: ToolMemory['lastDayPlan']) {
  memory.lastDayPlan = plan || null;
}

export function resetToolMemory() {
  memory.lastQueryItems = [];
  memory.createdTodoItems = [];
  memory.lastEmailItems = [];
  memory.lastCalendarItems = [];
  memory.createdCalendarItems = [];
  memory.lastEmailDraft = null;
  memory.lastEmailPageToken = null;
  memory.lastDayPlan = null;
}
