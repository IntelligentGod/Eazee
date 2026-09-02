import { Q } from '@nozbe/watermelondb';
import { database } from '../../../../database/database';
import EventModel from '../../../../database/models/EventModel';
import { getAccessTokenStatic, getGoogleConnectionStatusStatic } from '@/app/context/TokenContext';
import type { ToolHandler } from './todo';
import { formatCalendarDateOnly, parseCalendarDateValue } from '@/utils/calendarDates';

type SourceType = 'google' | 'local';

const toIso = (d: Date | string): string => {
  const date = parseCalendarDateValue(d);
  return (date || new Date()).toISOString();
};

const parseDate = (v?: any): Date | null => {
  return parseCalendarDateValue(v);
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const escapeSqlLike = (input: string) => input.replace(/[%_]/g, '\\$&');

const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

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
      isGoogleEvent: true as const,
      description: typeof item.description === 'string' ? item.description : undefined,
      location: typeof item.location === 'string' ? item.location : undefined,
      hangoutLink: typeof item.hangoutLink === 'string' ? item.hangoutLink : undefined,
      attendees: Array.isArray(item.attendees)
        ? item.attendees.map((a: any) => ({ email: String(a?.email || ''), responseStatus: a?.responseStatus }))
        : [],
      isAllDay: !!(item.start?.date && !item.start?.dateTime),
      editable:
        !!(item?.organizer?.self || item?.guestsCanModify) &&
        item?.status !== 'cancelled' &&
        item?.eventType !== 'outOfOffice',
    }));
  } catch {
    return [];
  }
}

async function fetchGoogleEventsSearch(query: string, start: Date, end: Date, maxResults = 50) {
  const token = await getAccessTokenStatic();
  if (!token || !query.trim()) return [];
  const params = new URLSearchParams({
    q: query,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;
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
      isGoogleEvent: true as const,
      description: typeof item.description === 'string' ? item.description : undefined,
      location: typeof item.location === 'string' ? item.location : undefined,
      hangoutLink: typeof item.hangoutLink === 'string' ? item.hangoutLink : undefined,
      attendees: Array.isArray(item.attendees)
        ? item.attendees.map((a: any) => ({ email: String(a?.email || ''), responseStatus: a?.responseStatus }))
        : [],
      isAllDay: !!(item.start?.date && !item.start?.dateTime),
      editable:
        !!(item?.organizer?.self || item?.guestsCanModify) &&
        item?.status !== 'cancelled' &&
        item?.eventType !== 'outOfOffice',
    }));
  } catch {
    return [];
  }
}

async function fetchGoogleEventDetail(eventId: string) {
  const token = await getAccessTokenStatic();
  if (!token) return null;
  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

const calendar_fetch_range: ToolHandler = async (args: any) => {
  const fromIso = typeof args?.from === 'string' ? args.from : undefined;
  const toIsoStr = typeof args?.to === 'string' ? args.to : undefined;
  const now = new Date();
  const start = parseDate(fromIso) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = parseDate(toIsoStr) || new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const localPromise = database.collections
    .get<EventModel>('events')
    .query(Q.where('start_date', Q.between(start.getTime(), end.getTime())))
    .fetch() as Promise<EventModel[]>;

  const [localEvents, googleEvents] = await Promise.all([localPromise, fetchGoogleEventsRange(start, end)]);

  const byGoogleId: Record<string, any> = Object.create(null);
  for (const ge of googleEvents) byGoogleId[ge.id] = ge;

  const items: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    source: SourceType;
    isAllDay?: boolean;
    location?: string;
    attendeesCount?: number;
    googleEventId?: string;
  }[] = [];

  for (const le of localEvents as any[]) {
    const ge = le.googleEventId ? byGoogleId[le.googleEventId] : undefined;
    const startDate = ge?.startDate ? ge.startDate : le.startDate;
    const endDate = ge?.endDate ? ge.endDate : le.endDate;
    const title = ge?.title && ge.title !== le.title ? ge.title : le.title || '';
    items.push({
      id: String(le.id),
      title: String(title || ''),
      startDate: toIso(startDate),
      endDate: toIso(endDate),
      source: 'local',
      isAllDay: ge?.isAllDay === true,
      location: le.location || ge?.location || undefined,
      attendeesCount: Array.isArray(ge?.attendees) ? ge.attendees.length : undefined,
      googleEventId: typeof le.googleEventId === 'string' ? String(le.googleEventId) : undefined,
    });
  }

  for (const ge of googleEvents as any[]) {
    const matched = (localEvents as any[]).some((le) => le.googleEventId === ge.id);
    if (matched) continue;
    items.push({
      id: String(ge.id),
      title: String(ge.title || ''),
      startDate: toIso(ge.startDate),
      endDate: toIso(ge.endDate),
      source: 'google',
      isAllDay: ge.isAllDay === true,
      location: ge.location || undefined,
      attendeesCount: Array.isArray(ge.attendees) ? ge.attendees.length : undefined,
    });
  }

  // refer local entries when both local and google refer to the same Google event id
  const seen = new Set<string>();
  const deduped: typeof items = [];
  for (const it of items) {
    const key = it.source === 'google' ? it.id : (it.googleEventId || it.id);
    if (seen.has(String(key))) continue;
    seen.add(String(key));
    deduped.push(it);
  }

  deduped.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return { items: deduped, range: { from: toIso(start), to: toIso(end) } };
};

