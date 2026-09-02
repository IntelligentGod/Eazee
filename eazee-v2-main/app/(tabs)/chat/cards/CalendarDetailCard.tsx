import { Text, TouchableOpacity, View } from 'react-native';
import { format } from 'date-fns';
import type { Router } from 'expo-router';
import { parseCalendarDateValue } from '@/utils/calendarDates';

type CalendarItem = {
  id: string;
  title?: string;
  startDate: string;
  endDate?: string;
  isAllDay?: boolean;
  location?: string;
  attendees?: unknown[];
  source?: string;
};

type Props = {
  items: CalendarItem[];
  router: Router;
};

function formatDateRange(startDate: string, endDate?: string, isAllDay?: boolean): string {
  const s = parseCalendarDateValue(startDate);
  const e = endDate ? parseCalendarDateValue(endDate) : null;
  if (!s) return '';
  if (isAllDay) {
    if (!e) return `${format(s, 'EEE, MMM d')} • All day`;
    const inclusiveEnd = new Date(e.getTime() - 24 * 60 * 60 * 1000);
    if (inclusiveEnd.toDateString() === s.toDateString()) {
      return `${format(s, 'EEE, MMM d')} • All day`;
    }
    return `${format(s, 'EEE, MMM d')} - ${format(inclusiveEnd, 'EEE, MMM d')} • All day`;
  }
  if (!e) return format(s, 'EEE, MMM d • h:mm a');
  return `${format(s, 'EEE, MMM d • h:mm a')} - ${format(e, 'h:mm a')}`;
}

export function CalendarDetailCard({ items, router }: Props) {
  return (
    <>
      {items.map((it, idx) => {
        const dateRange = formatDateRange(it.startDate, it.endDate, it.isAllDay);
        return (
          <View key={`cald-${it.id}-${idx}`} style={{ backgroundColor: '#2F2F2F', padding: 12, borderRadius: 10, marginBottom: 10 }}>
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>{it.title ?? '(No title)'}</Text>
            {dateRange && <Text style={{ color: '#C7C7C7', marginTop: 2 }}>{dateRange}</Text>}
            {it.location && <Text style={{ color: '#9ED5CB', marginTop: 6 }}>Location: {String(it.location)}</Text>}
            {Array.isArray(it.attendees) && it.attendees.length > 0 && (
              <Text style={{ color: '#9ED5CB', marginTop: 4 }}>Guests: {it.attendees.length}</Text>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  router.push({
                    pathname: '/(tabs)/calendar',
                    params: { openEventId: String(it.id ?? ''), openEventSource: String(it.source ?? 'local'), openNonce: String(Date.now()) },
                  });
                }}
                style={{ backgroundColor: '#3A3A3A', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </>
  );
}
