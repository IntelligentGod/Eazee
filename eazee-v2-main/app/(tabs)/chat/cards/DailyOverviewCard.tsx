import { useState } from 'react';
import { Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { format } from 'date-fns';
import type { Router } from 'expo-router';
import { parseCalendarDateValue } from '@/utils/calendarDates';

type TodoItem = {
  id: string;
  text: string;
  dueDate?: string | null;
  completed?: boolean;
  starred?: boolean;
  workspace?: string;
};

type CalendarItem = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  source?: 'local' | 'google';
  location?: string;
  isAllDay?: boolean;
};

type EmailItem = {
  id: string;
  subject: string;
  from: string;
  snippet?: string;
  date?: string;
};

type Props = {
  date: string;
  todos: TodoItem[];
  calendar: CalendarItem[];
  emails: EmailItem[];
  router: Router;
};

const TAB_COLORS = {
  active: '#1C8D79',
  inactive: '#3A3A3A',
};

function formatTimeRange(item: CalendarItem): string {
  const s = parseCalendarDateValue(item.startDate);
  if (!s) return '';
  if (item.isAllDay) return 'All day';
  const startLabel = format(s, 'h:mm a');
  const eRaw = item.endDate || item.startDate;
  const e = parseCalendarDateValue(eRaw);
  if (!e) return startLabel;
  const endLabel = format(e, 'h:mm a');
  return `${startLabel} - ${endLabel}`;
}

export function DailyOverviewCard({ date, todos, calendar, emails, router }: Props) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar' | 'emails'>('tasks');

  const dateLabel = (() => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return format(d, 'EEE, MMM d');
  })();

  const tabs = [
    { key: 'tasks' as const, label: 'Tasks', count: todos.length },
    { key: 'calendar' as const, label: 'Calendar', count: calendar.length },
    { key: 'emails' as const, label: 'Emails', count: emails.length },
  ];

  return (
    <View style={{ backgroundColor: '#1F1F1F', borderRadius: 12, overflow: 'hidden', maxHeight: 320 }}>
      <View style={{ backgroundColor: '#2A2A2A', paddingVertical: 8, paddingHorizontal: 12 }}>
        <Text style={{ color: '#66FCEA', fontSize: 15, fontWeight: '700' }}>{`${dateLabel}'s Overview`}</Text>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: '#252525', paddingVertical: 4, paddingHorizontal: 4 }}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 6,
              borderRadius: 8,
              backgroundColor: activeTab === tab.key ? TAB_COLORS.active : 'transparent',
              marginHorizontal: 2,
            }}
          >
            <Text
              style={{
                color: activeTab === tab.key ? '#FFFFFF' : '#AAAAAA',
                fontSize: 10,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              {tab.label} ({tab.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ maxHeight: 220, padding: 8 }} nestedScrollEnabled>
        {activeTab === 'tasks' && (
          <>
            {todos.length === 0 && (
              <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 20 }}>No tasks for this day</Text>
            )}
            {todos.map((it, idx) => (
              <TouchableOpacity
                key={`todo-${it.id}-${idx}`}
                onPress={() => router.push({ pathname: '/(tabs)/todo', params: { workspaceKey: it.workspace || 'Personal' } })}
                style={{ backgroundColor: '#2F2F2F', padding: 10, borderRadius: 8, marginBottom: 6 }}
              >
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>{it.text}</Text>
                {it.workspace && (
                  <Text style={{ color: '#9ED5CB', fontSize: 12, marginTop: 2 }}>{it.workspace}</Text>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {activeTab === 'calendar' && (
          <>
            {calendar.length === 0 && (
              <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 20 }}>No events for this day</Text>
            )}
            {calendar.map((it, idx) => {
              const color = it.source === 'google' ? '#4285F4' : '#034A52';
              const timeText = formatTimeRange(it);
              return (
                <TouchableOpacity
                  key={`cal-${it.id}-${idx}`}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/calendar',
                      params: { openEventId: it.id, openEventSource: it.source || 'local', openNonce: String(Date.now()) },
                    })
                  }
                  style={{ backgroundColor: color, padding: 10, borderRadius: 8, marginBottom: 6 }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }} numberOfLines={2}>
                    {it.title || '(No title)'}
                  </Text>
                  {timeText && (
                    <Text style={{ color: '#FFFFFF', opacity: 0.9, marginTop: 2, fontSize: 12 }}>{timeText}</Text>
                  )}
                  {it.location && (
                    <Text style={{ color: '#FFFFFF', opacity: 0.8, marginTop: 2, fontSize: 11 }} numberOfLines={1}>
                      {it.location}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {activeTab === 'emails' && (
          <>
            {emails.length === 0 && (
              <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 20 }}>No recent emails</Text>
            )}
            {emails.map((it, idx) => (
              <TouchableOpacity
                key={`email-${it.id}-${idx}`}
                onPress={() =>
                  router.push({
                    pathname: `/(modals)/emailView/${it.id}`,
                    params: { email: JSON.stringify(it) },
                  })
                }
                style={{ backgroundColor: '#2F2F2F', padding: 10, borderRadius: 8, marginBottom: 6 }}
              >
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                  {it.subject}
                </Text>
                <Text style={{ color: '#C7C7C7', marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                  {it.from}
                </Text>
                {it.snippet && (
                  <Text style={{ color: '#9ED5CB', marginTop: 2, fontSize: 11 }} numberOfLines={2}>
                    {it.snippet}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