const calendar_search: ToolHandler = async (args: any) => {
  const queryRaw = typeof args?.query === 'string' ? args.query.trim() : '';
  if (!queryRaw) throw new Error('MISSING_QUERY');
  const limitRaw = typeof args?.limit === 'number' ? args.limit : Number(args?.limit);
  const limit = clampNumber(isNaN(limitRaw) ? 25 : limitRaw, 1, 100);
  const sourceFilter: SourceType | 'all' = args?.source === 'google' ? 'google' : args?.source === 'local' ? 'local' : 'all';
  const fromIso = typeof args?.from === 'string' ? args.from : undefined;
  const toIsoStr = typeof args?.to === 'string' ? args.to : undefined;
  const now = new Date();
  const defaultFrom = (() => {
    const explicit = parseDate(fromIso);
    if (explicit) return explicit;
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return d;
  })();
  const defaultTo = (() => {
    const explicit = parseDate(toIsoStr);
    if (explicit) return explicit;
    const d = new Date(defaultFrom);
    d.setMonth(d.getMonth() + 6);
    return d;
  })();
  if (defaultTo.getTime() < defaultFrom.getTime()) {
    defaultTo.setTime(defaultFrom.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  const like = `%${escapeSqlLike(queryRaw)}%`;
  let localRows: EventModel[] = [];
  try {
    localRows = (await database.collections
      .get<EventModel>('events')
      .query(
        Q.where('start_date', Q.between(defaultFrom.getTime(), defaultTo.getTime())),
        Q.or(Q.where('title', Q.like(like)), Q.where('location', Q.like(like))),
        Q.sortBy('start_date', Q.asc)
      )
      .fetch()) as EventModel[];
  } catch {}

  const localItems = localRows.map((le) => ({
    id: String(le.id),
    title: String(le.title || ''),
    startDate: toIso(le.startDate),
    endDate: toIso(le.endDate),
    source: 'local' as const,
    isAllDay: false,
    location: le.location || undefined,
    attendeesCount: Array.isArray((le as any)?.attendees) ? (le as any).attendees.length : undefined,
    googleEventId: typeof le.googleEventId === 'string' ? String(le.googleEventId) : undefined,
  }));

  const linkedGoogleIds = new Set(localItems.map((it) => it.googleEventId).filter(Boolean) as string[]);
  const googleEvents = await fetchGoogleEventsSearch(queryRaw, defaultFrom, defaultTo, limit);
  const googleItems = googleEvents
    .filter((ge: any) => !linkedGoogleIds.has(String(ge.id)))
    .map((ge: any) => ({
      id: String(ge.id),
      title: String(ge.title || ''),
      startDate: toIso(ge.startDate),
      endDate: toIso(ge.endDate),
      source: 'google' as const,
      isAllDay: ge.isAllDay === true,
      location: ge.location || undefined,
      attendeesCount: Array.isArray(ge.attendees) ? ge.attendees.length : undefined,
    }));

  const combined = [...localItems, ...googleItems].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  const filtered = sourceFilter === 'all' ? combined : combined.filter((it) => it.source === sourceFilter);
  const seen = new Set<string>();
  const deduped: typeof filtered = [];
  for (const it of filtered) {
    const key = it.source === 'google' ? it.id : (it.googleEventId || it.id);
    if (seen.has(String(key))) continue;
    seen.add(String(key));
    deduped.push(it);
    if (deduped.length >= limit) break;
  }

  return {
    items: deduped,
    query: queryRaw,
    range: { from: toIso(defaultFrom), to: toIso(defaultTo) },
  };
};

const calendar_get_details: ToolHandler = async (args: any) => {
  const id = String(args?.id || '');
  const source: SourceType = args?.source === 'google' ? 'google' : 'local';
  if (!id) throw new Error('MISSING_ID');

  let detail: any = null;
  let src: SourceType = source;
  let local: any = null;
  try {
    if (source === 'local') {
      try {
        local = await database.get<EventModel>('events').find(id);
      } catch {}
      if (local?.googleEventId) {
        detail = await fetchGoogleEventDetail(String(local.googleEventId));
      } else {
        detail = {
          id,
          summary: local?.title || '',
          start: { dateTime: (local?.startDate ? new Date(local.startDate) : new Date()).toISOString() },
          end: { dateTime: (local?.endDate ? new Date(local.endDate) : new Date()).toISOString() },
          location: local?.location,
        };
      }
    } else {
      detail = await fetchGoogleEventDetail(id);
      if (!detail) throw new Error('NOT_FOUND');
      const rows = await database.collections.get<EventModel>('events').query(Q.where('google_event_id', Q.eq(id))).fetch();
      local = rows[0] || null;
      src = 'google';
    }
  } catch {
    throw new Error('DETAILS_FAILED');
  }

  const startIso = String(detail?.start?.dateTime || detail?.start?.date || '');
  const endIso = String(detail?.end?.dateTime || detail?.end?.date || '');
  const attendees = Array.isArray(detail?.attendees)
    ? detail.attendees.map((a: any) => ({ email: String(a?.email || ''), responseStatus: a?.responseStatus }))
    : [];
  return {
    item: {
      id: src === 'local' ? String(local?.id || id) : String(detail?.id || id),
      title: String(detail?.summary || local?.title || ''),
      startDate: startIso,
      endDate: endIso,
      isAllDay: !!(detail?.start?.date && !detail?.start?.dateTime),
      location: String(local?.location || detail?.location || ''),
      hangoutLink: typeof detail?.hangoutLink === 'string' ? detail.hangoutLink : undefined,
      attendees,
      source: src,
      googleEventId: String(local?.googleEventId || (src === 'google' ? detail?.id : '') || ''),
    },
  };
};

export const createCalendarEvent = async (args: any) => {
  const title = String(args?.title || '').trim();
  const startIso = String(args?.start || '').trim();
  const endIso = String(args?.end || '').trim();
  const location = typeof args?.location === 'string' ? String(args.location).trim() : '';
  const attendees: string[] = Array.isArray(args?.attendees) ? args.attendees.filter((e: any) => typeof e === 'string' && e.includes('@')) : [];
  if (!title || !startIso || !endIso) throw new Error('MISSING_PARAMS');

  const googleStatus = await getGoogleConnectionStatusStatic();
  const token = googleStatus.isActive ? googleStatus.accessToken : null;

  let googleEventId = '';
  let syncTarget: SourceType = 'local';
  if (token) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const body = {
      summary: title,
      description: 'Event created from wave',
      location: location || undefined,
      start: { dateTime: startIso, timeZone: tz },
      end: { dateTime: endIso, timeZone: tz },
      conferenceData: { createRequest: { requestId: Math.random().toString(36).slice(2), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      attendees: attendees.map((email) => ({ email })),
      reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 24 * 60 }, { method: 'popup', minutes: 10 }] },
    };

    try {
      const resp = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (resp.ok) {
        const data: any = await resp.json().catch(() => ({}));
        googleEventId = String(data?.id || '');
        if (googleEventId) {
          syncTarget = 'google';
        }
      }
    } catch {}
  }

  let localId: string | null = null;
  await database.write(async () => {
    const col = database.collections.get<EventModel>('events');
    const s = new Date(startIso);
    const e = new Date(endIso);
    const row = await col.create((ev: any) => {
      ev.title = title;
      ev.startDate = s;
      ev.startTime = s.getHours();
      ev.endDate = e;
      ev.endTime = e.getHours();
      if (googleEventId) ev.googleEventId = googleEventId;
      ev.isGoogleEvent = false;
      if (location) ev.location = location;
    });
    localId = String((row as any).id);
  });

  return {
    created: true,
    syncTarget,
    item: {
      id: localId,
      googleEventId: googleEventId || undefined,
      title,
      startDate: startIso,
      endDate: endIso,
      source: 'local' as const,
      location: location || undefined,
    },
  };
};

