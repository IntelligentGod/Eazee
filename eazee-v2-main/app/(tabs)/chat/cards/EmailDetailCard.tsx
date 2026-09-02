import { Text, TouchableOpacity, View } from 'react-native';
import type { Router } from 'expo-router';
import { executeToolCall } from '../tools/engine';
import type { ChatUIMessage } from '../types';

type EmailItem = {
  id: string;
  subject: string;
  from: string;
  snippet?: string;
};

type Props = {
  items: EmailItem[];
  router: Router;
  serverUrl: string;
  setIsAssistantTyping: (v: boolean) => void;
  appendChatMessages: (messages: ChatUIMessage[]) => Promise<unknown>;
};

export function EmailDetailCard({ items, router, serverUrl, setIsAssistantTyping, appendChatMessages }: Props) {
  return (
    <>
      {items.map((it, idx) => (
        <View key={`${it.id}-${idx}`} style={{ backgroundColor: '#2F2F2F', padding: 12, borderRadius: 10, marginBottom: 10 }}>
          <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>{it.subject}</Text>
          <Text style={{ color: '#C7C7C7', marginTop: 2 }}>{it.from}</Text>
          {it.snippet && (
            <Text style={{ color: '#9ED5CB', marginTop: 6 }} numberOfLines={4}>{it.snippet}</Text>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => {
                router.push({
                  pathname: '/(modals)/email/[id]',
                  params: { id: String(it.id ?? ''), returnTo: '/(tabs)/chat', email: JSON.stringify(it) },
                });
              }}
              style={{ backgroundColor: '#3A3A3A', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 8 }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                setIsAssistantTyping(true);
                try {
                  const res = await executeToolCall(
                    { name: 'email_generate_reply_single', arguments: { emailId: String(it.id ?? '') } },
                    { serverUrl, router }
                  );
                  const msgs = Array.isArray(res?.messages) ? res.messages : [];
                  if (msgs.length) await appendChatMessages(msgs);
                  else await appendChatMessages([{ role: 'assistant', content: 'No draft was generated.' }]);
                } catch {
                  await appendChatMessages([{ role: 'assistant', content: 'Failed to generate draft.' }]);
                } finally {
                  setIsAssistantTyping(false);
                }
              }}
              style={{ backgroundColor: '#22AB93', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>AI Reply</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </>
  );
}
