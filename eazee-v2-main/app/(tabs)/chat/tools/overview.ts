import { Q } from '@nozbe/watermelondb';
import { database } from '../../../../database/database';
import TodoModel from '../../../../database/models/TodoModel';
import EventModel from '../../../../database/models/EventModel';
import { getAccessTokenStatic } from '@/app/context/TokenContext';
import type { ToolHandler } from './todo';
import { createTodoItems } from './todo';
import { createCalendarEvent } from './calendar';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { getTodoHasDueTime, parseTodoInput } from '@/utils/todoDates';
import { appendCreatedCalendarItems, appendCreatedTodoItems, getLastDayPlan, setLastCalendarItems, setLastQueryItems } from './memory';

const toLocalYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toIso = (d: Date | string): string => {
  const date = parseCalendarDateValue(d);
  return (date || new Date()).toISOString();
};

const EVENT_LIKE_RE = /\b(birthday|meeting|coffee|lunch|dinner|appointment|call|interview|event|hangout|doctor|dentist|breakfast|brunch|visit)\b/i;
const HIGH_PRIORITY_RE = /\b(major priority|top priority|highest priority|urgent|important|priority)\b/i;
const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;
const TIME_TOKEN_RE = '(?:[1-9]|1[0-2])(?::[0-5]\\d)?\\s*(?:am|pm)|(?:[01]?\\d|2[0-3]):[0-5]\\d';
const EVENT_TIME_RANGE_RE = new RegExp(`\\b(?:from\\s+|at\\s+)?(${TIME_TOKEN_RE})\\s*(?:-|to|until)\\s*(${TIME_TOKEN_RE})\\b`, 'i');

const normalizeText = (value?: unknown) => String(value || '').trim();

const parseIsoInput = (value?: unknown) => {
  const parsed = typeof value === 'string' || value instanceof Date ? parseCalendarDateValue(value) : null;
  if (!parsed) return undefined;
  return parsed.toISOString();
};

const normalizePlanDate = (value?: unknown) => {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return toLocalYmd(parsed);
  }
  return toLocalYmd(new Date());
};

const normalizePriority = (value: unknown, text: string) => {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return HIGH_PRIORITY_RE.test(text) ? 'high' : 'medium';
};

const priorityRank = (value: 'low' | 'medium' | 'high') => {
  if (value === 'high') return 0;
  if (value === 'medium') return 1;
  return 2;
};

const cleanPlanTitle = (value: string, start: number, end: number) =>
  `${value.slice(0, start)} ${value.slice(end)}`
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s*[-,:]\s*$/, '')
    .trim();

const parsePlanEventRange = (value: string, fallbackDate: Date) => {
  const match = EVENT_TIME_RANGE_RE.exec(value);
  if (!match) return null;

  const startDate = parseTodoInput(match[1], { fallbackDate }).dueDate;
  const endDate = parseTodoInput(match[2], { fallbackDate }).dueDate;
  if (!startDate || !endDate) return null;

  if (endDate.getTime() <= startDate.getTime()) {
    endDate.setDate(endDate.getDate() + 1);
  }

  const matchStart = match.index ?? 0;
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    cleanedText: cleanPlanTitle(value, matchStart, matchStart + match[0].length),
  };
};

const resolvePlanTodo = ({
  date,
  item,
  text,
  details,
  start,
}: {
  date: string;
  item: any;
  text: string;
  details?: string;
  start?: string;
}) => {
  const fallbackDate = parseCalendarDateValue(date) || new Date();
  const rawDueDate = parseCalendarDateValue(item?.dueDate);

  if (rawDueDate) {
    return {
      text,
      dueDate: rawDueDate.toISOString(),
      hasDueTime: getTodoHasDueTime(rawDueDate, typeof item?.hasDueTime === 'boolean' ? item.hasDueTime : undefined),
    };
  }

  if (start) {
    const startDate = new Date(start);
    return {
      text,
      dueDate: startDate.toISOString(),
      hasDueTime: getTodoHasDueTime(startDate),
    };
  }

  for (const candidate of [item?.time, item?.dueTime]) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const parsed = parseTodoInput(candidate, { fallbackDate });
    if (parsed.dueDate) {
      return {
        text,
        dueDate: parsed.dueDate.toISOString(),
        hasDueTime: parsed.hasDueTime,
      };
    }
  }

  const parsedText = parseTodoInput(text, { fallbackDate });
  if (parsedText.dueDate) {
    return {
      text: parsedText.cleanedText || text,
      dueDate: parsedText.dueDate.toISOString(),
      hasDueTime: parsedText.hasDueTime,
    };
  }

  if (details) {
    const parsedDetails = parseTodoInput(details, { fallbackDate });
    if (parsedDetails.dueDate) {
      return {
        text,
        dueDate: parsedDetails.dueDate.toISOString(),
        hasDueTime: parsedDetails.hasDueTime,
      };
    }
  }

  return {
    text,
    dueDate: normalizePlanDate(item?.dueDate || date),
    hasDueTime: false,
  };
};