const calendar_create: ToolHandler = async (args: any) => {
  return createCalendarEvent(args);
};

const calendar_update: ToolHandler = async (args: any) => {
  const id = String(args?.id || '');
  const source: SourceType = args?.source === 'google' ? 'google' : 'local';
  if (!id) throw new Error('MISSING_ID');

  const newTitle = typeof args?.title === 'string' ? String(args.title) : undefined;
  const newStartIso = typeof args?.start === 'string' ? String(args.start) : undefined;
  const newEndIso = typeof args?.end === 'string' ? String(args.end) : undefined;
  const newLocation = typeof args?.location === 'string' ? String(args.location) : undefined;
  const newAttendees: string[] | undefined = Array.isArray(args?.attendees) ? args.attendees : undefined;

  let local: any = null;
  let googleId: string | null = null;
  if (source === 'local') {
    try {
      local = await database.get<EventModel>('events').find(id);
      googleId = String(local?.googleEventId || '');
    } catch {}
  } else {
    googleId = id;
    try {
      const rows = await database.collections.get<EventModel>('events').query(Q.where('google_event_id', Q.eq(id))).fetch();
      local = rows[0] || null;
    } catch {}
  }

  const interpretDateInput = (input?: string, fallback?: Date | null) => {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    const templateFromFallback = fallback ? new Date(fallback.getTime()) : null;
    const buildFrom = (year: number, monthIndex: number, day: number) => {
      const template = templateFromFallback ? new Date(templateFromFallback.getTime()) : new Date();
      if (!templateFromFallback) template.setHours(0, 0, 0, 0);
      template.setFullYear(year, monthIndex, day);
      return template;
    };
    if (['today', 'tomorrow', 'yesterday'].includes(lowered)) {
      const offset = lowered === 'tomorrow' ? 1 : lowered === 'yesterday' ? -1 : 0;
      const base = new Date();
      base.setHours(0, 0, 0, 0);
      base.setDate(base.getDate() + offset);
      return buildFrom(base.getFullYear(), base.getMonth(), base.getDate());
    }
    const dateOnly = lowered.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      return buildFrom(Number(y), Number(m) - 1, Number(d));
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const token = await getAccessTokenStatic();
  if ((googleId || source === 'google') && !token) throw new Error('GOOGLE_AUTH_REQUIRED');

  let googleDetails: any = null;
  let isAllDay = false;
  let tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let googleStart: Date | null = null;
  let googleEnd: Date | null = null;
  if (googleId) {
    googleDetails = await fetchGoogleEventDetail(googleId);
    isAllDay = !!(googleDetails?.start?.date && !googleDetails?.start?.dateTime);
    tz = googleDetails?.start?.timeZone || tz;
    googleStart = parseDate(googleDetails?.start?.dateTime || googleDetails?.start?.date) || null;
    googleEnd = parseDate(googleDetails?.end?.dateTime || googleDetails?.end?.date) || null;
  }

  const localStart = local?.startDate ? new Date(local.startDate) : null;
  const localEnd = local?.endDate ? new Date(local.endDate) : null;
  const fallbackStart = googleStart || localStart;
  const fallbackEnd = googleEnd || localEnd;
  const durationMsRaw = fallbackStart && fallbackEnd ? Math.max(fallbackEnd.getTime() - fallbackStart.getTime(), 0) : 0;
  const durationMs = durationMsRaw > 0 ? durationMsRaw : DEFAULT_EVENT_DURATION_MS;
  const requestedStart = interpretDateInput(newStartIso, fallbackStart || fallbackEnd || null);
  const requestedEnd = interpretDateInput(newEndIso, fallbackEnd || fallbackStart || null);

  let finalStartDate: Date | null = requestedStart ? new Date(requestedStart.getTime()) : null;
  let finalEndDate: Date | null = requestedEnd ? new Date(requestedEnd.getTime()) : null;
  if (finalStartDate && !finalEndDate) {
    finalEndDate = new Date(finalStartDate.getTime() + durationMs);
  }
  if (!finalStartDate && fallbackStart) {
    finalStartDate = new Date(fallbackStart.getTime());
  }
  if (!finalEndDate && fallbackEnd) {
    finalEndDate = new Date(fallbackEnd.getTime());
  }
  if (!finalEndDate && finalStartDate) {
    finalEndDate = new Date(finalStartDate.getTime() + durationMs);
  }
  if (!finalStartDate && finalEndDate) {
    finalStartDate = new Date(finalEndDate.getTime() - durationMs);
  }

  const wantsTimeUpdate = !!(
    (typeof newStartIso === 'string' && newStartIso.trim()) ||
    (typeof newEndIso === 'string' && newEndIso.trim())
  );

  if (googleId) {
    const patchBody: any = {};
    if (typeof newTitle === 'string') patchBody.summary = newTitle;
    if (typeof newLocation === 'string') patchBody.location = newLocation;
    if (Array.isArray(newAttendees)) patchBody.attendees = newAttendees.map((email) => ({ email }));
    if (wantsTimeUpdate && finalStartDate && finalEndDate) {
      if (isAllDay) {
        patchBody.start = { date: formatCalendarDateOnly(finalStartDate) };
        patchBody.end = { date: formatCalendarDateOnly(finalEndDate) };
      } else {
        patchBody.start = { dateTime: finalStartDate.toISOString(), timeZone: tz };
        patchBody.end = { dateTime: finalEndDate.toISOString(), timeZone: tz };
      }
    }
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleId)}`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody) }
    );
    if (!resp.ok) throw new Error('GOOGLE_UPDATE_FAILED');
  }

  try {
    if (local) {
      await database.write(async () => {
        const row = await database.get<EventModel>('events').find(String(local.id));
        await row.update((r: any) => {
          if (typeof newTitle === 'string') r.title = newTitle;
          if (wantsTimeUpdate && finalStartDate && finalEndDate) {
            r.startDate = finalStartDate;
            r.endDate = finalEndDate;
            r.startTime = finalStartDate.getHours();
            r.endTime = finalEndDate.getHours();
          }
          if (typeof newLocation === 'string') r.location = newLocation;
        });
        local = row;
      });
    }
  } catch {}

  const responseStart = (wantsTimeUpdate && finalStartDate) ? finalStartDate : fallbackStart;
  const responseEnd = (wantsTimeUpdate && finalEndDate) ? finalEndDate : fallbackEnd;

  return {
    updated: true,
    item: {
      id,
      title: newTitle || local?.title || '',
      startDate: responseStart ? new Date(responseStart).toISOString() : undefined,
      endDate: responseEnd ? new Date(responseEnd).toISOString() : undefined,
      isAllDay,
      source,
      location: newLocation || local?.location || undefined,
    },
  };
};

const calendar_delete: ToolHandler = async (args: any) => {
  const id = String(args?.id || '');
  const source: SourceType = args?.source === 'google' ? 'google' : 'local';
  if (!id) throw new Error('MISSING_ID');

  let googleId: string | null = null;
  let localExists = false;
  let localRow: any = null;
  if (source === 'local') {
    try {
      localRow = await database.get<EventModel>('events').find(id);
      localExists = !!localRow;
      if (localRow?.googleEventId) googleId = String(localRow.googleEventId);
    } catch {}
  } else {
    googleId = id;
    const rows = await database.collections.get<EventModel>('events').query(Q.where('google_event_id', Q.eq(id))).fetch();
    if (rows[0]) {
      localExists = true;
      localRow = rows[0];
    }
  }

  const token = await getAccessTokenStatic();
  if (googleId && !token) throw new Error('GOOGLE_AUTH_REQUIRED');

  if (googleId && token) {
    try {
      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok && resp.status !== 404) throw new Error('GOOGLE_DELETE_FAILED');
    } catch {
      throw new Error('GOOGLE_DELETE_FAILED');
    }
  }

  if (localExists && localRow) {
    try {
      await database.write(async () => {
        const row = await database.get<EventModel>('events').find(String(localRow.id));
        await row.destroyPermanently();
      });
    } catch {}
  }

  return { deleted: true, id, source };
};

export const calendarToolHandlers: Record<string, ToolHandler> = {
  calendar_fetch_range,
  calendar_search,
  calendar_get_details,
  calendar_create,
  calendar_update,
  calendar_delete,
};
