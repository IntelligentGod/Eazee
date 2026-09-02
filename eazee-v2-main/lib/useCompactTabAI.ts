import { useCallback, useEffect, useRef, useState } from 'react';
import { buildCompactActionSystemMessages } from '@/app/(tabs)/chat/prompt';
import { getToolHandler } from '@/app/(tabs)/chat/tools';
import { executeToolCall } from '@/app/(tabs)/chat/tools/engine';
import {
  getCreatedCalendarItems,
  getCreatedTodoItems,
  getLastCalendarItems,
  getLastDayPlan,
  getLastEmailDraft,
  getLastEmailItems,
  getLastEmailPageToken,
  getLastQueryItems,
} from '@/app/(tabs)/chat/tools/memory';

type CompactSurface = 'todo' | 'calendar' | 'home';

type MutationSuccessInfo = {
  name: string;
  result: any;
};

type UseCompactTabAIOptions = {
  onMutationSuccess?: (info: MutationSuccessInfo) => Promise<void> | void;
};

type HiddenMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CompactAiChatHandoff = {
  surface: CompactSurface;
  history: HiddenMessage[];
  reason: string;
};

export type CompactAiNoticeCalendarItem = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  isAllDay?: boolean;
  source: 'local' | 'google';
  location?: string;
};

export type CompactAiNotice = {
  kind: 'toast' | 'clarify' | 'handoff' | 'error' | 'confirm';
  message: string;
  actionLabel?: string;
  actionVariant?: 'default' | 'destructive';
  calendarItems?: CompactAiNoticeCalendarItem[];
};

type CalendarDeleteToolCall = {
  callId?: string;
  name: 'calendar_delete';
  arguments?: any;
};

type PendingConfirmation = {
  kind: 'calendar_delete';
  toolCalls: CalendarDeleteToolCall[];
  history: HiddenMessage[];
};

const MAX_ROUTE_ROUNDS = 3;
const TOAST_MS = 3500;
const HANDOFF_MS = 4000;
const SERVER_URL = 'https://king-prawn-app-j9c6x.ondigitalocean.app';
const MUTATION_TOOL_NAMES = new Set([
  'todo_create_many',
  'todo_delete_many',
  'todo_delete_by_day_except',
  'todo_complete_many',
  'todo_edit_many',
  'todo_star_toggle_many',
  'calendar_create',
  'calendar_update',
  'calendar_delete',
]);
const SURFACE_ALLOWED_TOOL_NAMES: Record<CompactSurface, Set<string>> = {
  todo: new Set([
    'todo_create_many',
    'todo_delete_many',
    'todo_delete_by_day_except',
    'todo_complete_many',
    'todo_edit_many',
    'todo_star_toggle_many',
    'todo_query',
  ]),
  calendar: new Set([
    'calendar_fetch_range',
    'calendar_get_details',
    'calendar_create',
    'calendar_update',
    'calendar_delete',
    'calendar_search',
  ]),
  home: new Set([
    'todo_create_many',
    'todo_delete_many',
    'todo_delete_by_day_except',
    'todo_complete_many',
    'todo_edit_many',
    'todo_star_toggle_many',
    'todo_query',
    'calendar_fetch_range',
    'calendar_get_details',
    'calendar_create',
    'calendar_update',
    'calendar_delete',
    'calendar_search',
  ]),
};

const quoteLabel = (value: unknown) => `“${String(value || '').trim()}”`;

const sentenceCaseQuestion = (message: string) => {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const withoutTrailing = normalized.replace(/[?.!]+$/g, '');
  const first = withoutTrailing.charAt(0).toUpperCase();
  const rest = withoutTrailing.slice(1);
  return `${first}${rest}?`;
};

const sentenceCaseStatement = (message: string) => {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const withoutTrailing = normalized.replace(/[?.!]+$/g, '');
  const first = withoutTrailing.charAt(0).toUpperCase();
  const rest = withoutTrailing.slice(1);
  return `${first}${rest}.`;
};

const getNoticeDuration = (kind: CompactAiNotice['kind']) => {
  if (kind === 'clarify' || kind === 'confirm') return null;
  if (kind === 'handoff') return HANDOFF_MS;
  return TOAST_MS;
};

