import { Text, TouchableOpacity } from 'react-native';
import type { Router } from 'expo-router';

type EmailItem = {
  id: string;
  subject: string;
  from: string;
  snippet?: string;
};

type Props = {
  items: EmailItem[];
  router: Router;
};

export function EmailListCard({ items, router }: Props) {
  return (
    <>
      {items.map((it, idx) => (
        <TouchableOpacity
          key={`${it.id}-${idx}`}
          onPress={() => {
            router.push({
              pathname: `/(modals)/emailView/${it.id}`,
              params: { email: JSON.stringify(it) },
            });
          }}
          style={{ backgroundColor: '#2F2F2F', padding: 10, borderRadius: 8, marginBottom: 6 }}
        >
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>{`${idx + 1}. ${it.subject}`}</Text>
          <Text style={{ color: '#C7C7C7', marginTop: 2 }} numberOfLines={1}>{it.from}</Text>
          {it.snippet && (
            <Text style={{ color: '#9ED5CB', marginTop: 2 }} numberOfLines={2}>{it.snippet}</Text>
          )}
        </TouchableOpacity>
      ))}
    </>
  );
}

