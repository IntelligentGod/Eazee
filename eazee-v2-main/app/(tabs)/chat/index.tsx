import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Keyboard, Platform, SafeAreaView, Text, TouchableOpacity, View, Alert, Image, ImageBackground, StatusBar as RNStatusBar } from 'react-native';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDeepgramTranscription } from '../../../lib/useDeepgramTranscription';
import { getDeepgramConfig } from '../../../config/deepgram';
import { database } from '../../../database/database';
import ChatSessionModel from '../../../database/models/ChatSessionModel';
import { executeToolCall } from './tools/engine';
import { getCreatedCalendarItems, getCreatedTodoItems, getLastDayPlan, getLastEmailItems, getLastEmailPageToken, getLastQueryItems, getLastEmailDraft, getLastCalendarItems, resetToolMemory, setLastCalendarItems } from './tools/memory';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import { TodoCard, EmailListCard, EmailDetailCard, EmailDraftCard, CalendarListCard, CalendarDetailCard, DailyOverviewCard, DayPlanCard } from './cards';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import AIInputBox from '@/components/AIInputBox';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import SSEEventSource from 'react-native-sse';
import { buildChatSystemMessages } from './prompt';
import { ChatHistoryModal } from './ChatHistoryModal';
import { appendChatMessagesToSession, deleteChatSessionById, deriveChatSessionTitle, ensureChatSession, isMeaningfulChatMessage, listChatSessions, loadChatSession, normalizeChatSessionTitle, updateChatSessionPin } from './history';
import type { ChatSessionListItem, ChatUIMessage } from './types';
import type { CompactAiChatHandoff } from '@/lib/useCompactTabAI';

const CALENDAR_CARD_TYPES = new Set(['calendarList', 'calendarDetail']);
const STREAM_FLUSH_MS = 16;

function buildAssistantMetaCard(meta: any) {
  if (meta?.webSearch) {
    return {
      type: 'webSearch',
      query: typeof meta?.webSearchQuery === 'string' ? meta.webSearchQuery : '',
    };
  }

  return undefined;
}

function logChatStream(event: string, details?: Record<string, unknown>) {
  void event;
  void details;
}

function isCalendarRedisplayRequest(text: string) {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!clean) return false;

  return (
    /^(?:can you |could you |would you |please )?(?:show|display|open|view|pull up|bring up|list) (?:me )?(?:it|them|that|those)(?: again)?$/.test(clean) ||
    /^(?:can you |could you |would you |please )?(?:show|display|open|view|pull up|bring up|list) (?:the )?(?:event|events|meeting|meetings|calendar|card|list)(?: again| back)$/.test(clean)
  );
}

function findLatestCalendarCard(messages: ChatUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    const cardType = typeof message?.card?.type === 'string' ? message.card.type : '';
    if (CALENDAR_CARD_TYPES.has(cardType)) {
      return message;
    }
  }
  return null;
}

function isDraftDayPlanMessage(message: ChatUIMessage) {
  if (message?.role !== 'assistant' || message?.card?.type !== 'dayPlan') return false;
  const content = typeof message.content === 'string' ? message.content.toLowerCase() : '';
  return content.includes("i'll save it") || content.includes('reply with any edits');
}

function findLatestDraftDayPlanMessage(messages: ChatUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isDraftDayPlanMessage(message)) {
      return message;
    }
  }
  return null;
}

function isDayPlanSaveConfirmation(text: string) {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/,\s*/g, ' ')
    .replace(/\s+/g, ' ');

  if (!clean) return false;

  if (/^(?:yes|yeah|yep|sure|ok|okay)$/.test(clean)) {
    return true;
  }

  return /^(?:(?:yes|yeah|yep|sure|ok|okay)\s+)?(?:looks good|looks great|sounds good|save|save it|save the plan|confirm|confirmed|go ahead|do it|add it|put it in my calendar and todos)$/.test(clean);
}

const CALENDAR_QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'any',
  'are',
  'at',
  'be',
  'do',
  'does',
  'for',
  'have',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'scheduled',
  'the',
  'there',
  'to',
]);

function normalizeCalendarQueryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCalendarQueryTokens(value: string) {
  return normalizeCalendarQueryText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !CALENDAR_QUERY_STOP_WORDS.has(token));
}

function findLastCalendarFollowUpMatches(text: string) {
  const normalized = normalizeCalendarQueryText(text);
  if (!normalized) return [];

  const match = normalized.match(
    /^(?:do i have(?: any)?|did i have(?: any)?|what about|how about|is there(?: any)?|is|am i going to|am i attending|show me)\s+(.+)$/
  );
  if (!match) return [];

  const rawQuery = match[1]
    .replace(/\b(?:coming up|scheduled|on my calendar|in my calendar|for me)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rawQuery || /^(?:it|that|them|those|anything|something|events?)$/.test(rawQuery)) return [];

  const queryTokens = getCalendarQueryTokens(rawQuery);
  if (!queryTokens.length) return [];

  return (getLastCalendarItems() || []).filter((item) => {
    const title = typeof item?.title === 'string' ? item.title : '';
    const normalizedTitle = normalizeCalendarQueryText(title);
    if (!normalizedTitle) return false;
    if (normalizedTitle.includes(rawQuery) || rawQuery.includes(normalizedTitle)) return true;

    const titleTokens = new Set(getCalendarQueryTokens(title));
    const matchedTokens = queryTokens.filter((token) => titleTokens.has(token)).length;
    if (matchedTokens === queryTokens.length) return true;
    return matchedTokens >= Math.min(2, queryTokens.length) && matchedTokens / queryTokens.length >= 0.6;
  });
}

function readRouteParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

function parseCompactHandoff(value: string): CompactAiChatHandoff | null {
  try {
    const parsed = JSON.parse(value);
    const surface = parsed?.surface;
    const history = Array.isArray(parsed?.history)
      ? parsed.history
          .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
          .map((item: any) => ({
            role: item.role,
            content: item.content.trim(),
          }))
          .filter((item: { content: string }) => item.content.length > 0)
      : [];
    const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim() : '';

    if (surface !== 'todo' && surface !== 'calendar' && surface !== 'home') {
      return null;
    }

    return {
      surface,
      history,
      reason,
    };
  } catch {
    return null;
  }
}