const resolvePlanCalendarItem = ({
  date,
  item,
  text,
  details,
  start,
  end,
  location,
}: {
  date: string;
  item: any;
  text: string;
  details?: string;
  start?: string;
  end?: string;
  location?: string;
}) => {
  const fallbackDate = parseCalendarDateValue(date) || new Date();
  let title = text;
  let resolvedStart = start;
  let resolvedEnd = end;

  if (!resolvedStart || !resolvedEnd) {
    for (const candidate of [
      { value: normalizeText(item?.time), cleanTitle: false },
      { value: normalizeText(item?.dueTime), cleanTitle: false },
      { value: text, cleanTitle: true },
      { value: details || '', cleanTitle: false },
    ]) {
      if (!candidate.value) continue;
      const parsedRange = parsePlanEventRange(candidate.value, fallbackDate);
      if (!parsedRange) continue;
      resolvedStart = resolvedStart || parsedRange.start;
      resolvedEnd = resolvedEnd || parsedRange.end;
      if (candidate.cleanTitle && parsedRange.cleanedText) {
        title = parsedRange.cleanedText;
      }
      break;
    }
  }

  if (!resolvedStart) {
    for (const candidate of [
      { value: normalizeText(item?.time), cleanTitle: false },
      { value: normalizeText(item?.dueTime), cleanTitle: false },
      { value: text, cleanTitle: true },
      { value: details || '', cleanTitle: false },
    ]) {
      if (!candidate.value) continue;
      const parsed = parseTodoInput(candidate.value, { fallbackDate });
      if (!parsed.dueDate) continue;
      resolvedStart = parsed.dueDate.toISOString();
      if (candidate.cleanTitle && parsed.cleanedText) {
        title = parsed.cleanedText;
      }
      break;
    }
  }

  if (!resolvedEnd && resolvedStart) {
    resolvedEnd = new Date(new Date(resolvedStart).getTime() + DEFAULT_EVENT_DURATION_MS).toISOString();
  }

  return {
    title: title || text,
    start: resolvedStart,
    end: resolvedEnd,
    location,
    details,
  };
};

const plan_my_day: ToolHandler = async (args: any) => {
  const date = normalizePlanDate(args?.date);
  const rawItems = Array.isArray(args?.items) ? args.items : [];
  const previousPlan = getLastDayPlan();
  const previousCalendarItems = Array.isArray(previousPlan?.calendarItems) ? previousPlan.calendarItems : [];
  const previousTodoItems = Array.isArray(previousPlan?.todoItems) ? previousPlan.todoItems : [];
  const calendarItems: Array<{
    title: string;
    start?: string;
    end?: string;
    location?: string;
    details?: string;
  }> = [];
  const todoItems: Array<{
    text: string;
    dueDate: string;
    hasDueTime: boolean;
    details?: string;
    starred: boolean;
    priority: 'low' | 'medium' | 'high';
  }> = [];

  for (const item of rawItems) {
    const text = normalizeText(item?.text);
    if (!text) continue;
    const details = normalizeText(item?.details) || undefined;
    const combinedText = `${text} ${details || ''}`.trim();
    const start = parseIsoInput(item?.start);
    const end = parseIsoInput(item?.end);
    const location = normalizeText(item?.location) || undefined;
    const explicitType = item?.type === 'event' || item?.type === 'task' ? item.type : undefined;
    const isCalendarItem = explicitType === 'event'
      ? true
      : explicitType === 'task'
        ? false
        : (!!start || !!end) || EVENT_LIKE_RE.test(combinedText);

    if (isCalendarItem) {
      calendarItems.push(resolvePlanCalendarItem({ date, item, text, details, start, end, location }));
      continue;
    }

    const priority = normalizePriority(item?.priority, combinedText);
    const todo = resolvePlanTodo({ date, item, text, details, start });
    todoItems.push({
      text: todo.text,
      dueDate: todo.dueDate,
      hasDueTime: todo.hasDueTime,
      details,
      starred: priority === 'high',
      priority,
    });
  }

  calendarItems.sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  todoItems.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

  if (previousPlan?.date === date && previousCalendarItems.length === calendarItems.length) {
    for (let index = 0; index < calendarItems.length; index += 1) {
      const previousItem = previousCalendarItems[index];
      const nextItem = calendarItems[index];
      if (!previousItem || !nextItem) continue;

      if (!nextItem.start && previousItem.start) {
        nextItem.start = previousItem.start;
      }

      if (!nextItem.end) {
        if (nextItem.start === previousItem.start && previousItem.end) {
          nextItem.end = previousItem.end;
        } else if (nextItem.start && previousItem.start && previousItem.end) {
          const previousDuration = new Date(previousItem.end).getTime() - new Date(previousItem.start).getTime();
          const duration = previousDuration > 0 ? previousDuration : DEFAULT_EVENT_DURATION_MS;
          nextItem.end = new Date(new Date(nextItem.start).getTime() + duration).toISOString();
        } else if (previousItem.end) {
          nextItem.end = previousItem.end;
        }
      }
    }
  }

  if (previousPlan?.date === date && previousTodoItems.length === todoItems.length) {
    for (let index = 0; index < todoItems.length; index += 1) {
      const previousItem = previousTodoItems[index];
      const nextItem = todoItems[index];
      if (!previousItem?.hasDueTime || !nextItem || nextItem.hasDueTime) continue;
      nextItem.dueDate = previousItem.dueDate;
      nextItem.hasDueTime = true;
    }
  }

  return {
    date,
    calendarItems,
    todoItems,
  };
};

