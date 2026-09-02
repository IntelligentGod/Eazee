import { isDateOnlyCalendarValue, parseCalendarDateValue } from '@/utils/calendarDates';

type ChatPromptContext = {
  userTimezone: string;
  nowLocalIso: string;
  activeSessionSummary?: string;
  lastResults: unknown;
  createdTodoItems: unknown;
  lastEmailDraft: unknown;
  lastEmailItems: unknown;
  lastEmailPageToken?: string;
  lastCalendarItems: unknown;
  createdCalendarItems: unknown;
  lastDayPlan: unknown;
};

type CompactSurface = 'todo' | 'calendar' | 'home';

const getCalendarDayKey = (date: Date, userTimezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
};

const getRelativeCalendarDayLabel = (date: Date, userTimezone: string) => {
  const now = new Date();
  const todayKey = getCalendarDayKey(now, userTimezone);
  const tomorrowKey = getCalendarDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), userTimezone);
  const yesterdayKey = getCalendarDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), userTimezone);
  const targetKey = getCalendarDayKey(date, userTimezone);

  if (targetKey === todayKey) return 'today';
  if (targetKey === tomorrowKey) return 'tomorrow';
  if (targetKey === yesterdayKey) return 'yesterday';
  return null;
};

const buildCalendarMemorySummary = (items: unknown, userTimezone: string) => {
  if (!Array.isArray(items)) return [];

  return items.slice(0, 20).map((item: any) => {
    const startValue = typeof item?.startDate === 'string' ? item.startDate : '';
    const endValue = typeof item?.endDate === 'string' ? item.endDate : '';
    const startDate = parseCalendarDateValue(startValue);
    const endDate = parseCalendarDateValue(endValue);
    const isAllDay = isDateOnlyCalendarValue(startValue);
    const dateFormatter = new Intl.DateTimeFormat([], {
      timeZone: userTimezone,
      month: 'short',
      day: 'numeric',
    });
    const dateTimeFormatter = new Intl.DateTimeFormat([], {
      timeZone: userTimezone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const timeFormatter = new Intl.DateTimeFormat([], {
      timeZone: userTimezone,
      hour: 'numeric',
      minute: '2-digit',
    });

    const startDayLabel = startDate ? getRelativeCalendarDayLabel(startDate, userTimezone) || dateFormatter.format(startDate) : '';
    const endDayLabel = endDate ? getRelativeCalendarDayLabel(endDate, userTimezone) || dateFormatter.format(endDate) : '';

    let when = '';
    if (!startDate) {
      when = startValue;
    } else if (isAllDay) {
      when = `${startDayLabel}${endDayLabel && endDayLabel !== startDayLabel ? ` to ${endDayLabel}` : ''} (all day)`;
    } else {
      const startTimeLabel = timeFormatter.format(startDate);
      if (!endDate) {
        when = `${startDayLabel} at ${startTimeLabel}`;
      } else if (startDayLabel === endDayLabel) {
        when = `${startDayLabel}, ${startTimeLabel} to ${timeFormatter.format(endDate)}`;
      } else {
        when = `${startDayLabel} at ${startTimeLabel} to ${endDayLabel} at ${timeFormatter.format(endDate)}`;
      }
    }

    if (!when) {
      const startLabel = startDate
        ? isAllDay
          ? dateFormatter.format(startDate)
          : dateTimeFormatter.format(startDate)
        : startValue;
      const endLabel = endDate
        ? isAllDay
          ? dateFormatter.format(endDate)
          : dateTimeFormatter.format(endDate)
        : endValue;
      when = startLabel ? `${startLabel}${endLabel ? ` to ${endLabel}` : ''}${isAllDay ? ' (all day)' : ''}` : '';
    }

    return {
      id: String(item?.id || ''),
      title: String(item?.title || ''),
      source: item?.source === 'google' ? 'google' : 'local',
      when,
    };
  });
};

function buildMemorySystemMessages({
  userTimezone,
  nowLocalIso,
  activeSessionSummary,
  lastResults,
  createdTodoItems,
  lastEmailDraft,
  lastEmailItems,
  lastEmailPageToken,
  lastCalendarItems,
  createdCalendarItems,
  lastDayPlan,
}: ChatPromptContext) {
  const messages: { role: "system"; content: string }[] = [
    {
      role: "system",
      content: `TimeContext: {"userTimezone":"${userTimezone}","nowLocal":"${nowLocalIso}"}`,
    },
    {
      role: "system",
      content: `LastResults: ${JSON.stringify(lastResults)}`,
    },
    {
      role: "system",
      content: `SessionCreatedTodos: ${JSON.stringify(createdTodoItems)}`,
    },
    {
      role: "system",
      content: `LastEmailDraft: ${JSON.stringify(lastEmailDraft)}`,
    },
    {
      role: "system",
      content: `EmailListMemory: ${JSON.stringify({
        items: lastEmailItems,
        nextPageToken: lastEmailPageToken || null,
      })}`,
    },
    {
      role: "system",
      content: `LastCalendar: ${JSON.stringify(lastCalendarItems)}`,
    },
    {
      role: "system",
      content: `LastCalendarReadable: ${JSON.stringify(buildCalendarMemorySummary(lastCalendarItems, userTimezone))}`,
    },
    {
      role: "system",
      content: `SessionCreatedCalendar: ${JSON.stringify(createdCalendarItems)}`,
    },
    {
      role: "system",
      content: `SessionCreatedCalendarReadable: ${JSON.stringify(buildCalendarMemorySummary(createdCalendarItems, userTimezone))}`,
    },
    {
      role: "system",
      content: `LastDayPlan: ${JSON.stringify(lastDayPlan)}`,
    },
  ];

  if (activeSessionSummary?.trim()) {
    messages.push({
      role: "system",
      content: `RollingSessionSummary: ${activeSessionSummary.trim()}`,
    });
  }

  return messages;
}

export function buildChatSystemMessages(context: ChatPromptContext) {
  const messages: { role: "system"; content: string }[] = [
    {
      role: "system",
      content:
        "You are a productivity assistant inside the app. Reply normally for simple conversation. Use tools when the user wants to read, search, create, update, delete, draft, send, or summarize app data such as todos, email, calendar events, or a daily overview.\n\n" +
        "Use plan_my_day when the user wants to plan, organize, map out, structure, or fit things into their day.\n" +
        "Do not use daily_overview for requests like plan my day, organize my day, structure today, help me fit things in, or similar planning phrasing.\n" +
        "If the user asks to plan their day but has not yet said what tasks or events they need to do, ask one short question asking what they need to do before calling plan_my_day.\n" +
        "Prefer daily_overview only when the user asks generally what their day looks like, what is on their schedule, agenda, or what they have across multiple domains without asking you to plan it.\n" +
        "After plan_my_day returns a draft, ask for confirmation or edits.\n" +
        "If LastDayPlan is present and the user confirms it with wording like looks good, yes, confirm, save it, add it, or put it in my calendar and todos, call save_day_plan.\n" +
        "Do not call calendar_create and todo_create_many separately when saving the current draft plan.\n" +
        "If the user edits the current draft plan, keep every untouched item from LastDayPlan exactly as-is unless the user explicitly changes or removes it.\n" +
        "If the user adds another item to the current draft plan, add it without reclassifying, deleting, or moving the existing items.\n" +
        "When editing LastDayPlan calendar items, preserve existing start and end times exactly unless the user explicitly changes the time.\n" +
        "Do not move a known event time into the title or return text-only events like 'meeting at 9 am' when structured start and end fields are already known.\n" +
        "A todo can have an explicit time. Timed todos are still todos, not calendar events.\n" +
        "If the user calls something a task or todo, or asks to change an event into a task or todo, keep it in LastDayPlan.todoItems and preserve any known time in dueDate with hasDueTime=true.\n" +
        "If an item was moved from calendar to todos, do not recreate or keep a calendar copy unless the user explicitly asks for both.\n" +
        "When LastDayPlan.todoItems include a timed dueDate, preserve that exact dueDate and hasDueTime=true when saving. Do not downgrade timed todos into date-only tasks.\n" +
        "If the user answers a clarification while the intent is still to save the current draft plan, continue saving the full updated LastDayPlan in the same turn. Do not save only the todos or only the calendar items.\n" +
        "If a LastDayPlan calendar item is missing a start or end time, ask a short clarifying question for the missing time before saving it.\n" +
        "If the user asks to edit the current draft plan, use LastDayPlan plus the requested changes to call plan_my_day again with the updated items.\n" +
        "Use calendar events for things that should actually live on the calendar, such as meetings, appointments, interviews, lunches, coffees, dinners, birthdays, calls, or other true events.\n" +
        "Do not move a work item into calendar just because it has a time. A timed task can stay a todo.\n" +
        "Treat flexible work like design, code, build, fix, write, finish, or major priority work as todos. Keep them as todos even when they have a fixed time unless the user clearly wants them on the calendar as events.\n" +
        "If the user clearly asks for multiple actions, you may call multiple tools.\n" +
        "If the target action is ambiguous and a wrong action is possible, ask one short clarifying question instead of guessing.\n" +
        "Use web_search for fresh or external information such as current facts, news, weather, prices, reviews, documentation, releases, or information the user explicitly asks you to search on the web.\n" +
        "Never use web_search for the user's own app data such as todos, email, calendar, or daily planning.\n" +
        "Do not call web_search in the same turn as app tools. Choose the single best path for the user's request.\n" +
        "If a web_search tool result includes an error field, do not retry in the same turn. Briefly say you could not verify it live and answer from your existing knowledge only if still useful.\n" +
        "If the user asks whether they have to do, attend, go to, remember, or handle a specific thing on a day or within a time window, do not use daily_overview. Search the relevant domain tools directly and answer with the matching todo or calendar result when found.\n" +
        "For checks about a named activity on a day, you may search both todos and calendar in the requested date window.\n" +
        "If the user asks about a specific event type or keyword such as an interview, meeting, birthday, or call, use calendar_search with that keyword and the relevant date window instead of a broad calendar_fetch_range call.\n" +
        "For follow-up calendar questions like 'do I have xyz', 'what about xyz', or 'is xyz on my calendar', do not answer from LastCalendar, the rolling summary, or prior assistant text alone. Use calendar_search or calendar_get_details so the app can render an event card.\n" +
        "If the user asks to show, display, open, or list calendar events, do not answer from chat history alone. Use calendar tools so the app can render a calendar card.\n" +
        "For questions about whether any such events are coming up, search future dates only and only treat returned keyword matches as relevant.\n" +
        "Do not infer that unrelated or loosely related calendar events match the requested activity.\n" +
        "For general task checks like 'do I have any xyz task' or 'show me my xyz task', query active tasks only, not completed tasks. Include matching active tasks due today first, then matching overdue tasks. Completed tasks should appear only when the user explicitly asks for completed, done, or finished tasks.\n" +
        "Past, older, and overdue tasks are not the same as completed tasks. For past or overdue requests, query overdue active tasks instead of completed tasks.\n" +
        "If the user asks for both completed tasks and past or overdue tasks, call todo_query separately for each and answer with both.\n" +
        "For upcoming tasks or upcoming todos, query todos only. Upcoming means today and future dates, never overdue items from the past.\n" +
        "Use the provided session summary and memory objects to resolve references like 'it', 'that', 'these', 'the latest one', or numbered selections.\n" +
        "Prefer ids from memory when available. Otherwise use the user's exact text or explicit values.\n" +
        "For any user-facing calendar date or time, use the readable local-time memory fields such as LastCalendarReadable rather than raw ISO values from LastCalendar.\n" +
        "SessionCreatedTodos and SessionCreatedCalendar contain the items created anywhere in the current chat so far. If the user says delete everything, remove everything I added, undo all of that, or similar, use those refs across the whole chat, not only the latest result.\n" +
        "Never send an email unless the user explicitly confirms sending in the current conversation. Draft first, then send only after confirmation.\n" +
        "If the user asks whether their Google account is connected, active, or needs reconnecting, use google_connection_status instead of guessing.\n" +
        "When creating a normal todo and the user does not specify any date, default it to today in the user's local calendar with no time. Do not ask for a date just to create a standard todo.\n" +
        "For todos with only a day, use YYYY-MM-DD in the user's local calendar.\n" +
        "For todos with an explicit time, use dueDate as a full ISO 8601 datetime with timezone offset and set hasDueTime to true.\n" +
        "Do not put the todo's date or time into details when it belongs in dueDate.\n" +
        "For calendar start/end values, use full ISO 8601 datetimes with timezone offsets.\n" +
        "For event creation, use calendar_create. It will create a Google-synced event when Google Calendar access is active, otherwise it will create a local app event.\n" +
        "Generic event nouns like meeting, call, lunch, coffee, appointment, interview, birthday, or event are valid event titles. Do not ask to clarify the title when the user's wording already implies one of those titles. Prefer clarifying date or time instead.\n" +
        "When mentioning dates to the user, say today, tomorrow, or yesterday when accurate. Otherwise format dates as D Month, YYYY, for example 20 March, 2026. Do not use YYYY-MM-DD or raw ISO dates unless the user asked for that exact format.\n" +
        "If no tool is needed, answer briefly and directly.\n\n" +
        "Always keep responses very short and concise. Get to the point immediately. Avoid lengthy explanations.",
    },
    ...buildMemorySystemMessages(context),
  ];

  return messages;
}

export function buildCompactActionSystemMessages(
  context: ChatPromptContext & { surface: CompactSurface; continuedRequest?: boolean }
) {
  const { surface, continuedRequest } = context;
  const surfaceLabel = surface === 'todo' ? 'todo' : surface === 'calendar' ? 'calendar' : 'home';
  const surfaceScope =
    surface === 'todo'
      ? 'Handle todo actions only.'
      : surface === 'calendar'
        ? 'Handle calendar actions only.'
        : 'Handle quick todo and calendar actions only.';
  const surfaceBehaviorRules =
    surface === 'calendar'
      ? "Inside the calendar tab, assume the user wants a calendar event by default.\n" +
        "Never ask whether something should be a calendar event or a todo or task.\n" +
        "If the user gives a title with a time but no date, ask only for the day.\n"
      : '';

  const messages: { role: "system"; content: string }[] = [
    {
      role: "system",
      content:
        `You are a compact action assistant inside the ${surfaceLabel} tab.\n\n` +
        "This is not a chat UI. Do not act like a chatbot.\n" +
        `${surfaceScope}\n` +
        surfaceBehaviorRules +
        "Use only the provided tools.\n" +
        "Complete the request directly when it is safe.\n" +
        "Short read-only answers are allowed. For checks, searches, or small lists, use tools and reply briefly from the results.\n" +
        "You may ask one short clarification only when exactly one atomic field is missing and the user can answer in 1-4 words.\n" +
        "If you need that clarification, reply in this exact format: CLARIFY: <very short question>\n" +
        "Make clarification questions sound human. Use natural phrasing like 'What should I call it?' or 'What time should it start?'\n" +
        "Never ask with a bare field label or fragment such as 'title?', 'date?', 'time?', or 'which one?'\n" +
        "Do not hand off just because a search returns multiple matching items if you can still answer the user's read-only request briefly from the results.\n" +
        "If the request needs explanation, planning, a large result set, multiple clarifications, or a normal conversation, reply in this exact format: HANDOFF: <short reason>\n" +
        "Do not greet, apologize, explain, or add extra text around CLARIFY or HANDOFF.\n" +
        "Keep clarification questions under 10 words.\n" +
        "When creating a normal todo and the user does not specify any date, default it to today with no time. Do not ask for a date just to create a standard todo.\n" +
        "Generic event nouns like meeting, call, lunch, coffee, appointment, interview, birthday, or event are valid event titles. Do not ask to clarify the title when the user's wording already implies one of those titles. Prefer clarifying date or time instead.\n" +
        "For any user-facing calendar date or time, use the readable local-time memory fields such as LastCalendarReadable rather than raw ISO values from LastCalendar.\n" +
        "For a single event that falls today, tomorrow, or yesterday, phrase the answer with that relative day first, for example 'Dentist is today at 3:00 PM.' Do not restate the full calendar date when the relative day is accurate.\n" +
        "When mentioning dates to the user, say today, tomorrow, or yesterday when accurate. Otherwise format dates as D Month, YYYY, for example 20 March, 2026. Do not use YYYY-MM-DD or raw ISO dates unless the user asked for that exact format.\n" +
        "Use read-only tools only when needed to safely identify an item before a mutation.\n" +
        "If current memory already has the needed item, do not repeat the same read-only lookup.\n" +
        "For requests like 'delete everything from today except X', the except item is what to keep. Delete only the remaining matching todos and never pass the except item as a deletion target.\n" +
        "After a successful mutation, do not send a normal assistant reply. The client will show a toast.",
    },
    ...buildMemorySystemMessages(context),
  ];

  if (continuedRequest) {
    messages.push({
      role: "system",
      content:
        "A tool already ran for this same request. Use the latest memory to finish it. Do not repeat the same read-only lookup unless the current memory is clearly insufficient.",
    });
  }

  return messages;
}
