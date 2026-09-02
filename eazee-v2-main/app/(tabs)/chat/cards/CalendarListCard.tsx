import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { format } from 'date-fns';
import type { Router } from 'expo-router';
import { parseCalendarDateValue } from '@/utils/calendarDates';

type CalendarItem = {
  id: string;
  title?: string;
  startDate: string;
  endDate?: string;
  isAllDay?: boolean;
  source?: string;
};

type Props = {
  items: CalendarItem[];
  router: Router;
};

function formatTimeRange(item: CalendarItem): string {
  if (item.isAllDay) {
    const start = parseCalendarDateValue(item.startDate);
    if (!start) return 'All day';
    return `${format(start, 'EEE, MMM d')} • All day`;
  }

  let startLabel = '';
  let endLabel = '';
  let startDate: Date | null = null;

  const s = parseCalendarDateValue(item.startDate);
  if (s) {
    startDate = s;
    startLabel = format(s, 'EEE, MMM d • h:mm a');
  }

  const eRaw = typeof item.endDate === 'string' ? item.endDate : item.startDate;
  if (eRaw) {
    const e = parseCalendarDateValue(eRaw);
    if (e) {
      const sameDay = startDate && startDate.toDateString() === e.toDateString();
      endLabel = format(e, sameDay ? 'h:mm a' : 'EEE, MMM d • h:mm a');
    }
  }

  if (startLabel && endLabel) return `${startLabel} → ${endLabel}`;
  return startLabel || endLabel;
}

export function CalendarListCard({ items, router }: Props) {
  return (
    <View style={{ backgroundColor: '#2F2F2F', padding: 10, borderRadius: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Events</Text>
        {items.length > 1 && (
          <Text style={{ color: '#C7C7C7', fontSize: 12 }}>{items.length}</Text>
        )}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 280 }}
        contentContainerStyle={{ paddingBottom: 2 }}
      >
        {items.map((it, idx) => {
          const color = it.source === 'google' ? '#4285F4' : '#034A52';
          const timeText = formatTimeRange(it);
          return (
            <TouchableOpacity
              key={`cal-${it.id}-${idx}`}
              onPress={() => {
                router.push({
                  pathname: '/(tabs)/calendar',
                  params: { openEventId: String(it.id ?? ''), openEventSource: String(it.source ?? 'local'), openNonce: String(Date.now()) },
                });
              }}
              style={{ marginBottom: idx === items.length - 1 ? 0 : 8 }}
            >
              <View style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: color }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }} numberOfLines={2}>{it.title ?? '(No title)'}</Text>
                {timeText && <Text style={{ color: '#FFFFFF', opacity: 0.9, marginTop: 4, fontSize: 12 }} numberOfLines={2}>{timeText}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
