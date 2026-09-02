export type ChatMessageRole = 'user' | 'assistant' | 'tool';

export type ChatUIMessage = {
  id?: string;
  role: ChatMessageRole;
  content?: string;
  card?: any;
  isStreaming?: boolean;
};

export type ChatSessionListItem = {
  id: string;
  title: string;
  summary?: string;
  pinned: boolean;
  lastMessageAt: number;
  updatedAt: number;
  createdAt: number;
};
