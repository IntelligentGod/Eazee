export type ToolCall = {
  callId?: string;
  name: string;
  arguments?: any;
};

export type AssistantMessage = {
  role: 'assistant' | 'tool';
  content?: string;
  card?: any;
};

export type UiAction =
  | { type: 'navigate'; route: string; params?: Record<string, any> }
  | { type: 'none' };

export type ToolMemory = {
  lastQueryItems: Array<{
    id: string;
    text: string;
    dueDate: string | null;
    hasDueTime?: boolean;
    completed: boolean;
    starred: boolean;
    workspace?: string;
  }>;
  createdTodoItems: Array<{
    id: string;
    text: string;
    dueDate: string | null;
    hasDueTime?: boolean;
    completed: boolean;
    starred: boolean;
    workspace?: string;
  }>;
  lastEmailItems: Array<{
    id: string;
    subject: string;
    from: string;
    snippet?: string;
    date?: string;
  }>;
  lastCalendarItems: Array<{
    id: string;
    title: string;
    startDate: string;
    endDate?: string;
    source: 'local' | 'google';
  }>;
  createdCalendarItems: Array<{
    id: string;
    title: string;
    startDate: string;
    endDate?: string;
    source: 'local' | 'google';
  }>;
  lastEmailDraft: {
    email?: any;
    compose?: { to: string; subject?: string };
    replyDraft: string;
    actionItems?: any;
    accessToken?: string;
  } | null;
  lastEmailPageToken: string | null;
  lastDayPlan: {
    date: string;
    calendarItems: Array<{
      title: string;
      start?: string;
      end?: string;
      location?: string;
      details?: string;
    }>;
    todoItems: Array<{
      text: string;
      dueDate: string;
      hasDueTime: boolean;
      details?: string;
      starred: boolean;
      priority: 'low' | 'medium' | 'high';
    }>;
  } | null;
};

export type ExecuteResult = {
  success: boolean;
  messages: AssistantMessage[];
  uiActions?: UiAction[];
  error?: string;
  result?: any;
};
