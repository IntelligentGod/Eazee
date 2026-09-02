import { Text, TouchableOpacity, View } from 'react-native';
import type { Router } from 'expo-router';
import { executeToolCall } from '../tools/engine';
import type { ChatUIMessage } from '../types';

type DraftItem = {
  compose?: {
    to?: string;
    subject?: string;
  };
  email?: {
    id?: string;
    subject?: string;
    from?: string;
  };
  replyDraft?: string;
};

type Props = {
  item: DraftItem;
  serverUrl: string;
  router: Router;
  setIsAssistantTyping: (v: boolean) => void;
  appendChatMessages: (messages: ChatUIMessage[]) => Promise<unknown>;
};

export function EmailDraftCard({ item, serverUrl, router, setIsAssistantTyping, appendChatMessages }: Props) {
  const isCompose = !!item?.compose?.to;
  
  return (
    <View style={{ backgroundColor: '#2F2F2F', padding: 12, borderRadius: 10 }}>
      <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
        {item?.compose?.subject ?? item?.email?.subject ?? 'Draft Email'}
      </Text>
      <Text style={{ color: '#C7C7C7', marginTop: 2 }}>
        {item?.compose?.to ? `To: ${item.compose.to}` : (item?.email?.from ?? '')}
      </Text>
      <View style={{ backgroundColor: '#1F1F1F', padding: 10, borderRadius: 8, marginTop: 8 }}>
        <Text style={{ color: '#EDEDED' }}>{item?.replyDraft ?? ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
        <TouchableOpacity
          onPress={async () => {
            setIsAssistantTyping(true);
            try {
              const res = await executeToolCall(
                isCompose
                  ? { name: 'email_send_new', arguments: { to: String(item?.compose?.to ?? ''), subject: String(item?.compose?.subject ?? 'No Subject'), body: String(item?.replyDraft ?? '') } }
                  : { name: 'email_send_reply', arguments: { emailId: String(item?.email?.id ?? ''), reply: String(item?.replyDraft ?? '') } },
                { serverUrl, router }
              );
              const msgs = Array.isArray(res?.messages) ? res.messages : [];
              if (msgs.length) await appendChatMessages(msgs);
              else await appendChatMessages([{ role: 'assistant', content: isCompose ? 'Sent email.' : 'Sent reply.' }]);
            } catch {
              await appendChatMessages([{ role: 'assistant', content: 'Failed to send.' }]);
            } finally {
              setIsAssistantTyping(false);
            }
          }}
          style={{ backgroundColor: '#22AB93', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
