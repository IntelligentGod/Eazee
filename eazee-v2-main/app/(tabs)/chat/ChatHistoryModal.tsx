import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { ChatSessionListItem } from './types';

type ChatHistoryModalProps = {
  visible: boolean;
  sessions: ChatSessionListItem[];
  activeSessionId: string | null;
  showSummaries?: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
};

function formatChatDate(timestamp: number) {
  const value = timestamp || Date.now();
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function ChatHistoryRow({
  isActive,
  session,
  showSummaries,
  onDeleteSession,
  onSelectSession,
  onTogglePin,
}: {
  isActive: boolean;
  session: ChatSessionListItem;
  showSummaries?: boolean;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onSelectSession(session.id)}
      style={{ marginBottom: 10 }}
    >
      <LinearGradient
        colors={isActive ? ['#04534D', '#032F2E'] : ['#067369', '#004643']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          minHeight: 56,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(173, 255, 240, 0.55)',
          paddingLeft: 38,
          paddingRight: 38,
          paddingVertical: 14,
          justifyContent: 'center',
          shadowColor: '#001A17',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <TouchableOpacity
          onPress={() => onTogglePin(session.id, session.pinned)}
          style={{ position: 'absolute', top: 8, left: 10, zIndex: 2 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MIcon name={session.pinned ? 'pin' : 'pin-outline'} size={13} color={session.pinned ? '#FFFFFF' : '#21A19B'} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDeleteSession(session.id)}
          style={{ position: 'absolute', top: 8, right: 10, zIndex: 2 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MIcon name="trash-can-outline" size={13} color="#137D78" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, color: '#F4FFFD', fontSize: 13, fontWeight: '700' }}>
            {session.title || 'New Chat'}
          </Text>
          <Text style={{ color: '#5CA49F', fontSize: 11, fontWeight: '500' }}>
            {formatChatDate(session.lastMessageAt || session.createdAt)}
          </Text>
        </View>
        {showSummaries && (
          <Text
            style={{ color: '#C7F6F1', fontSize: 12, lineHeight: 17, marginTop: 8 }}
            numberOfLines={3}
          >
            {session.summary?.trim() || 'No summary saved yet.'}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function ChatHistoryModal({
  visible,
  sessions,
  activeSessionId,
  showSummaries = false,
  onClose,
  onSelectSession,
  onTogglePin,
  onDeleteSession,
}: ChatHistoryModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={1}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            position: 'absolute',
            top: 12,
            left: 16,
            right: 16,
            bottom: 128,
            backgroundColor: 'rgba(0, 60, 55, 0.92)',
            borderRadius: 28,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14, minHeight: 34 }}>
            <Text style={{ color: '#3DC5B5', fontSize: 28, fontWeight: '700' }}>
              {showSummaries ? 'Chats TST' : 'Chats'}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ position: 'absolute', right: 0, top: '50%', marginTop: -14 }}>
              <MIcon name="close" size={28} color="#1DAFB2" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {sessions.length === 0 && (
              <Text style={{ color: '#BEE7E1', textAlign: 'center', marginTop: 24 }}>No chats yet</Text>
            )}
            {sessions.map((session) => (
              <ChatHistoryRow
                key={session.id}
                isActive={session.id === activeSessionId}
                session={session}
                showSummaries={showSummaries}
                onDeleteSession={onDeleteSession}
                onSelectSession={onSelectSession}
                onTogglePin={onTogglePin}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
