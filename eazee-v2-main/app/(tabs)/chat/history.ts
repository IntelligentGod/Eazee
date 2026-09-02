import { Q } from '@nozbe/watermelondb';
import { database } from '../../../database/database';
import ChatMessageModel from '../../../database/models/ChatMessageModel';
import ChatSessionModel from '../../../database/models/ChatSessionModel';
import type { ChatSessionListItem, ChatUIMessage } from './types';

type AppendMessagesOptions = {
  seedMessages?: ChatUIMessage[];
  titleSourceMessages?: ChatUIMessage[];
};

const TITLE_WORD_LIMIT = 5;

export function isMeaningfulChatMessage(message?: ChatUIMessage | null) {
  if (!message) return false;
  const text = typeof message.content === 'string' ? message.content.trim() : '';
  return text.length > 0 || !!message.card;
}

export function normalizeChatSessionTitle(title?: string | null) {
  const clean = (title || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?,:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '';

  const words = clean.split(' ');
  if (words.length <= TITLE_WORD_LIMIT) return clean;
  return words.slice(0, TITLE_WORD_LIMIT).join(' ');
}

export function deriveChatSessionTitle(messages: ChatUIMessage[]) {
  const firstUser = messages.find((message) => message.role === 'user' && typeof message.content === 'string' && message.content.trim().length > 0);
  if (!firstUser?.content) return 'New Chat';
  const clean = firstUser.content
    .replace(/\s+/g, ' ')
    .replace(/^(can you|could you|would you|please|help me|i need to|i want to|show me|tell me|give me|make|create)\s+/i, '')
    .trim();
  return normalizeChatSessionTitle(clean) || 'New Chat';
}

export function sortChatSessions(sessions: ChatSessionListItem[]) {
  return [...sessions].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = a.lastMessageAt || a.createdAt;
    const bTime = b.lastMessageAt || b.createdAt;
    return bTime - aTime;
  });
}

function parseStoredCard(cardJson?: string) {
  if (!cardJson) return undefined;
  try {
    return JSON.parse(cardJson);
  } catch {
    return undefined;
  }
}

function mapSession(row: ChatSessionModel, lastMessageAt?: number): ChatSessionListItem {
  return {
    id: row.id,
    title: row.title || 'New Chat',
    summary: row.summary || '',
    pinned: !!row.pinned,
    lastMessageAt: Number(row.lastMessageAt || lastMessageAt || 0),
    updatedAt: new Date(row.updatedAt as any).getTime() || 0,
    createdAt: new Date(row.createdAt as any).getTime() || 0,
  };
}

export async function listChatSessions() {
  const rows = await database.collections.get<ChatSessionModel>('chat_sessions').query().fetch();
  const missingLastMessage = rows.filter((row) => !row.lastMessageAt);
  const backfilledLastMessageAt = new Map<string, number>();

  if (missingLastMessage.length > 0) {
    const allMessages = await database.collections.get<ChatMessageModel>('chat_messages').query().fetch();
    const lastMessageBySession = new Map<string, number>();

    for (const message of allMessages) {
      const timestamp = new Date(message.createdAt as any).getTime();
      if (!timestamp) continue;
      const previous = lastMessageBySession.get(message.sessionId) || 0;
      if (timestamp > previous) lastMessageBySession.set(message.sessionId, timestamp);
    }

    await database.write(async () => {
      for (const row of missingLastMessage) {
        const lastMessageAt = lastMessageBySession.get(row.id);
        if (!lastMessageAt) continue;
        backfilledLastMessageAt.set(row.id, lastMessageAt);
        await row.update((record) => {
          record.lastMessageAt = lastMessageAt;
        });
      }
    });
  }

  return sortChatSessions(rows.map((row) => mapSession(row, backfilledLastMessageAt.get(row.id))));
}

export async function loadChatSession(sessionId: string) {
  const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
  const rows = await database.collections
    .get<ChatMessageModel>('chat_messages')
    .query(Q.where('session_id', Q.eq(sessionId)))
    .fetch();

  const messages = rows
    .sort((a, b) => {
      const aTime = new Date(a.createdAt as any).getTime();
      const bTime = new Date(b.createdAt as any).getTime();
      return aTime - bTime;
    })
    .map((row) => ({
      role: (row.role as ChatUIMessage['role']) || 'assistant',
      content: row.content || undefined,
      card: parseStoredCard(row.cardJson),
    }));

  return {
    session: mapSession(session),
    messages,
  };
}

export async function ensureChatSession(sessionId: string | null, seedMessages: ChatUIMessage[]) {
  if (sessionId) return sessionId;

  const title = deriveChatSessionTitle(seedMessages);
  let createdId = '';

  await database.write(async () => {
    const session = await database.collections.get<ChatSessionModel>('chat_sessions').create((record) => {
      record.title = title;
      record.summary = '';
      record.pinned = false;
      record.lastMessageAt = 0;
    });
    createdId = session.id;
  });

  return createdId;
}

export async function appendChatMessagesToSession(
  targetSessionId: string | null,
  messages: ChatUIMessage[],
  options?: AppendMessagesOptions
) {
  const meaningful = messages.filter((message) => isMeaningfulChatMessage(message));
  if (!meaningful.length) return targetSessionId;

  const sessionId = await ensureChatSession(targetSessionId, options?.seedMessages || meaningful);
  if (!sessionId) return null;

  const titleSourceMessages = options?.titleSourceMessages || options?.seedMessages || meaningful;
  const now = Date.now();

  await database.write(async () => {
    const messagesCollection = database.collections.get<ChatMessageModel>('chat_messages');

    for (const message of meaningful) {
      await messagesCollection.create((record) => {
        record.sessionId = sessionId;
        record.role = message.role;
        record.content = typeof message.content === 'string' ? message.content : undefined;
        record.cardJson = message.card ? JSON.stringify(message.card) : undefined;
      });
    }

    const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
    await session.update((record) => {
      record.lastMessageAt = now;
      if (!record.title || record.title === 'New Chat') {
        record.title = deriveChatSessionTitle(titleSourceMessages);
      }
    });
  });

  return sessionId;
}

export async function updateChatSessionPin(sessionId: string, pinned: boolean) {
  await database.write(async () => {
    const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
    await session.update((record) => {
      record.pinned = !pinned;
    });
  });
}

export async function deleteChatSessionById(sessionId: string) {
  await database.write(async () => {
    const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
    const messages = await database.collections
      .get<ChatMessageModel>('chat_messages')
      .query(Q.where('session_id', Q.eq(sessionId)))
      .fetch();

    for (const message of messages) {
      await message.destroyPermanently();
    }

    await session.destroyPermanently();
  });
}