const save_day_plan: ToolHandler = async () => {
  const plan = getLastDayPlan();
  if (!plan) {
    throw new Error('NO_DAY_PLAN');
  }

  const rawCalendarItems = Array.isArray(plan.calendarItems) ? plan.calendarItems : [];
  const rawTodoItems = Array.isArray(plan.todoItems) ? plan.todoItems : [];

  for (const item of rawCalendarItems) {
    if (!item?.start || !item?.end) {
      throw new Error('DAY_PLAN_TIME_REQUIRED');
    }
  }

  const createdCalendarItems: Array<{
    id: string;
    title: string;
    startDate: string;
    endDate?: string;
    source: 'local' | 'google';
    location?: string;
  }> = [];

  for (const item of rawCalendarItems) {
    const result = await createCalendarEvent({
      title: item.title,
      start: item.start,
      end: item.end,
      location: item.location,
    });

    if (result?.item) {
      createdCalendarItems.push({
        id: String(result.item.id || ''),
        title: String(result.item.title || ''),
        startDate: String(result.item.startDate || item.start || ''),
        endDate: typeof result.item.endDate === 'string' ? result.item.endDate : item.end,
        source: result.item.source === 'google' ? 'google' : 'local',
        location: typeof result.item.location === 'string' ? result.item.location : item.location,
      });
    }
  }

  const todoResult = await createTodoItems(rawTodoItems);
  const createdTodoItems = Array.isArray(todoResult?.createdItems) ? todoResult.createdItems : [];

  if (createdCalendarItems.length) {
    setLastCalendarItems(createdCalendarItems);
    appendCreatedCalendarItems(createdCalendarItems);
  }

  if (createdTodoItems.length) {
    const trackedTodos = createdTodoItems.map((item: any) => ({
      id: String(item.id || ''),
      text: String(item.text || ''),
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : null,
      hasDueTime: typeof item.hasDueTime === 'boolean' ? item.hasDueTime : undefined,
      completed: false,
      starred: typeof item.starred === 'boolean' ? item.starred : false,
      workspace: typeof item.workspace === 'string' ? item.workspace : undefined,
    }));
    setLastQueryItems(trackedTodos);
    appendCreatedTodoItems(trackedTodos);
  }

  return {
    saved: true,
    date: plan.date,
    calendarItems: createdCalendarItems.map((item) => ({
      title: item.title,
      start: item.startDate,
      end: item.endDate,
      location: item.location,
    })),
    todoItems: createdTodoItems.map((item: any, index: number) => ({
      text: String(item.text || rawTodoItems[index]?.text || ''),
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : String(rawTodoItems[index]?.dueDate || ''),
      hasDueTime: typeof item.hasDueTime === 'boolean' ? item.hasDueTime : !!rawTodoItems[index]?.hasDueTime,
      details: typeof rawTodoItems[index]?.details === 'string' ? rawTodoItems[index].details : undefined,
      starred: typeof item.starred === 'boolean' ? item.starred : !!rawTodoItems[index]?.starred,
      priority: rawTodoItems[index]?.priority === 'low' || rawTodoItems[index]?.priority === 'medium' || rawTodoItems[index]?.priority === 'high'
        ? rawTodoItems[index].priority
        : 'medium',
    })),
  };
};

