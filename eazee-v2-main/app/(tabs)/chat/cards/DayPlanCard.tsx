import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { format } from 'date-fns';
import type { Router } from 'expo-router';
import { parseCalendarDateValue } from '@/utils/calendarDates';

type CalendarItem = {
  title: string;
  start?: string;
  end?: string;
  location?: string;
  details?: string;
};

type TodoItem = {
  text: string;
  dueDate: string;
  hasDueTime: boolean;
  details?: string;
  priority: 'low' | 'medium' | 'high';
};

type Props = {
  date: string;
  calendarItems: CalendarItem[];
  todoItems: TodoItem[];
  router: Router;
};

const PRIORITY_LABELS: Record<TodoItem['priority'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const sectionTitleStyle = {
  color: '#66FCEA',
  fontSize: 12,
  fontWeight: '700' as const,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
};

const rowStyle = {
  backgroundColor: '#2A2A2A',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
};

function formatDateLabel(value: string) {
  const parsed = parseCalendarDateValue(value) || new Date(value);
  if (isNaN(parsed.getTime())) return value;

  const today = new Date();
  if (parsed.toDateString() === today.toDateString()) return 'Today';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (parsed.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return format(parsed, 'EEE, MMM d');
}

function formatPlanTime(value?: string) {
  if (!value) return '';
  const parsed = parseCalendarDateValue(value);
  if (!parsed) return '';
  return format(parsed, 'h:mm a');
}

function formatPlanTimeRange(item: CalendarItem) {
  const start = formatPlanTime(item.start);
  const end = formatPlanTime(item.end);
  if (start && end) return `${start} - ${end}`;
  return start || end || 'Time needed';
}

export function DayPlanCard({ date, calendarItems, todoItems, router }: Props) {
  return (
    <View style={{ backgroundColor: '#1F1F1F', borderRadius: 16, overflow: 'hidden', maxHeight: 420 }}>
      <View style={{ backgroundColor: '#232323', paddingHorizontal: 14, paddingVertical: 12 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Plan for {formatDateLabel(date)}</Text>
        <Text style={{ color: '#9ED5CB', fontSize: 12, marginTop: 2 }}>
          {calendarItems.length} events • {todoItems.length} tasks
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 340 }}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        nestedScrollEnabled
      >
        {calendarItems.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={sectionTitleStyle}>Schedule</Text>
            {calendarItems.map((item, index) => (
              <TouchableOpacity
                key={`plan-event-${item.title}-${item.start || 'none'}-${index}`}
                onPress={() => router.push({ pathname: '/(tabs)/calendar' })}
                style={rowStyle}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                <Text style={{ color: '#9ED5CB', fontSize: 12, marginTop: 3 }}>{formatPlanTimeRange(item)}</Text>
                {item.location ? (
                  <Text style={{ color: '#C7C7C7', fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                    {item.location}
                  </Text>
                ) : null}
                {item.details ? (
                  <Text style={{ color: '#AFAFAF', fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                    {item.details}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {todoItems.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={sectionTitleStyle}>Tasks</Text>
            {todoItems.map((item, index) => (
              <TouchableOpacity
                key={`plan-task-${item.text}-${item.dueDate}-${index}`}
                onPress={() => router.push({ pathname: '/(tabs)/todo' })}
                style={rowStyle}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1 }}>{item.text}</Text>
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      backgroundColor: item.priority === 'high' ? 'rgba(245, 104, 104, 0.18)' : item.priority === 'medium' ? 'rgba(102, 252, 234, 0.14)' : 'rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <Text
                      style={{
                        color: item.priority === 'high' ? '#F5A6A6' : item.priority === 'medium' ? '#9ED5CB' : '#D0D0D0',
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {PRIORITY_LABELS[item.priority]}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: '#9ED5CB', fontSize: 12, marginTop: 3 }}>
                  {item.hasDueTime ? formatPlanTime(item.dueDate) || 'Time needed' : 'Any time'}
                </Text>
                {item.details ? (
                  <Text style={{ color: '#AFAFAF', fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                    {item.details}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {calendarItems.length === 0 && todoItems.length === 0 && (
          <View style={[rowStyle, { alignItems: 'center' }]}>
            <Text style={{ color: '#AFAFAF', fontSize: 13 }}>Nothing in this plan yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