function buildCompactHandoffRequest(handoff: CompactAiChatHandoff) {
  const history = handoff.history.slice(-6);
  const latestUserMessage = [...history].reverse().find((message) => message.role === 'user')?.content || '';
  const transcript = history
    .map((message) => {
      if (/^HANDOFF:\s*/i.test(message.content)) {
        return `Compact AI: ${message.content.replace(/^HANDOFF:\s*/i, '').trim()}`;
      }
      return `${message.role === 'user' ? 'User' : 'Compact AI'}: ${message.content}`;
    })
    .join('\n');

  const hiddenMessages = [
    [
      'Compact AI handoff context.',
      `Started in the ${handoff.surface} tab.`,
      handoff.reason ? `Handoff reason: ${handoff.reason}` : '',
      transcript ? `Recent compact context:\n${transcript}` : '',
      'Continue naturally without asking the user to repeat any of this context.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  ]
    .filter(Boolean)
    .map((content) => ({ role: 'system' as const, content }));

  return {
    hiddenMessages,
    requestText: latestUserMessage || 'Continue the request from Compact AI.',
  };
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { compactHandoff, compactHandoffNonce } = useLocalSearchParams<{
    compactHandoff?: string | string[];
    compactHandoffNonce?: string | string[];
  }>();
  const [microphoneColor, setMicrophoneColor] = useState('#FFFFFF');
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [inputValue, setInputValue] = useState('');
  const router = useRouter();
  const isFocused = useIsFocused();
  const SERVER_URL = 'https://king-prawn-app-j9c6x.ondigitalocean.app';
  const compactHandoffValue = readRouteParam(compactHandoff);
  const compactHandoffKey = readRouteParam(compactHandoffNonce);
  const hasPendingCompactHandoff = !!compactHandoffValue && !!compactHandoffKey;
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const [aiInputHeight, setAiInputHeight] = useState(68);
  const aiInputSpacer = floatingTabBarInset + aiInputHeight + 6;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const activeAiInputSpacer = isKeyboardVisible ? aiInputHeight + 16 : aiInputSpacer;

  const eventSourceRef = useRef<any>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatUIMessage[]>([]);
  const [isBootstrappingCompactHandoff, setIsBootstrappingCompactHandoff] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionSummary, setActiveSessionSummary] = useState('');
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [isSummaryTestMode, setIsSummaryTestMode] = useState(false);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [typingSessionIds, setTypingSessionIds] = useState<string[]>([]);
  const typingAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<any>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollAnimatedRef = useRef(true);
  const inputRef = useRef<any>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const isCreatingNewChatRef = useRef(false);
  const chatMessagesRef = useRef<ChatUIMessage[]>([]);
  const handleToolCallRef = useRef<((payload: any, sessionIdOverride?: string | null) => Promise<void>) | null>(null);
  const sseReadyResolversRef = useRef<((clientId: string | null) => void)[]>([]);
  const callSessionMapRef = useRef(new Map<string, string>());
  const callRequestMapRef = useRef(new Map<string, string>());
  const requestSessionMapRef = useRef(new Map<string, string>());
  const handledCompactHandoffRef = useRef<string | null>(null);
  const initialSessionLoadRef = useRef(false);
  const pendingStreamChunksRef = useRef(new Map<string, string>());
  const streamFlushTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => { clientIdRef.current = clientId; }, [clientId]);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

  const deepgramConfig = getDeepgramConfig();
  const sendTextMessageRef = useRef<((text: string) => void) | null>(null);
  const {
    isStreaming,
    partialTranscript,
    startListening: deepgramStartListening,
    stopListening: deepgramStopListening,
  } = useDeepgramTranscription({
    apiKey: deepgramConfig.apiKey,
    model: deepgramConfig.model,
    language: deepgramConfig.language,
    onFinalTranscript: (transcript) => {
      sendTextMessageRef.current?.(transcript.trim());
    },
    onError: (error) => {
      Alert.alert('Transcription Error', error);
    },
  });

  const isListening = isStreaming;
  const isCurrentSessionTyping = !!activeSessionId && typingSessionIds.includes(activeSessionId);
  const showCompactHandoffLoader = isBootstrappingCompactHandoff && chatMessages.length === 0;

  const stopAssistantTyping = useCallback((sessionId?: string | null) => {
    if (!sessionId) return;
    setTypingSessionIds((current) => current.filter((id) => id !== sessionId));
  }, []);

  const replaceVisibleChat = useCallback((sessionId: string | null, messages: ChatUIMessage[], summary = '') => {
    activeSessionIdRef.current = sessionId;
    chatMessagesRef.current = messages;
    setActiveSessionId(sessionId);
    setActiveSessionSummary(summary);
    setChatMessages(messages);
  }, []);

  const refreshChatSessions = useCallback(async () => {
    try {
      const sessions = await listChatSessions();
      setChatSessions(sessions);
      return sessions;
    } catch {
      return [];
    }
  }, []);

  const loadSessionIntoChat = useCallback(async (sessionId: string) => {
    try {
      const { session, messages } = await loadChatSession(sessionId);
      resetToolMemory();
      replaceVisibleChat(session.id, messages, session.summary || '');
    } catch (error) {
      console.error('Failed to load chat session:', error);
      Alert.alert('Error', 'Could not load this chat session.');
    }
  }, [replaceVisibleChat]);

  const appendMessagesToSession = useCallback(async (
    targetSessionId: string | null,
    messages: ChatUIMessage[],
    options?: { showInVisibleChat?: boolean; seedMessages?: ChatUIMessage[] }
  ) => {
    const meaningful = messages.filter((message) => isMeaningfulChatMessage(message));
    if (!meaningful.length) return targetSessionId;
    const titleSourceMessages = options?.seedMessages || chatMessagesRef.current.concat(meaningful);
    const sessionId = await appendChatMessagesToSession(targetSessionId, messages, {
      seedMessages: options?.seedMessages,
      titleSourceMessages,
    });
    if (!sessionId) return null;
    if (options?.showInVisibleChat) {
      if (activeSessionIdRef.current !== sessionId) {
        replaceVisibleChat(sessionId, meaningful, '');
      } else {
        const nextMessages = [...chatMessagesRef.current, ...meaningful];
        chatMessagesRef.current = nextMessages;
        setChatMessages(nextMessages);
      }
    }
    await refreshChatSessions();
    return sessionId;
  }, [refreshChatSessions, replaceVisibleChat]);

  const updateStreamingMessage = useCallback((sessionId: string, requestId: string, updater: (message?: ChatUIMessage) => ChatUIMessage | null) => {
    if (sessionId !== activeSessionIdRef.current) return;
    const messageId = `stream-${requestId}`;
    const currentMessages = chatMessagesRef.current;
    const index = currentMessages.findIndex((message) => message.id === messageId);
    const nextMessage = updater(index >= 0 ? currentMessages[index] : undefined);
    const previousLength = index >= 0 ? (currentMessages[index]?.content || '').length : 0;
    let nextMessages = currentMessages;

    if (nextMessage) {
      const normalizedMessage = { ...nextMessage, id: messageId };
      nextMessages = index >= 0
        ? currentMessages.map((message, messageIndex) => messageIndex === index ? normalizedMessage : message)
        : [...currentMessages, normalizedMessage];
    } else if (index >= 0) {
      nextMessages = currentMessages.filter((message) => message.id !== messageId);
    }

    if (nextMessages === currentMessages) return;
    logChatStream('update-visible-message', {
      sessionId,
      requestId,
      hadExistingMessage: index >= 0,
      previousLength,
      nextLength: nextMessage?.content?.length || 0,
      totalMessages: nextMessages.length,
    });
    chatMessagesRef.current = nextMessages;
    setChatMessages(nextMessages);
  }, []);

  const clearPendingStreamChunks = useCallback((requestId: string) => {
    pendingStreamChunksRef.current.delete(requestId);
    const timeoutId = streamFlushTimeoutsRef.current.get(requestId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      streamFlushTimeoutsRef.current.delete(requestId);
    }
  }, []);

  const clearAllPendingStreamChunks = useCallback(() => {
    for (const timeoutId of streamFlushTimeoutsRef.current.values()) {
      clearTimeout(timeoutId);
    }
    streamFlushTimeoutsRef.current.clear();
    pendingStreamChunksRef.current.clear();
  }, []);

  const flushPendingStreamChunks = useCallback((requestId: string, force = false) => {
    const sessionId = requestSessionMapRef.current.get(requestId) || null;
    const chunk = pendingStreamChunksRef.current.get(requestId) || '';

    if (!sessionId || !chunk) {
      clearPendingStreamChunks(requestId);
      return;
    }

    pendingStreamChunksRef.current.delete(requestId);
    stopAssistantTyping(sessionId);
    updateStreamingMessage(sessionId, requestId, (message) => ({
      role: 'assistant',
      content: `${message?.content || ''}${chunk}`,
      isStreaming: true,
    }));
  }, [clearPendingStreamChunks, stopAssistantTyping, updateStreamingMessage]);

  const schedulePendingStreamFlush = useCallback((requestId: string) => {
    if (streamFlushTimeoutsRef.current.has(requestId)) return;
    const timeoutId = setTimeout(() => {
      streamFlushTimeoutsRef.current.delete(requestId);
      flushPendingStreamChunks(requestId, false);
    }, STREAM_FLUSH_MS);
    streamFlushTimeoutsRef.current.set(requestId, timeoutId);
  }, [flushPendingStreamChunks]);

  const finalizeStreamingMessage = useCallback(async (requestId: string, content: string, meta?: any) => {
    const sessionId = requestSessionMapRef.current.get(requestId) || null;
    if (!sessionId) {
      logChatStream('finalize-missing-session', { requestId, contentLength: content.length });
      return;
    }
    clearPendingStreamChunks(requestId);
    requestSessionMapRef.current.delete(requestId);

    const trimmedContent = content.trim();
    logChatStream('finalize-message', {
      sessionId,
      requestId,
      contentLength: trimmedContent.length,
    });
    const card = buildAssistantMetaCard(meta);
    if (trimmedContent) {
      await appendMessagesToSession(sessionId, [{ role: 'assistant', content: trimmedContent, card }], { showInVisibleChat: false });
      if (sessionId === activeSessionIdRef.current) {
        updateStreamingMessage(sessionId, requestId, (message) => ({
          role: 'assistant',
          content: trimmedContent,
          card: card || message?.card,
          isStreaming: false,
        }));
      }
    } else {
      updateStreamingMessage(sessionId, requestId, () => null);
    }
  }, [appendMessagesToSession, clearPendingStreamChunks, updateStreamingMessage]);

  const startAssistantTyping = useCallback((sessionId?: string | null) => {
    if (!sessionId) return;
    setTypingSessionIds((current) => current.includes(sessionId) ? current : [...current, sessionId]);
  }, []);

  const waitForStreamingClientId = useCallback(async (timeoutMs = 1200) => {
    if (clientIdRef.current) return clientIdRef.current;
    if (!eventSourceRef.current) return null;

    logChatStream('wait-for-sse-ready', { timeoutMs });

    return await new Promise<string | null>((resolve) => {
      let settled = false;

      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        try { clearTimeout(timeout); } catch { }
        resolve(value);
      };

      const timeout = setTimeout(() => {
        sseReadyResolversRef.current = sseReadyResolversRef.current.filter((item) => item !== finish);
        finish(clientIdRef.current || null);
      }, timeoutMs);

      sseReadyResolversRef.current.push(finish);
    });
  }, []);

  const setAssistantTypingForActiveSession = useCallback((value: boolean) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    if (value) {
      startAssistantTyping(sessionId);
    } else {
      stopAssistantTyping(sessionId);
    }
  }, [startAssistantTyping, stopAssistantTyping]);

  const parseSummaryPayload = useCallback((raw: string) => {
    const clean = (raw || '').trim();
    if (!clean) return { title: '', summary: '' };
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
          summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        };
      } catch { }
    }
    return { title: '', summary: clean };
  }, []);

  const formatChatDateForModel = useCallback((value?: string | null, hasDueTime?: boolean) => {
    if (!value) return '';
    const date = parseCalendarDateValue(value);
    if (!date) return String(value);
    if (hasDueTime) {
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, []);

  const summarizeCardForModel = useCallback((card: any) => {
    if (!card || typeof card !== 'object') return '';

    if (card.type === 'webSearch') {
      const query = typeof card.query === 'string' ? card.query.trim() : '';
      return query
        ? `The previous assistant answer came from a live web search for: ${query}`
        : 'The previous assistant answer came from a live web search.';
    }

    if (card.type === 'todoCreated' || card.type === 'todoUpdated' || card.type === 'todoQuery') {
      const items = Array.isArray(card.items) ? card.items : [];
      return items
        .slice(0, 8)
        .map((item: any) => {
          const text = String(item?.text || '').trim();
          const due = formatChatDateForModel(item?.dueDate, !!item?.hasDueTime);
          return text ? `Task: ${text}${due ? ` | due ${due}` : ''}` : '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (card.type === 'calendarDetail' || card.type === 'calendarList') {
      const items = Array.isArray(card.items) ? card.items : [];
      return items
        .slice(0, 8)
        .map((item: any) => {
          const title = String(item?.title || '').trim();
          const hasTime = item?.isAllDay !== true;
          const start = formatChatDateForModel(item?.startDate, hasTime);
          const end = formatChatDateForModel(item?.endDate, hasTime);
          const schedule = start ? `${start}${end ? ` to ${end}` : ''}` : '';
          return title ? `Event: ${title}${schedule ? ` | ${schedule}` : ''}` : '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (card.type === 'dailyOverview') {
      const date = typeof card.date === 'string' ? card.date : '';
      const todoCount = Array.isArray(card.todos) ? card.todos.length : 0;
      const calendarCount = Array.isArray(card.calendar) ? card.calendar.length : 0;
      const emailCount = Array.isArray(card.emails) ? card.emails.length : 0;
      return `Overview for ${date || 'the day'}: ${todoCount} tasks, ${calendarCount} events, ${emailCount} emails.`;
    }

    if (card.type === 'dayPlan') {
      const date = typeof card.date === 'string' ? card.date : '';
      const todoCount = Array.isArray(card.todoItems) ? card.todoItems.length : 0;
      const calendarCount = Array.isArray(card.calendarItems) ? card.calendarItems.length : 0;
      return `Plan for ${date || 'the day'}: ${todoCount} tasks and ${calendarCount} events.`;
    }

    return '';
  }, [formatChatDateForModel]);

  const serializeMessageForModel = useCallback((message: ChatUIMessage) => {
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    const cardSummary = summarizeCardForModel(message.card);
    if (content && cardSummary) return `${content}\n${cardSummary}`;
    return content || cardSummary;
  }, [summarizeCardForModel]);

  const summarizeSession = useCallback(async (sessionId: string, messages: ChatUIMessage[]) => {
    const meaningful = messages.filter((message) => isMeaningfulChatMessage(message));
    if (!meaningful.length) return;
    try {
      const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
      const recent = meaningful
        .slice(-20)
        .map((message) => ({
          role: message.role,
          content: serializeMessageForModel(message),
        }))
        .filter((message) => message.content.trim().length > 0);
      if (!recent.length) return;
      const resp = await fetch(`${SERVER_URL}/ai/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientIdRef.current || undefined,
          messages: [
            {
              role: 'system',
              content: 'Create a concise rolling summary and title for this chat session. Respond only as JSON with keys: title, summary. Do not call tools. Keep summary under 600 characters. Make the title usually 3 to 4 words, use fewer when enough, and never exceed 5 words.'
            },
            ...(session.summary ? [{ role: 'system', content: `Previous summary: ${session.summary}` }] : []),
            ...recent,
          ],
        }),
      });
      if (!resp.ok) return;
      const json = await resp.json().catch(() => null);
      const content = String(json?.result?.message?.content || '').trim();
      const parsed = parseSummaryPayload(content);
      const fallbackTitle = deriveChatSessionTitle(messages);
      const nextTitle = normalizeChatSessionTitle(parsed.title) || fallbackTitle;
      const nextSummary = parsed.summary || session.summary || '';
      await database.write(async () => {
        const fresh = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
        await fresh.update((record) => {
          record.title = nextTitle;
          record.summary = nextSummary;
        });
      });
      if (sessionId === activeSessionIdRef.current) {
        setActiveSessionSummary(nextSummary);
      }
      await refreshChatSessions();
    } catch { }
  }, [SERVER_URL, parseSummaryPayload, refreshChatSessions, serializeMessageForModel]);

  useEffect(() => {
    if (initialSessionLoadRef.current) return;
    initialSessionLoadRef.current = true;

    const boot = async () => {
      const sessions = await refreshChatSessions();
      try {
        if (!hasPendingCompactHandoff && sessions.length > 0) {
          await loadSessionIntoChat(sessions[0].id);
        }
      } catch { }
    };
    boot();
  }, [hasPendingCompactHandoff, loadSessionIntoChat, refreshChatSessions]);

  useEffect(() => {
    if (!isHistoryModalVisible) return;
    void refreshChatSessions();
  }, [isHistoryModalVisible, refreshChatSessions]);

  useEffect(() => {
    if (isCurrentSessionTyping) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(typingAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      typingAnim.setValue(0);
    }
  }, [isCurrentSessionTyping, typingAnim]);

  useEffect(() => {
    setMicrophoneColor(isListening ? '#12F61A' : '#FFFFFF');
    if (isListening) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(glowAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isListening, glowAnim]);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      setIsKeyboardVisible(true);
      if (Platform.OS !== 'ios') return;
      const keyboardHeight = e?.endCoordinates?.height || 0;
      const nextOffset = Math.max(0, keyboardHeight - aiInputBottom);
      Animated.timing(keyboardOffset, {
        toValue: nextOffset,
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 250,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (e: any) => {
      setIsKeyboardVisible(false);
      if (Platform.OS !== 'ios') return;
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 250,
        useNativeDriver: true,
      }).start();
    };
    const subShow = Keyboard.addListener(show, onShow);
    const subHide = Keyboard.addListener(hide, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [aiInputBottom, keyboardOffset]);


  const scrollToBottom = useCallback((animated = true) => {
    try {
      const node: any = scrollViewRef.current;
      if (!node) return;
      if (typeof node.scrollToEnd === 'function') {
        node.scrollToEnd({ animated });
      } else if (typeof node.getNode === 'function') {
        const realNode = node.getNode?.();
        realNode?.scrollToEnd?.({ animated });
      }
    } catch { }
  }, []);

  const flushQueuedScrollToBottom = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      try { cancelAnimationFrame(scrollFrameRef.current); } catch { }
      scrollFrameRef.current = null;
    }
    if (scrollFallbackTimeoutRef.current) {
      clearTimeout(scrollFallbackTimeoutRef.current);
      scrollFallbackTimeoutRef.current = null;
    }
    const animated = pendingScrollAnimatedRef.current;
    pendingScrollAnimatedRef.current = true;
    scrollToBottom(animated);
  }, [scrollToBottom]);

  const queueScrollToBottom = useCallback((animated = true) => {
    pendingScrollAnimatedRef.current = pendingScrollAnimatedRef.current && animated;
    if (scrollFrameRef.current !== null || scrollFallbackTimeoutRef.current) return;
    try {
      scrollFrameRef.current = requestAnimationFrame(() => {
        flushQueuedScrollToBottom();
      });
    } catch { }
    scrollFallbackTimeoutRef.current = setTimeout(() => {
      flushQueuedScrollToBottom();
    }, 32);
  }, [flushQueuedScrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        try { cancelAnimationFrame(scrollFrameRef.current); } catch { }
      }
      if (scrollFallbackTimeoutRef.current) {
        clearTimeout(scrollFallbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    queueScrollToBottom(!isCurrentSessionTyping);
  }, [chatMessages.length, isCurrentSessionTyping, queueScrollToBottom]);

  useEffect(() => {
    queueScrollToBottom(false);
  }, [activeAiInputSpacer, queueScrollToBottom]);

  // SSE connect
  useEffect(() => {
    if (eventSourceRef.current) return;
    try {
      const es = new SSEEventSource<string>(`${SERVER_URL}/events`);
      eventSourceRef.current = es;
      es.addEventListener('ready', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const nextClientId = data?.clientId ? String(data.clientId) : null;
          if (nextClientId) {
            clientIdRef.current = nextClientId;
            setClientId(nextClientId);
          }
          logChatStream('sse-ready', { clientId: nextClientId });
          if (nextClientId && sseReadyResolversRef.current.length > 0) {
            const resolvers = [...sseReadyResolversRef.current];
            sseReadyResolversRef.current = [];
            for (const resolve of resolvers) {
              resolve(nextClientId);
            }
          }
        } catch { }
      });
      es.addEventListener('assistant.start', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          if (!requestId) return;
          const sessionId = requestSessionMapRef.current.get(requestId);
          logChatStream('assistant-start', {
            requestId,
            sessionId: sessionId || null,
            activeSessionId: activeSessionIdRef.current,
          });
          if (!sessionId) return;
          startAssistantTyping(sessionId);
        } catch { }
      });
      es.addEventListener('assistant.delta', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const delta = typeof data?.delta === 'string' ? data.delta : '';
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          logChatStream('assistant-delta', {
            requestId,
            sessionId,
            deltaLength: delta.length,
            deltaPreview: delta.slice(0, 80),
          });
          if (!requestId || !delta || !sessionId) return;
          pendingStreamChunksRef.current.set(requestId, `${pendingStreamChunksRef.current.get(requestId) || ''}${delta}`);
          schedulePendingStreamFlush(requestId);
        } catch { }
      });
      es.addEventListener('assistant.done', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const content = typeof data?.content === 'string' ? data.content : '';
          const meta = data?.meta;
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          logChatStream('assistant-done', {
            requestId,
            sessionId,
            contentLength: content.length,
          });
          if (!requestId || !sessionId) return;
          stopAssistantTyping(sessionId);
          void finalizeStreamingMessage(requestId, content, meta);
        } catch { }
      });
      es.addEventListener('assistant.reset', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          if (!requestId || !sessionId) return;
          clearPendingStreamChunks(requestId);
          updateStreamingMessage(sessionId, requestId, () => null);
        } catch { }
      });
      es.addEventListener('assistant.error', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          const error = String(data?.error || 'Something went wrong while generating that response.');
          logChatStream('assistant-error', {
            requestId,
            sessionId,
            error,
          });
          if (!sessionId) return;
          clearPendingStreamChunks(requestId);
          updateStreamingMessage(sessionId, requestId, () => null);
          requestSessionMapRef.current.delete(requestId);
          void appendMessagesToSession(sessionId, [
            { role: 'assistant', content: `I ran into a problem while trying that. (${error})` },
          ], { showInVisibleChat: sessionId === activeSessionIdRef.current });
          stopAssistantTyping(sessionId);
        } catch { }
      });
      es.addEventListener('tool.call', async (evt: any) => {
        try {
          const payload = JSON.parse(evt.data || '{}');
          const callId = payload?.callId ? String(payload.callId) : '';
          const requestId = payload?.clientRequestId ? String(payload.clientRequestId) : '';
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          if (callId && sessionId) {
            callSessionMapRef.current.set(callId, sessionId);
            callRequestMapRef.current.set(callId, requestId);
          }
          if (sessionId && requestId) {
            clearPendingStreamChunks(requestId);
            updateStreamingMessage(sessionId, requestId, () => null);
          }
          await handleToolCallRef.current?.(payload);
        } catch { }
      });
      es.addEventListener('tool.validation_error', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const name = String(data?.name || 'unknown tool');
          const err = String(data?.error || 'validation error');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = data?.callId
            ? callSessionMapRef.current.get(String(data.callId)) || (requestId ? requestSessionMapRef.current.get(requestId) || null : null) || activeSessionIdRef.current
            : (requestId ? requestSessionMapRef.current.get(requestId) || null : null) || activeSessionIdRef.current;
          void appendMessagesToSession(sessionId || null, [
            { role: 'assistant', content: `I ran into a problem while trying that. (${name}: ${err})` },
          ], { showInVisibleChat: sessionId === activeSessionIdRef.current });
          if (requestId && sessionId) {
            clearPendingStreamChunks(requestId);
            updateStreamingMessage(sessionId, requestId, () => null);
            requestSessionMapRef.current.delete(requestId);
          }
          stopAssistantTyping(sessionId || null);
        } catch { }
      });
      es.addEventListener('tool.server_not_implemented', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const name = String(data?.name || 'unknown tool');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = data?.callId
            ? callSessionMapRef.current.get(String(data.callId)) || (requestId ? requestSessionMapRef.current.get(requestId) || null : null) || activeSessionIdRef.current
            : (requestId ? requestSessionMapRef.current.get(requestId) || null : null) || activeSessionIdRef.current;
          void appendMessagesToSession(sessionId || null, [
            { role: 'assistant', content: `That action (${name}) isn’t available yet.` },
          ], { showInVisibleChat: sessionId === activeSessionIdRef.current });
          if (requestId && sessionId) {
            clearPendingStreamChunks(requestId);
            updateStreamingMessage(sessionId, requestId, () => null);
            requestSessionMapRef.current.delete(requestId);
          }
          stopAssistantTyping(sessionId || null);
        } catch { }
      });
      es.addEventListener('tool.result', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const callId = data?.callId ? String(data.callId) : '';
          const sessionId = callId ? callSessionMapRef.current.get(callId) || null : null;
          const requestId = callId ? callRequestMapRef.current.get(callId) || '' : '';
          if (callId) {
            callSessionMapRef.current.delete(callId);
            callRequestMapRef.current.delete(callId);
          }
          if (requestId) {
            clearPendingStreamChunks(requestId);
            requestSessionMapRef.current.delete(requestId);
          }
          stopAssistantTyping(sessionId);
        } catch { }
      });
    } catch { }
    return () => {
      if (sseReadyResolversRef.current.length > 0) {
        const resolvers = [...sseReadyResolversRef.current];
        sseReadyResolversRef.current = [];
        for (const resolve of resolvers) {
          resolve(null);
        }
      }
      clearAllPendingStreamChunks();
      try { eventSourceRef.current?.close?.(); } catch { }
      eventSourceRef.current = null;
    };
  }, [SERVER_URL, appendMessagesToSession, clearAllPendingStreamChunks, clearPendingStreamChunks, finalizeStreamingMessage, schedulePendingStreamFlush, startAssistantTyping, stopAssistantTyping, updateStreamingMessage]);

  const handleToolCall = useCallback(async (payload: any, sessionIdOverride?: string | null) => {
    const { callId, name } = payload || {};
    const args = payload?.arguments;
    const requestId = payload?.clientRequestId ? String(payload.clientRequestId) : '';
    const sessionId = sessionIdOverride
      || (callId ? callSessionMapRef.current.get(String(callId)) || null : null)
      || (requestId ? requestSessionMapRef.current.get(requestId) || null : null)
      || activeSessionIdRef.current;
    let res: any = null;
    try {
      res = await executeToolCall({ callId, name, arguments: args }, { serverUrl: SERVER_URL, router });
    } catch (e: any) {
      res = { success: false, error: String(e?.message || e || 'Tool execution failed'), messages: [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }] };
    }
    try {
      const cid = clientIdRef.current || '';
      await fetch(`${SERVER_URL}/ai/tools/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cid, callId, name, clientRequestId: requestId || undefined, success: !!res?.success, result: res?.result ?? null, error: res?.error })
      });
    } catch { }
    try {
      const msgs = Array.isArray(res?.messages) ? res.messages : [];
      if (msgs.length) {
        await appendMessagesToSession(sessionId || null, msgs, { showInVisibleChat: sessionId === activeSessionIdRef.current });
      }
      const acts = Array.isArray(res?.uiActions) ? res.uiActions : [];
      for (const act of acts) {
        if (act?.type === 'navigate') {
          try { router.push({ pathname: act.route, params: act.params || {} }); } catch { }
        }
      }
    } catch { }
    if (callId) {
      callSessionMapRef.current.delete(String(callId));
      callRequestMapRef.current.delete(String(callId));
    }
    if (requestId) {
      requestSessionMapRef.current.delete(requestId);
    }
    stopAssistantTyping(sessionId);
  }, [SERVER_URL, appendMessagesToSession, router, stopAssistantTyping]);

  useEffect(() => {
    handleToolCallRef.current = handleToolCall;
  }, [handleToolCall]);

  const handleNewChat = useCallback(async () => {
    if (isCreatingNewChatRef.current) return;
    const previousSessionId = activeSessionId;
    const previousMessages = [...chatMessages];
    isCreatingNewChatRef.current = true;
    setIsCreatingNewChat(true);
    replaceVisibleChat(null, [], '');
    setInputValue('');
    resetToolMemory();
    try {
      if (previousSessionId && previousMessages.some((message) => isMeaningfulChatMessage(message))) {
        await summarizeSession(previousSessionId, previousMessages);
      }
    } finally {
      isCreatingNewChatRef.current = false;
      setIsCreatingNewChat(false);
    }
  }, [activeSessionId, chatMessages, replaceVisibleChat, summarizeSession]);

  const openHistorySession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) {
      setIsHistoryModalVisible(false);
      return;
    }
    const previousSessionId = activeSessionId;
    const previousMessages = [...chatMessages];
    setIsHistoryModalVisible(false);
    await loadSessionIntoChat(sessionId);
    if (previousSessionId && previousMessages.some((message) => isMeaningfulChatMessage(message))) {
      void summarizeSession(previousSessionId, previousMessages);
    }
  }, [activeSessionId, chatMessages, loadSessionIntoChat, summarizeSession]);

  const toggleSessionPin = useCallback(async (sessionId: string, pinned: boolean) => {
    try {
      await updateChatSessionPin(sessionId, pinned);
      await refreshChatSessions();
    } catch { }
  }, [refreshChatSessions]);

  const deleteSession = useCallback((sessionId: string) => {
    Alert.alert('Delete chat', 'This will permanently delete this chat session.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChatSessionById(sessionId);
            stopAssistantTyping(sessionId);
            if (activeSessionId === sessionId) {
              replaceVisibleChat(null, [], '');
              resetToolMemory();
            }
            await refreshChatSessions();
          } catch { }
        }
      },
    ]);
  }, [activeSessionId, refreshChatSessions, replaceVisibleChat, stopAssistantTyping]);

  const closeHistoryModal = useCallback(() => {
    setIsHistoryModalVisible(false);
    setIsSummaryTestMode(false);
  }, []);

  const sendTextMessage = useCallback(async (
    text: string,
    options?: {
      showUserMessage?: boolean;
      hiddenMessages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
      onRequestStarted?: () => void;
    }
  ) => {
    if (!text.trim()) return;
    try { inputRef.current?.blur?.(); } catch { }
    try { Keyboard.dismiss(); } catch { }
    setInputValue('');
    let requestSessionId: string | null = null;
    const showUserMessage = options?.showUserMessage !== false;
    const hiddenMessages = (options?.hiddenMessages || []).filter((message) => message.content.trim().length > 0);
    try {
      if (showUserMessage) {
        const userMessage: ChatUIMessage = { role: 'user', content: text };
        requestSessionId = await appendMessagesToSession(activeSessionIdRef.current, [userMessage], {
          showInVisibleChat: true,
          seedMessages: [...chatMessagesRef.current, userMessage],
        });
      } else {
        requestSessionId = await ensureChatSession(activeSessionIdRef.current, [{ role: 'user', content: text }]);
        if (requestSessionId && activeSessionIdRef.current !== requestSessionId) {
          replaceVisibleChat(requestSessionId, chatMessagesRef.current, '');
        }
      }
      if (!requestSessionId) {
        return;
      }
      if (showUserMessage && isCalendarRedisplayRequest(text)) {
        const lastCalendarCardMessage = findLatestCalendarCard(chatMessagesRef.current);
        if (lastCalendarCardMessage?.card) {
          const replayMessage: ChatUIMessage = {
            role: 'assistant',
            content: typeof lastCalendarCardMessage.content === 'string' ? lastCalendarCardMessage.content : 'Here it is.',
            card: JSON.parse(JSON.stringify(lastCalendarCardMessage.card)),
          };
          await appendMessagesToSession(requestSessionId, [replayMessage], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
          return;
        }
      }
      const matchedLastCalendarItems = findLastCalendarFollowUpMatches(text);
      if (matchedLastCalendarItems.length > 0) {
        setLastCalendarItems(matchedLastCalendarItems);
        await appendMessagesToSession(requestSessionId, [{
          role: 'assistant',
          content: matchedLastCalendarItems.length === 1 ? 'I found 1 matching event.' : `I found ${matchedLastCalendarItems.length} matching events.`,
          card: { type: 'calendarList', items: matchedLastCalendarItems },
        }], {
          showInVisibleChat: requestSessionId === activeSessionIdRef.current,
        });
        return;
      }
      if (showUserMessage && isDayPlanSaveConfirmation(text) && getLastDayPlan() && findLatestDraftDayPlanMessage(chatMessagesRef.current)) {
        startAssistantTyping(requestSessionId);
        let saveResult: any = null;
        try {
          saveResult = await executeToolCall(
            {
              name: 'save_day_plan',
              arguments: {},
            },
            { serverUrl: SERVER_URL, router }
          );
        } catch (e: any) {
          saveResult = {
            success: false,
            error: String(e?.message || e || 'Tool execution failed'),
            messages: [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }],
          };
        }

        const saveMessages = Array.isArray(saveResult?.messages) ? saveResult.messages : [];
        if (saveMessages.length) {
          await appendMessagesToSession(requestSessionId, saveMessages, {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
        }

        const saveActions = Array.isArray(saveResult?.uiActions) ? saveResult.uiActions : [];
        for (const action of saveActions) {
          if (action?.type === 'navigate') {
            try { router.push({ pathname: action.route, params: action.params || {} }); } catch { }
          }
        }

        stopAssistantTyping(requestSessionId);
        return;
      }
      startAssistantTyping(requestSessionId);
      const cid = clientIdRef.current || await waitForStreamingClientId();
      const clientRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      requestSessionMapRef.current.set(clientRequestId, requestSessionId);
      const expectsStream = !!cid && !!eventSourceRef.current;
      logChatStream('send-message', {
        requestSessionId,
        clientRequestId,
        expectsStream,
        clientId: cid || null,
        activeSessionId: activeSessionIdRef.current,
        promptLength: text.length,
      });
      // Provide local time context so the model returns absolute ISO datetime
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      const now = new Date();
      const offMin = -now.getTimezoneOffset();
      const sign = offMin >= 0 ? '+' : '-';
      const abs = Math.abs(offMin);
      const hh = String(Math.floor(abs / 60)).padStart(2, '0');
      const mm = String(abs % 60).padStart(2, '0');
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const nowLocalIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}${sign}${hh}:${mm}`;
      const history = chatMessagesRef.current
        .slice(-20)
        .map((m) => ({ role: m.role, content: serializeMessageForModel(m) }))
        .filter((m) => m.content.trim().length > 0);
      const requestMessages = showUserMessage
        ? history
        : [
            ...history,
            ...hiddenMessages,
            { role: 'user' as const, content: text },
          ];
      // Provide last email draft context so the model can refine/update instead of refetching
      const ld = getLastEmailDraft();
      const lastEmailDraftContext = ld
        ? {
          present: true,
          kind: ld.email ? 'reply' as const : (ld.compose ? 'compose' as const : 'unknown' as const),
          emailId: ld.email?.id || undefined,
          to: ld.compose?.to || undefined,
          subject: (ld.email?.subject || ld.compose?.subject || undefined),
          replyDraft: ld.replyDraft || '',
        }
        : { present: false };
      const body = {
        clientId: cid || undefined,
        clientRequestId,
        messages: [
          ...buildChatSystemMessages({
            userTimezone: tz,
            nowLocalIso,
            activeSessionSummary,
            lastResults: getLastQueryItems() || [],
            createdTodoItems: getCreatedTodoItems() || [],
            lastEmailDraft: lastEmailDraftContext,
            lastEmailItems: getLastEmailItems() || [],
            lastEmailPageToken: getLastEmailPageToken() || '',
            lastCalendarItems: getLastCalendarItems() || [],
            createdCalendarItems: getCreatedCalendarItems() || [],
            lastDayPlan: getLastDayPlan(),
          }),
          ...requestMessages,
        ]
      };
      const resp = await fetch(`${SERVER_URL}/ai/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      options?.onRequestStarted?.();
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        const msg = (errJson && (errJson.error || errJson.message)) ? String(errJson.error || errJson.message) : `HTTP ${resp.status}`;
        logChatStream('route-http-error', {
          requestSessionId,
          clientRequestId,
          status: resp.status,
          message: msg,
        });
        if (expectsStream && !requestSessionMapRef.current.has(clientRequestId)) {
          stopAssistantTyping(requestSessionId);
          return;
        }
        clearPendingStreamChunks(clientRequestId);
        requestSessionMapRef.current.delete(clientRequestId);
        updateStreamingMessage(requestSessionId, clientRequestId, () => null);
        await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: `I ran into a problem while trying that. (${msg})` }], {
          showInVisibleChat: requestSessionId === activeSessionIdRef.current,
        });
        stopAssistantTyping(requestSessionId);
        return;
      }
      const json = await resp.json().catch(() => null);
      logChatStream('route-response', {
        requestSessionId,
        clientRequestId,
        status: json?.status || null,
        expectsStream,
      });
      // Fallback: if no clientId or SSE missing, execute tool calls inline
      if (json && json.status === 'tool_calls_dispatched') {
        const calls = Array.isArray(json.toolCalls) ? json.toolCalls : [];
        const routingErrors = Array.isArray(json?.routing?.errors) ? json.routing.errors : [];

        if (calls.length === 0) {
          const firstError = routingErrors[0];
          const errorMessage = firstError?.name
            ? `${String(firstError.name)}: ${String(firstError.error || 'Tool routing failed')}`
            : String(firstError?.error || 'Tool routing failed');
          clearPendingStreamChunks(clientRequestId);
          requestSessionMapRef.current.delete(clientRequestId);
          updateStreamingMessage(requestSessionId, clientRequestId, () => null);
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: `I ran into a problem while trying that. (${errorMessage})` }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
          stopAssistantTyping(requestSessionId);
          return;
        }

        if (!expectsStream) {
          for (const call of calls) {
            if (call && call.name) {
              await handleToolCall(call, requestSessionId);
            }
          }
          requestSessionMapRef.current.delete(clientRequestId);
        } else {
          for (const call of calls) {
            if (call?.callId) {
              callSessionMapRef.current.set(String(call.callId), requestSessionId);
              callRequestMapRef.current.set(String(call.callId), clientRequestId);
            }
          }
        }
      } else if (json && json.status === 'no_tool_calls') {
        const content = String(json?.result?.message?.content || '').trim();
        const card = buildAssistantMetaCard(json?.meta);
        if (!expectsStream && content) {
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content, card }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
          requestSessionMapRef.current.delete(clientRequestId);
        } else if (expectsStream && requestSessionMapRef.current.has(clientRequestId)) {
          await finalizeStreamingMessage(clientRequestId, content, json?.meta);
        } else if (!expectsStream) {
          requestSessionMapRef.current.delete(clientRequestId);
        }
        stopAssistantTyping(requestSessionId);
      } else {
        // Unknown response shape
        clearPendingStreamChunks(clientRequestId);
        requestSessionMapRef.current.delete(clientRequestId);
        updateStreamingMessage(requestSessionId, clientRequestId, () => null);
        await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: 'Sorry—something unexpected happened. Please try again.' }], {
          showInVisibleChat: requestSessionId === activeSessionIdRef.current,
        });
        stopAssistantTyping(requestSessionId);
      }
    } catch {
      for (const [requestId, sessionId] of requestSessionMapRef.current.entries()) {
        if (sessionId === requestSessionId) {
          clearPendingStreamChunks(requestId);
          requestSessionMapRef.current.delete(requestId);
          updateStreamingMessage(sessionId, requestId, () => null);
        }
      }
      Alert.alert('Error', 'Failed to send to AI.');
      stopAssistantTyping(requestSessionId);
    }
  }, [SERVER_URL, activeSessionSummary, appendMessagesToSession, clearPendingStreamChunks, finalizeStreamingMessage, handleToolCall, replaceVisibleChat, router, serializeMessageForModel, startAssistantTyping, stopAssistantTyping, updateStreamingMessage, waitForStreamingClientId]);

  useEffect(() => {
    sendTextMessageRef.current = sendTextMessage;
  }, [sendTextMessage]);

  useEffect(() => {
    if (!compactHandoffValue || !compactHandoffKey) return;
    if (handledCompactHandoffRef.current === compactHandoffKey) return;

    const handoff = parseCompactHandoff(compactHandoffValue);
    handledCompactHandoffRef.current = compactHandoffKey;
    router.setParams({
      compactHandoff: undefined,
      compactHandoffNonce: undefined,
    } as any);

    const run = async () => {
      try {
        setIsBootstrappingCompactHandoff(true);
        await handleNewChat();
        if (handoff) {
          const request = buildCompactHandoffRequest(handoff);
          if (request.requestText.trim()) {
            await sendTextMessage(request.requestText, {
              showUserMessage: false,
              hiddenMessages: request.hiddenMessages,
              onRequestStarted: () => {
                setIsBootstrappingCompactHandoff(false);
              },
            });
          }
        }
      } finally {
        setIsBootstrappingCompactHandoff(false);
      }
    };

    void run();
  }, [compactHandoffKey, compactHandoffValue, handleNewChat, router, sendTextMessage]);

  const handleSend = useCallback(() => {
    const text = (inputValue || '').trim();
    if (text) sendTextMessage(text);
  }, [inputValue, sendTextMessage]);

  const handleMicrophonePress = useCallback(() => {
    if (isListening) {
      deepgramStopListening();
    } else {
      deepgramStartListening();
    }
  }, [isListening, deepgramStartListening, deepgramStopListening]);

  return (
    <View style={{ flex: 1, backgroundColor: '#28D5D1' }}>
      {isFocused && (
        <StatusBar style="light" backgroundColor="transparent" translucent={true} />
      )}
      <ImageBackground 
        source={require('../../../assets/images/chat-bg.png')} 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        resizeMode="cover"
      />
      <View
        style={{
          position: 'absolute',
          top: -24,
          left: -12,
          right: -12,
          bottom: -24,
          zIndex: 11,
        }}
        pointerEvents="none"
      >
        <Image
          source={require('../../../assets/images/chat-bg-stars.png')}
          style={{
            width: '100%',
            height: '100%',
            opacity: 0.15,
          }}
          resizeMode="stretch"
        />
      </View>
      <SafeAreaView className="flex-1" style={{ paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, paddingBottom: 0 }}>
          <View style={{ flex: 1 }} />
          <Text
            style={{
              color: '#C8FFFB',
              fontSize: 26,
              fontWeight: 'bold',
              textShadowColor: 'rgba(0, 0, 0, 0.25)',
              textShadowOffset: { width: 0, height: 3 },
              textShadowRadius: 4,
            }}
          >
            AI Chat
          </Text>
          <View style={{ flex: 1, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              onPress={() => {
                setIsSummaryTestMode(false);
                setIsHistoryModalVisible(true);
              }}
              style={{ paddingRight: 10 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MIcon name="bookmark" size={24} color="#01636C" />
            </TouchableOpacity>
            {/*
            <TouchableOpacity
              onPress={() => {
                setIsSummaryTestMode(true);
                setIsHistoryModalVisible(true);
              }}
              style={{
                marginRight: 10,
                minWidth: 34,
                height: 24,
                borderRadius: 12,
                paddingHorizontal: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(1, 99, 108, 0.16)',
                borderWidth: 1,
                borderColor: '#01636C',
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ color: '#01636C', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>
                TST
              </Text>
            </TouchableOpacity>
            */}
            <TouchableOpacity
              onPress={() => { void handleNewChat(); }}
              disabled={isCreatingNewChat}
              style={{ paddingRight: 12, opacity: isCreatingNewChat ? 0.45 : 1 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MIcon name="square-edit-outline" size={24} color="#01636C" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <View className="flex-1" style={{ marginHorizontal: 16, marginTop: 13, marginBottom: activeAiInputSpacer }}>
            <View style={{
              flex: 1,
              backgroundColor: showCompactHandoffLoader ? 'transparent' : chatMessages.length > 0 ? 'rgba(0, 0, 0, 0.225)' : 'transparent',
              borderRadius: 30,
              overflow: 'hidden'
            }}>
              {showCompactHandoffLoader ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                  <ActivityIndicator size="small" color="#C8FFFB" />
                  <Text
                    style={{
                      marginTop: 12,
                      color: '#C8FFFB',
                      fontSize: 14,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    Continuing chat
                  </Text>
                </View>
              ) : (
              <Animated.ScrollView
                ref={scrollViewRef}
                style={{ flex: 1, paddingHorizontal: 12 }}
                contentContainerStyle={{ paddingBottom: 20, paddingTop: 20 }}
                nestedScrollEnabled
                onContentSizeChange={() => {
                  const isLiveStreaming = chatMessagesRef.current.some((message) => message.isStreaming);
                  queueScrollToBottom(!isLiveStreaming);
                }}
                keyboardShouldPersistTaps="handled"
              >
            {chatMessages.map((m, i) => (
              <View
                key={m.id || `${m.role}-${i}`}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'stretch',
                  maxWidth: m.role === 'user' ? '90%' : '100%',
                  marginVertical: 4,
                  flexDirection: 'row',
                  minWidth: 0,
                }}
              >
                <View
                  style={{
                    backgroundColor: m.role === 'user'
                      ? '#078578'
                      : m.card?.type === 'webSearch'
                        ? 'rgba(1, 58, 61, 0.88)'
                        : 'rgba(0, 0, 0, 0.435)',
                    paddingTop: m.card?.type === 'webSearch' ? 8 : 4,
                    paddingBottom: 4,
                    paddingHorizontal: 8,
                    borderRadius: 12,
                    flex: m.role === 'user' ? undefined : 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    borderWidth: m.card?.type === 'webSearch' ? 1 : 0,
                    borderColor: m.card?.type === 'webSearch' ? 'rgba(125, 233, 216, 0.35)' : 'transparent',
                  }}
                >
                  {m.card?.type === 'webSearch' && (
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: m.content ? 6 : 0,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: 'rgba(125, 233, 216, 0.14)',
                      }}
                    >
                      <MIcon name="web" size={12} color="#9EE8DB" style={{ marginRight: 5 }} />
                      <Text style={{ color: '#9EE8DB', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
                        Web search
                      </Text>
                    </View>
                  )}
                  {!!m.content && (
                    m.isStreaming ? (
                      <Text style={{ color: 'white', fontSize: 14, lineHeight: 20, flexShrink: 1, minWidth: 0 }}>
                        {m.content}
                      </Text>
                    ) : (
                      <Markdown
                        style={{
                          body: { color: 'white', fontSize: 14, lineHeight: 20, padding: 0, margin: 0 },
                          paragraph: { margin: 0, padding: 0, lineHeight: 20, flexWrap: 'wrap' },
                          heading1: { color: 'white', fontWeight: 'bold', marginVertical: 5 },
                          heading2: { color: 'white', fontWeight: 'bold', marginVertical: 5 },
                          heading3: { color: 'white', fontWeight: 'bold', marginVertical: 5 },
                          code_inline: { backgroundColor: '#1F1F1F', color: '#E0E0E0', borderRadius: 4 },
                          code_block: { backgroundColor: '#1F1F1F', borderRadius: 8, padding: 8, marginVertical: 5 },
                          link: { color: '#9EE8DB' },
                        }}
                      >
                        {m.content}
                      </Markdown>
                    )
                  )}
                  {m.card && (m.card.type === 'todoCreated' || m.card.type === 'todoUpdated' || m.card.type === 'todoQuery') && (
                    <View style={{ marginTop: m.content ? 8 : 0 }}>
                      <TodoCard items={m.card.items ?? []} router={router} />
                    </View>
                  )}
                  {m.card?.type === 'emailList' && (
                    <View style={{ marginTop: m.content ? 8 : 0 }}>
                      <EmailListCard items={m.card.items ?? []} router={router} />
                    </View>
                  )}
                  {m.card?.type === 'emailDetail' && (
                    <View style={{ marginTop: m.content ? 8 : 0 }}>
                      <EmailDetailCard
                        items={m.card.items ?? []}
                        router={router}
                        serverUrl={SERVER_URL}
                        setIsAssistantTyping={setAssistantTypingForActiveSession}
                        appendChatMessages={(messages) => appendMessagesToSession(activeSessionId, messages, { showInVisibleChat: activeSessionId === activeSessionIdRef.current })}
                      />
                    </View>
                  )}
                  {m.card?.type === 'emailDraft' && (
                    <View style={{ marginTop: m.content ? 8 : 0 }}>
                      <EmailDraftCard
                        item={m.card.item}
                        serverUrl={SERVER_URL}
                        router={router}
                        setIsAssistantTyping={setAssistantTypingForActiveSession}
                        appendChatMessages={(messages) => appendMessagesToSession(activeSessionId, messages, { showInVisibleChat: activeSessionId === activeSessionIdRef.current })}
                      />
                    </View>
                  )}
                  {m.card?.type === 'calendarList' && (
                    <View style={{ marginTop: m.content ? 8 : 0 }}>
                      <CalendarListCard items={m.card.items ?? []} router={router} />
                    </View>
                  )}
                  {m.card?.type === 'calendarDetail' && (
                    <View style={{ marginTop: m.content ? 8 : 0 }}>
                      <CalendarDetailCard items={m.card.items ?? []} router={router} />
                    </View>
                  )}
                  {m.card?.type === 'dailyOverview' && (
                    <View style={{ marginTop: m.content ? 8 : 0, marginBottom: 8 }}>
                      <DailyOverviewCard
                        date={m.card.date}
                        todos={m.card.todos ?? []}
                        calendar={m.card.calendar ?? []}
                        emails={m.card.emails ?? []}
                        router={router}
                      />
                    </View>
                  )}
                  {m.card?.type === 'dayPlan' && (
                    <View style={{ marginTop: m.content ? 8 : 0, marginBottom: 8 }}>
                      <DayPlanCard
                        date={m.card.date}
                        calendarItems={m.card.calendarItems ?? []}
                        todoItems={m.card.todoItems ?? []}
                        router={router}
                      />
                    </View>
                  )}
                </View>
              </View>
            ))}
            {isCurrentSessionTyping && !isBootstrappingCompactHandoff && (
              <View style={{ alignSelf: 'flex-start', marginVertical: 4 }} onLayout={() => queueScrollToBottom(false)}>
                <View style={{ backgroundColor: '#3A3A3A', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {[0, 1, 2].map((n) => (
                      <Animated.View
                        key={n}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: '#FFFFFF',
                          marginRight: n < 2 ? 6 : 0,
                          opacity: typingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3 + n * 0.2, 1 - n * 0.1] }),
                          transform: [{ scale: typingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }],
                        }}
                      />
                    ))}
                  </View>
                </View>
              </View>
            )}
              </Animated.ScrollView>
              )}
            </View>
          </View>
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: Platform.OS === 'android' && isKeyboardVisible ? 0 : aiInputBottom,
              transform: [{
                translateY: keyboardOffset.interpolate({
                  inputRange: [0, 1000],
                  outputRange: [0, -1000],
                  extrapolate: 'clamp',
                }),
              }],
            }}
          >
            <AIInputBox
              textInput={isStreaming ? partialTranscript : inputValue}
              isListening={isListening}
              microphoneColor={microphoneColor}
              glowAnim={glowAnim}
              placeholder={isStreaming ? 'Listening...' : ''}
              editable
              showSoftInputOnFocus={!isStreaming}
              caretHidden={isStreaming}
              showSendButton={!isStreaming}
              multiline
              minInputHeight={40}
              maxInputHeight={120}
              onHeightChange={(height) => setAiInputHeight(Math.max(68, Math.ceil(height)))}
              inputRef={inputRef}
              onChangeText={isStreaming ? undefined : setInputValue}
              onSubmitEditing={handleSend}
              onSendPress={handleSend}
              returnKeyType="default"
              autoCapitalize="sentences"
              blurOnSubmit={false}
              onTextInputPress={() => {}}
              onMicrophonePress={handleMicrophonePress}
              surfaceVariant="chatAsset"
            />
          </Animated.View>
        </View>
        <ChatHistoryModal
          visible={isHistoryModalVisible}
          sessions={chatSessions}
          activeSessionId={activeSessionId}
          showSummaries={isSummaryTestMode}
          onClose={closeHistoryModal}
          onSelectSession={(sessionId) => { void openHistorySession(sessionId); }}
          onTogglePin={(sessionId, pinned) => { void toggleSessionPin(sessionId, pinned); }}
          onDeleteSession={deleteSession}
        />
      </SafeAreaView>
    </View>
  );
}