async function fetchGoogleEventsRange(start: Date, end: Date) {
  const token = await getAccessTokenStatic();
  if (!token) return [];
  const timeMin = start.toISOString();
  const timeMax = end.toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!resp.ok) return [];
    const data: any = await resp.json().catch(() => ({}));
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    return items.map((item: any) => ({
      id: String(item.id),
      title: String(item.summary || ''),
      startDate: parseCalendarDateValue(item.start?.dateTime || item.start?.date) || new Date(),
      endDate: parseCalendarDateValue(item.end?.dateTime || item.end?.date) || new Date(),
      source: 'google' as const,
      location: typeof item.location === 'string' ? item.location : undefined,
      isAllDay: !!(item.start?.date && !item.start?.dateTime),
    }));
  } catch {
    return [];
  }
}

function extractHeader(headers: any[], name: string): string {
  const h = headers?.find((hdr: any) => String(hdr.name || '').toLowerCase() === name.toLowerCase());
  return String(h?.value || '');
}

async function fetchLatestEmails(limit: number, token: string) {
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}`;
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return [];
    const list: any = await resp.json();
    const ids = Array.isArray(list?.messages) ? list.messages.slice(0, limit).map((m: any) => String(m.id)) : [];
    const emails: Array<{ id: string; subject: string; from: string; snippet?: string; date?: string }> = [];
    for (const id of ids) {
      try {
        const msgResp = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!msgResp.ok) continue;
        const data: any = await msgResp.json();
        const headers = Array.isArray(data?.payload?.headers) ? data.payload.headers : [];
        emails.push({
          id: String(data?.id || id),
          subject: extractHeader(headers, 'Subject') || 'No Subject',
          from: extractHeader(headers, 'From') || 'Unknown Sender',
          snippet: String(data?.snippet || ''),
          date: extractHeader(headers, 'Date') || undefined,
        });
      } catch {}
    }
    return emails;
  } catch {
    return [];
  }
}

const daily_overview: ToolHandler = async (args: any) => {
  const dateArg = typeof args?.date === 'string' ? args.date : undefined;
  const now = new Date();
  let targetDate: Date;
  
  if (dateArg) {
    const parsed = new Date(dateArg);
    targetDate = isNaN(parsed.getTime()) ? now : parsed;
  } else {
    targetDate = now;
  }
  
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);
  const dayStr = toLocalYmd(targetDate);

  const todosPromise = (async () => {
    const todos = database.collections.get<TodoModel>('todos');
    const rows = await todos.query().fetch();
    return rows
      .filter((row) => {
        if (row.completed) return false;
        const d = row.dueDate ? new Date(row.dueDate) : null;
        if (!d) return false;
        return toLocalYmd(d) === dayStr;
      })
      .slice(0, 20)
      .map((row) => ({
        id: String(row.id),
        text: row.text,
        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
        completed: !!row.completed,
        starred: !!row.starred,
        workspace: row.workspace,
      }));
  })();

  const calendarPromise = (async () => {
    const localPromise = database.collections
      .get<EventModel>('events')
      .query(Q.where('start_date', Q.between(dayStart.getTime(), dayEnd.getTime())))
      .fetch() as Promise<EventModel[]>;

    const [localEvents, googleEvents] = await Promise.all([localPromise, fetchGoogleEventsRange(dayStart, dayEnd)]);

    const byGoogleId: Record<string, any> = Object.create(null);
    for (const ge of googleEvents) byGoogleId[ge.id] = ge;

    const items: Array<{
      id: string;
      title: string;
      startDate: string;
      endDate: string;
      source: 'local' | 'google';
      location?: string;
      isAllDay?: boolean;
    }> = [];

    for (const le of localEvents as any[]) {
      const ge = le.googleEventId ? byGoogleId[le.googleEventId] : undefined;
      items.push({
        id: String(le.id),
        title: String(ge?.title || le.title || ''),
        startDate: toIso(ge?.startDate || le.startDate),
        endDate: toIso(ge?.endDate || le.endDate),
        source: 'local',
        location: le.location || ge?.location || undefined,
        isAllDay: ge?.isAllDay === true,
      });
    }

    for (const ge of googleEvents) {
      const matched = (localEvents as any[]).some((le) => le.googleEventId === ge.id);
      if (matched) continue;
      items.push({
        id: String(ge.id),
        title: String(ge.title || ''),
        startDate: toIso(ge.startDate),
        endDate: toIso(ge.endDate),
        source: 'google',
        location: ge.location || undefined,
        isAllDay: ge.isAllDay === true,
      });
    }

    items.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return items;
  })();

  const emailsPromise = (async () => {
    const token = await getAccessTokenStatic();
    if (!token) return [];
    return fetchLatestEmails(5, token);
  })();

  const [todos, calendar, emails] = await Promise.all([todosPromise, calendarPromise, emailsPromise]);

  return {
    date: dayStr,
    todos,
    calendar,
    emails,
  };
};

export const overviewToolHandlers: Record<string, ToolHandler> = {
  plan_my_day,
  save_day_plan,
  daily_overview,
};
