import { Text, TouchableOpacity } from 'react-native';
import type { Router } from 'expo-router';

type TodoItem = {
  id?: string;
  text: string;
  dueDate?: string | null;
  hasDueTime?: boolean;
  completed?: boolean;
  workspace?: string;
};

type Props = {
  items: TodoItem[];
  router: Router;
};

export function TodoCard({ items, router }: Props) {
  return (
    <>
      {items.map((it, idx) => {
        const dueDate = it.dueDate ? new Date(it.dueDate) : null;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const isOverdue = !!dueDate && !isNaN(dueDate.getTime()) && !it.completed && dueDate.getTime() < todayStart.getTime();
        const dateLabel = dueDate && !isNaN(dueDate.getTime())
          ? dueDate.toLocaleString('en-GB', it.hasDueTime
            ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
            : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
          : null;
        const ws = typeof it.workspace === 'string' ? it.workspace : undefined;
        return (
          <TouchableOpacity
            key={`${it.id ?? it.text}-${idx}`}
            onPress={() => {
              router.push({ pathname: '/(tabs)/todo', params: { workspaceKey: String(ws ?? 'Personal') } });
            }}
            style={{ backgroundColor: '#2F2F2F', padding: 10, borderRadius: 8, marginBottom: 6 }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
              {it.text}
              {isOverdue ? (
                <Text style={{ color: '#C9B9A0', fontSize: 11, fontWeight: '500' }}>{' (Overdue)'}</Text>
              ) : null}
              {it.completed ? (
                <Text style={{ color: '#B8B8B8', fontSize: 11, fontWeight: '500' }}>{' (Completed)'}</Text>
              ) : null}
            </Text>
            {dateLabel && (
              <Text style={{ color: '#C7C7C7', marginTop: 2 }}>
                {`${dateLabel}${ws ? ` (${ws})` : ''}`}
              </Text>
            )}
            {!dateLabel && ws && (
              <Text style={{ color: '#9ED5CB', marginTop: 2 }}>{`Workspace: ${ws}`}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );
}