const isNoActionHandoff = (message: string) => /^no .*action requested\.?$/i.test(message.trim());

const humanizeCompactClarifyMessage = (message: string, surface: CompactSurface) => {
  const raw = message.trim().replace(/^CLARIFY:\s*/i, '');
  if (!raw) {
    return surface === 'calendar' ? 'What should I change?' : 'What should I do?';
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksCalendarVsTodo =
    /(calendar event|event|appointment).*(todo|task)|(todo|task).*(calendar event|event|appointment)/.test(normalized);

  if (surface === 'calendar' && asksCalendarVsTodo) {
    return 'What day should I put it on?';
  }

  if (normalized === 'title' || normalized === 'title?' || normalized === 'event title' || normalized === 'event title?') {
    return surface === 'calendar' ? 'What should I call it?' : 'What should I call this?';
  }

  if (normalized === 'date' || normalized === 'date?') {
    return surface === 'calendar' ? 'What day should I put it on?' : 'What day should I use?';
  }

  if (normalized === 'time' || normalized === 'time?') {
    return surface === 'calendar' ? 'What time should it be?' : 'What time should I use?';
  }

  if (normalized === 'start time' || normalized === 'start time?') {
    return 'What time should it start?';
  }

  if (normalized === 'end time' || normalized === 'end time?') {
    return 'What time should it end?';
  }

  if (normalized === 'which event' || normalized === 'which event?') {
    return 'Which event did you mean?';
  }

  if (normalized === 'which todo' || normalized === 'which todo?') {
    return 'Which todo did you mean?';
  }

  return sentenceCaseQuestion(raw);
};

const humanizeCompactHandoffMessage = (message: string) => {
  const raw = message.trim().replace(/^HANDOFF:\s*/i, '');
  if (!raw) {
    return 'Open chat to continue.';
  }

  return sentenceCaseStatement(raw);
};

const buildNowLocalIso = () => {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, '0');
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetMins = pad(absoluteOffset % 60);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${offsetHours}:${offsetMins}`;
};

const getCalendarDeleteKey = (value: { id?: unknown; source?: unknown }) =>
  `${value?.source === 'google' ? 'google' : 'local'}|${String(value?.id || '')}`;

const dedupeCalendarDeleteToolCalls = (toolCalls: CalendarDeleteToolCall[]) => {
  const seen = new Set<string>();
  return toolCalls.filter((toolCall) => {
    const key = getCalendarDeleteKey({
      id: toolCall?.arguments?.id,
      source: toolCall?.arguments?.source,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isAffirmativeConfirmationReply = (message: string) => {
  const normalized = message.trim().toLowerCase().replace(/[.!]+$/g, '');
  if (!normalized) return false;
  return /^(yes|y|delete|delete it|delete them|confirm|go ahead|do it|do that|sure|ok|okay|please do|remove it|remove them)$/.test(normalized);
};

const isNegativeConfirmationReply = (message: string) => {
  const normalized = message.trim().toLowerCase().replace(/[.!]+$/g, '');
  if (!normalized) return false;
  return /^(no|n|cancel|stop|keep it|keep them|don't|dont|do not|never mind|nevermind)$/.test(normalized);
};

const buildCalendarDeleteConfirmationMessage = (count: number) =>
  count === 1 ? 'Delete this event? Tap Delete or reply.' : `Delete these ${count} events? Tap Delete or reply.`;

const mapCalendarNoticeItem = (
  item: any,
  fallback: { id: string; source: 'local' | 'google' }
): CompactAiNoticeCalendarItem => ({
  id: String(item?.id || fallback.id),
  title: String(item?.title || '').trim(),
  startDate: typeof item?.startDate === 'string' ? item.startDate : '',
  endDate: typeof item?.endDate === 'string' ? item.endDate : undefined,
  isAllDay: !!item?.isAllDay,
  source: item?.source === 'google' ? 'google' : fallback.source,
  location: typeof item?.location === 'string' && item.location.trim() ? item.location.trim() : undefined,
});

const getCalendarItemFromMemory = (id: string, source: 'local' | 'google') => {
  const memoryItems = [...getLastCalendarItems(), ...getCreatedCalendarItems()];
  return memoryItems.find((item) => item.id === id && item.source === source) || null;
};

const resolveCalendarDeleteNoticeItem = async (args: any): Promise<CompactAiNoticeCalendarItem | null> => {
  const id = String(args?.id || '');
  const source: 'local' | 'google' = args?.source === 'google' ? 'google' : 'local';
  if (!id) return null;

  const memoryItem = getCalendarItemFromMemory(id, source);
  if (memoryItem) {
    return mapCalendarNoticeItem(memoryItem, { id, source });
  }

  const detailHandler = getToolHandler('calendar_get_details');
  if (!detailHandler) {
    return mapCalendarNoticeItem({}, { id, source });
  }

  try {
    const result = await detailHandler({ id, source });
    if (result?.item) {
      return mapCalendarNoticeItem(result.item, { id, source });
    }
  } catch {}

  return mapCalendarNoticeItem({}, { id, source });
};

const getLastEmailDraftContext = () => {
  const draft = getLastEmailDraft();
  if (!draft) {
    return { present: false };
  }
  return {
    present: true,
    kind: draft.email ? 'reply' : draft.compose ? 'compose' : 'unknown',
    emailId: draft.email?.id || undefined,
    to: draft.compose?.to || undefined,
    subject: draft.email?.subject || draft.compose?.subject || undefined,
    replyDraft: draft.replyDraft || '',
  };
};

const mutationToastForCall = (name: string, result: any) => {
  if (/^todo_create_many$/.test(name)) {
    const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
    if (createdItems.length === 1) return `Created ${quoteLabel(createdItems[0]?.text)}.`;
    const count = Number(result?.created ?? createdItems.length ?? 0);
    return count === 1 ? 'Created 1 todo.' : `Created ${count} todos.`;
  }

  if (/^todo_delete_many$/.test(name)) {
    const deletedItems = Array.isArray(result?.deletedItems) ? result.deletedItems : [];
    if (deletedItems.length === 1) return `Deleted ${quoteLabel(deletedItems[0]?.text)}.`;
    const count = Number(result?.deleted ?? deletedItems.length ?? 0);
    return count === 1 ? 'Deleted 1 todo.' : `Deleted ${count} todos.`;
  }

  if (/^todo_delete_by_day_except$/.test(name)) {
    const deletedItems = Array.isArray(result?.deletedItems) ? result.deletedItems : [];
    if (deletedItems.length === 1) return `Deleted ${quoteLabel(deletedItems[0]?.text)}.`;
    const count = Number(result?.deleted ?? deletedItems.length ?? 0);
    return count === 1 ? 'Deleted 1 todo.' : `Deleted ${count} todos.`;
  }

  if (/^todo_complete_many$/.test(name)) {
    const completedItems = Array.isArray(result?.completedItems) ? result.completedItems : [];
    if (completedItems.length === 1) return `Completed ${quoteLabel(completedItems[0]?.text)}.`;
    const count = Number(result?.completed ?? completedItems.length ?? 0);
    return count === 1 ? 'Completed 1 todo.' : `Completed ${count} todos.`;
  }

  if (/^todo_edit_many$/.test(name)) {
    const updatedItems = Array.isArray(result?.updatedItems) ? result.updatedItems : [];
    if (updatedItems.length === 1) {
      const label = updatedItems[0]?.newText || updatedItems[0]?.oldText;
      return `Updated ${quoteLabel(label)}.`;
    }
    const count = Number(result?.updated ?? updatedItems.length ?? 0);
    return count === 1 ? 'Updated 1 todo.' : `Updated ${count} todos.`;
  }

  if (/^todo_star_toggle_many$/.test(name)) {
    const affectedItems = Array.isArray(result?.affectedItems) ? result.affectedItems : [];
    if (affectedItems.length === 1) {
      const starred = !!affectedItems[0]?.starred;
      return `${starred ? 'Starred' : 'Unstarred'} ${quoteLabel(affectedItems[0]?.text)}.`;
    }
    const count = Number(result?.affected ?? affectedItems.length ?? 0);
    return count === 1 ? 'Updated 1 todo.' : `Updated ${count} todos.`;
  }

  if (name === 'calendar_create') {
    const title = String(result?.item?.title || '').trim();
    return title ? `Created ${quoteLabel(title)}.` : 'Created calendar event.';
  }

  if (name === 'calendar_update') {
    const title = String(result?.item?.title || '').trim();
    return title ? `Updated ${quoteLabel(title)}.` : 'Updated calendar event.';
  }

  if (name === 'calendar_delete') {
    return 'Deleted calendar event.';
  }

  return 'Done.';
};

const compactOutcomeForTool = (name: string, result: any, success: boolean, error?: string) => {
  if (!success) {
    return {
      kind: 'error' as const,
      message: error ? `Something went wrong. (${error})` : 'Something went wrong.',
    };
  }

  if (name === 'todo_query') {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length === 0) {
      return { kind: 'toast' as const, message: "Couldn't find a matching todo." };
    }
    return { kind: 'continue' as const };
  }

  if (name === 'calendar_search' || name === 'calendar_fetch_range') {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length === 0) {
      return { kind: 'toast' as const, message: "Couldn't find a matching event." };
    }
    return { kind: 'continue' as const };
  }

  if (name === 'calendar_get_details') {
    return result?.item
      ? { kind: 'continue' as const }
      : { kind: 'toast' as const, message: "Couldn't load that event." };
  }

  return {
    kind: 'toast' as const,
    message: mutationToastForCall(name, result),
  };
};

export function useCompactTabAI(surface: CompactSurface, options: UseCompactTabAIOptions = {}) {
  const { onMutationSuccess } = options;
  const [inputValue, setInputValue] = useState('');
  const [notice, setNotice] = useState<CompactAiNotice | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<HiddenMessage[]>([]);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConfirmationRef = useRef<PendingConfirmation | null>(null);

  const showNotice = useCallback((nextNotice: CompactAiNotice | null) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setNotice(nextNotice);
    if (!nextNotice) return;
    const duration = getNoticeDuration(nextNotice.kind);
    if (!duration) return;
    toastTimeoutRef.current = setTimeout(() => {
      setNotice((current) => (current === nextNotice ? null : current));
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const buildRouteMessages = useCallback((hiddenHistory: HiddenMessage[], continuedRequest: boolean) => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return [
      ...buildCompactActionSystemMessages({
        surface,
        userTimezone,
        nowLocalIso: buildNowLocalIso(),
        activeSessionSummary: '',
        lastResults: getLastQueryItems() || [],
        createdTodoItems: getCreatedTodoItems() || [],
        lastEmailDraft: getLastEmailDraftContext(),
        lastEmailItems: getLastEmailItems() || [],
        lastEmailPageToken: getLastEmailPageToken() || '',
        lastCalendarItems: getLastCalendarItems() || [],
        createdCalendarItems: getCreatedCalendarItems() || [],
        lastDayPlan: getLastDayPlan(),
        continuedRequest,
      }),
      ...hiddenHistory,
    ];
  }, [surface]);

  const executeCompactToolCalls = useCallback(async (toolCalls: any[]) => {
    const toastMessages: string[] = [];
    let shouldContinue = false;

    for (const toolCall of toolCalls) {
      const result = await executeToolCall(
        { callId: toolCall?.callId, name: toolCall?.name, arguments: toolCall?.arguments },
        { serverUrl: SERVER_URL }
      );
      const toolName = String(toolCall?.name || '');
      const outcome = compactOutcomeForTool(toolName, result?.result, !!result?.success, result?.error);

      if (outcome.kind === 'continue') {
        shouldContinue = true;
        continue;
      }

      if (MUTATION_TOOL_NAMES.has(toolName) && result?.success && onMutationSuccess) {
        try {
          await onMutationSuccess({
            name: toolName,
            result: result?.result,
          });
        } catch {}
      }

      toastMessages.push(outcome.message);
    }

    return { shouldContinue, toastMessages };
  }, [onMutationSuccess]);

  const executePendingConfirmation = useCallback(async (pending: PendingConfirmation) => {
    const { toastMessages } = await executeCompactToolCalls(pending.toolCalls);
    showNotice({
      kind: toastMessages.some((message) => /went wrong/i.test(message)) ? 'error' : 'toast',
      message: toastMessages.join(' '),
    });
    setHistory([]);
  }, [executeCompactToolCalls, showNotice]);

  const requestRoute = useCallback(async (hiddenHistory: HiddenMessage[], continuedRequest: boolean) => {
    const response = await fetch(`${SERVER_URL}/ai/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantSurface: surface,
        assistantMode: 'compact',
        messages: buildRouteMessages(hiddenHistory, continuedRequest),
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const message = String(errorPayload?.error || errorPayload?.message || `HTTP ${response.status}`);
      throw new Error(message);
    }

    return response.json().catch(() => null);
  }, [buildRouteMessages, surface]);

  const runRequest = useCallback(async (hiddenHistory: HiddenMessage[]) => {
    let currentHistory = hiddenHistory;

    for (let round = 0; round < MAX_ROUTE_ROUNDS; round += 1) {
      const routeResponse = await requestRoute(currentHistory, round > 0);

      if (routeResponse?.status === 'no_tool_calls') {
        const metaKind = routeResponse?.meta?.assistantKind;
        const metaText = String(routeResponse?.meta?.assistantText || routeResponse?.result?.message?.content || '').trim();

        if (metaKind === 'clarify' && metaText) {
          const clarifyMessage = humanizeCompactClarifyMessage(metaText, surface);
          const assistantMessage = clarifyMessage;
          setHistory([...currentHistory, { role: 'assistant', content: assistantMessage }]);
          showNotice({ kind: 'clarify', message: clarifyMessage });
          return;
        }

        if (metaKind === 'handoff' && metaText) {
          if (isNoActionHandoff(metaText)) {
            showNotice(null);
            setHistory([]);
            return;
          }
          const handoffMessage = humanizeCompactHandoffMessage(metaText);
          const assistantMessage = `HANDOFF: ${handoffMessage}`;
          setHistory([...currentHistory, { role: 'assistant', content: assistantMessage }]);
          showNotice({ kind: 'handoff', message: handoffMessage, actionLabel: 'Open chat' });
          return;
        }

        showNotice({
          kind: metaText ? 'toast' : 'error',
          message: metaText || 'Nothing happened.',
        });
        setHistory([]);
        return;
      }

      if (routeResponse?.status !== 'tool_calls_dispatched') {
        showNotice({ kind: 'error', message: 'Something went wrong.' });
        setHistory([]);
        return;
      }

      const toolCalls = Array.isArray(routeResponse?.toolCalls) ? routeResponse.toolCalls : [];
      if (!toolCalls.length) {
        const routingErrors = Array.isArray(routeResponse?.routing?.errors) ? routeResponse.routing.errors : [];
        const message = String(routingErrors[0]?.error || 'Tool routing failed.');
        showNotice({ kind: 'error', message });
        setHistory([]);
        return;
      }

      const allowedToolNames = SURFACE_ALLOWED_TOOL_NAMES[surface];
      const disallowedToolCall = toolCalls.find((toolCall: any) => !allowedToolNames.has(String(toolCall?.name || '')));
      if (disallowedToolCall) {
        showNotice({
          kind: 'error',
          message: `Invalid ${surface} action returned. Open chat to finish this.`,
        });
        setHistory([]);
        return;
      }

      const rawCalendarDeleteToolCalls = toolCalls.filter(
        (toolCall: any) => String(toolCall?.name || '') === 'calendar_delete'
      ) as CalendarDeleteToolCall[];
      const calendarDeleteToolCalls = dedupeCalendarDeleteToolCalls(rawCalendarDeleteToolCalls);
      if (rawCalendarDeleteToolCalls.length > 0 && rawCalendarDeleteToolCalls.length === toolCalls.length) {
        const calendarItems = (
          await Promise.all(calendarDeleteToolCalls.map((toolCall) => resolveCalendarDeleteNoticeItem(toolCall.arguments)))
        ).filter(Boolean) as CompactAiNoticeCalendarItem[];
        const confirmationMessage = buildCalendarDeleteConfirmationMessage(calendarDeleteToolCalls.length);
        const nextHistory = [...currentHistory, { role: 'assistant' as const, content: confirmationMessage }];
        pendingConfirmationRef.current = {
          kind: 'calendar_delete',
          toolCalls: calendarDeleteToolCalls,
          history: nextHistory,
        };
        setHistory(nextHistory);
        showNotice({
          kind: 'confirm',
          message: confirmationMessage,
          actionLabel: 'Delete',
          actionVariant: 'destructive',
          calendarItems,
        });
        return;
      }

      const { shouldContinue, toastMessages } = await executeCompactToolCalls(toolCalls);
      if (shouldContinue) {
        continue;
      }

      showNotice({
        kind: toastMessages.some((message) => /went wrong/i.test(message)) ? 'error' : 'toast',
        message: toastMessages.join(' '),
      });
      setHistory([]);
      return;
    }

    const handoffMessage = humanizeCompactHandoffMessage('Open chat to finish this');
    setHistory([...currentHistory, { role: 'assistant', content: `HANDOFF: ${handoffMessage}` }]);
    showNotice({ kind: 'handoff', message: handoffMessage, actionLabel: 'Open chat' });
  }, [executeCompactToolCalls, requestRoute, showNotice, surface]);

  const confirmPendingAction = useCallback(async () => {
    const pending = pendingConfirmationRef.current;
    if (!pending || isRunning) return;

    pendingConfirmationRef.current = null;
    setInputValue('');
    setIsRunning(true);
    try {
      await executePendingConfirmation(pending);
    } catch (error: any) {
      showNotice({
        kind: 'error',
        message: String(error?.message || error || 'Something went wrong.'),
      });
      setHistory([]);
    } finally {
      setIsRunning(false);
    }
  }, [executePendingConfirmation, isRunning, showNotice]);

  const submitText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isRunning) return;

    const pendingConfirmation = pendingConfirmationRef.current;
    if (pendingConfirmation) {
      setInputValue('');
      setIsRunning(true);
      try {
        if (isAffirmativeConfirmationReply(trimmed)) {
          pendingConfirmationRef.current = null;
          await executePendingConfirmation(pendingConfirmation);
          return;
        }

        if (isNegativeConfirmationReply(trimmed)) {
          pendingConfirmationRef.current = null;
          setHistory([]);
          showNotice({ kind: 'toast', message: 'Okay, I did not delete it.' });
          return;
        }

        pendingConfirmationRef.current = null;
        const nextHistory = [...pendingConfirmation.history, { role: 'user' as const, content: trimmed }];
        setHistory(nextHistory);
        showNotice(null);
        await runRequest(nextHistory);
        return;
      } catch (error: any) {
        showNotice({
          kind: 'error',
          message: String(error?.message || error || 'Something went wrong.'),
        });
        setHistory([]);
        return;
      } finally {
        setIsRunning(false);
      }
    }

    const nextHistory = [...history, { role: 'user' as const, content: trimmed }];
    setInputValue('');
    setHistory(nextHistory);
    setIsRunning(true);
    if (notice?.kind !== 'clarify') {
      showNotice(null);
    }

    try {
      await runRequest(nextHistory);
    } catch (error: any) {
      showNotice({
        kind: 'error',
        message: String(error?.message || error || 'Something went wrong.'),
      });
      setHistory([]);
    } finally {
      setIsRunning(false);
    }
  }, [executePendingConfirmation, history, isRunning, notice?.kind, runRequest, showNotice]);

  const submit = useCallback(async () => {
    await submitText(inputValue);
  }, [inputValue, submitText]);

  const dismissNotice = useCallback(() => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current = null;
      setHistory([]);
    }
    showNotice(null);
  }, [showNotice]);

  const cancelPending = useCallback(() => {
    pendingConfirmationRef.current = null;
    showNotice(null);
    setHistory([]);
  }, [showNotice]);

  const getHandoffChatParams = useCallback(() => {
    if (notice?.kind !== 'handoff') return null;

    return {
      compactHandoff: JSON.stringify({
        surface,
        history,
        reason: notice.message,
      } satisfies CompactAiChatHandoff),
      compactHandoffNonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }, [history, notice, surface]);

  return {
    inputValue,
    setInputValue,
    submit,
    submitText,
    isRunning,
    notice,
    dismissNotice,
    confirmPendingAction,
    cancelPending,
    getHandoffChatParams,
    clearConversation: () => {
      pendingConfirmationRef.current = null;
      setHistory([]);
    },
  };
}
