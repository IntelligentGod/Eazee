import type { AssistantMessage, UiAction } from '../types';
import { appendCreatedCalendarItems, removeCreatedCalendarItems, removeLastCalendarItems, setLastCalendarItems, updateCreatedCalendarItems } from '../memory';

export function presentCalendarResult(name: string, result: any): { messages: AssistantMessage[]; uiActions?: UiAction[] } {
  const messages: AssistantMessage[] = [];

  const isTodayRange = (() => {
    const from = typeof result?.range?.from === 'string' ? new Date(result.range.from) : null;
    const to = typeof result?.range?.to === 'string' ? new Date(result.range.to) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
    const now = new Date();
    const sameStartDay = from.toDateString() === now.toDateString();
    const durationMs = Math.abs(to.getTime() - from.getTime());
    return sameStartDay && durationMs <= 36 * 60 * 60 * 1000;
  })();

  if (name === 'calendar_fetch_range') {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length > 0) {
      try {
        const itemsForMemory = items.map((it: any) => ({
          id: String(it.id || ''),
          title: String(it.title || ''),
          startDate: String(it.startDate || ''),
          endDate: typeof it.endDate === 'string' ? it.endDate : undefined,
          source: it.source === 'google' ? 'google' as const : 'local' as const,
        }));
        setLastCalendarItems(itemsForMemory);
      } catch {}
      const intro = items.length === 1 ? 'You have 1 event.' : `You have ${items.length} events.`;
      messages.push({ role: 'assistant', content: intro, card: { type: 'calendarList', items } });
    } else {
      messages.push({ role: 'assistant', content: isTodayRange ? "You don't have any calendar events today." : "I couldn't find any calendar events in that time range." });
    }
  } else if (name === 'calendar_search') {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length > 0) {
      try {
        const itemsForMemory = items.map((it: any) => ({
          id: String(it.id || ''),
          title: String(it.title || ''),
          startDate: String(it.startDate || ''),
          endDate: typeof it.endDate === 'string' ? it.endDate : undefined,
          source: it.source === 'google' ? 'google' as const : 'local' as const,
        }));
        setLastCalendarItems(itemsForMemory);
      } catch {}
      const intro = items.length === 1 ? 'I found 1 matching event.' : `I found ${items.length} matching events.`;
      messages.push({ role: 'assistant', content: intro, card: { type: 'calendarList', items } });
    } else {
      messages.push({ role: 'assistant', content: "I couldn't find any matching events." });
    }
  } else if (name === 'calendar_get_details') {
    const item = result?.item;
    if (item) {
      try {
        setLastCalendarItems([{
          id: String(item.id || ''),
          title: String(item.title || ''),
          startDate: String(item.startDate || ''),
          endDate: typeof item.endDate === 'string' ? item.endDate : undefined,
          source: item.source === 'google' ? 'google' as const : 'local' as const,
        }]);
      } catch {}
      messages.push({ role: 'assistant', content: 'Here are the event details.', card: { type: 'calendarDetail', items: [item] } });
    } else {
      messages.push({ role: 'assistant', content: 'I ran into a problem loading that event.' });
    }
  } else if (name === 'calendar_create') {
    const item = result?.item;
    if (item) {
      const trackedItem = {
        id: String(item.id || ''),
        title: String(item.title || ''),
        startDate: String(item.startDate || ''),
        endDate: typeof item.endDate === 'string' ? item.endDate : undefined,
        source: item.source === 'google' ? 'google' as const : 'local' as const,
      };
      try {
        setLastCalendarItems([trackedItem]);
        appendCreatedCalendarItems([trackedItem]);
      } catch {}
      const content = result?.syncTarget === 'google'
        ? 'I added the event and synced it to Google Calendar.'
        : 'I added the event to your calendar.';
      messages.push({ role: 'assistant', content, card: { type: 'calendarDetail', items: [item] } });
    } else {
      messages.push({ role: 'assistant', content: 'I added the event to your calendar.' });
    }
  } else if (name === 'calendar_update') {
    const item = result?.item;
    if (item) {
      const trackedItem = {
        id: String(item.id || ''),
        title: String(item.title || ''),
        startDate: String(item.startDate || ''),
        endDate: typeof item.endDate === 'string' ? item.endDate : undefined,
        source: item.source === 'google' ? 'google' as const : 'local' as const,
      };
      try {
        setLastCalendarItems([trackedItem]);
        updateCreatedCalendarItems([trackedItem]);
      } catch {}
      messages.push({ role: 'assistant', content: 'Your calendar event is updated.', card: { type: 'calendarDetail', items: [item] } });
    } else {
      messages.push({ role: 'assistant', content: 'Your calendar event is updated.' });
    }
  } else if (name === 'calendar_delete') {
    try {
      const deletedRef = [{ id: String(result?.id || ''), source: result?.source === 'google' ? 'google' as const : 'local' as const }];
      removeLastCalendarItems(deletedRef);
      removeCreatedCalendarItems(deletedRef);
    } catch {}
    messages.push({ role: 'assistant', content: 'I deleted that event.' });
  } else {
    messages.push({ role: 'assistant', content: 'Done.' });
  }

  return { messages };
}
