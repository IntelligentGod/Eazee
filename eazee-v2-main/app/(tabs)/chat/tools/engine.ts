import { getToolHandler } from '.';
import { presentEmailResult, presentTodoResult, presentCalendarResult, presentGoogleResult } from './presenters';
import { getLastEmailDraft, setLastDayPlan, setLastEmailDraft, setLastEmailItems, setLastCalendarItems, setLastQueryItems } from './memory';
import { refineEmailDraft } from '@/utils/emailRefiner';
import type { ExecuteResult, ToolCall } from './types';

const buildPlanDraftMessage = (result: any) => {
  void result;
  return "Here's the plan for the day.\nReply with any edits, or say 'looks good' and I'll save it.";
};

export async function executeToolCall(
  call: ToolCall,
  deps: { serverUrl: string; router?: any }
): Promise<ExecuteResult> {
  const name = String(call?.name || '');
  const args = call?.arguments;
  let success = true;
  let result: any = null;
  let error: string | undefined = undefined;
  try {
    if (name === 'email_refine_draft') {
      const instruction = typeof args?.instruction === 'string' ? String(args.instruction) : '';
      let base = getLastEmailDraft();
      // Fallback: if no draft tracked yet, generate a base draft for the latest email
      if (!base || !base.email || !base.replyDraft) {
        try {
          const gen = getToolHandler('email_generate_reply_single');
          if (gen) {
            const r = await gen({});
            const rd = String(r?.replyDraft || '').trim();
            if (rd) {
              base = { email: r?.email, replyDraft: rd, actionItems: r?.actionItems, accessToken: r?.accessToken };
              setLastEmailDraft(base);
            }
          }
        } catch {}
      }
      if (!base || !base.email || !base.replyDraft) {
        // If we have a compose draft (new email), allow refine
        if (!base || !base.compose || !base.replyDraft) {
          success = false; error = 'NO_DRAFT';
        } else {
          try {
            const subject = String(base.compose?.subject || '');
            const to = String(base.compose?.to || '');
            // Prefer local refine
            try {
              const localText = await refineEmailDraft({
                email: { subject, from: to, snippet: '' },
                previousDraft: base.replyDraft,
                instruction,
              });
              if (localText && localText.length > 0) {
                result = { replyDraft: localText, compose: { to, subject }, accessToken: base.accessToken, payload: { compose: { to, subject }, accessToken: base.accessToken } };
              } else {
                throw new Error('EMPTY_LOCAL');
              }
            } catch {
              const prompt = `You are rewriting a new email draft. Produce a full, concise email that follows the user's instruction while preserving context.

Recipient: ${to}
Subject: ${subject}

Previous draft:
${String(base.replyDraft || '')}

User instruction (intent to reflect, not verbatim text):
${instruction}

Guidelines:
- Keep it first-person singular (“I”).
- Be direct and friendly.
- 2-5 sentences unless needed.
- Do NOT say you are an AI.
- Do NOT add signatures or placeholders like [Your Name].
- Replace the previous stance with the instruction.
- Output only the final email text, nothing else.`;
              const resp = await fetch(`${deps.serverUrl}/ai/gemini/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
              });
              if (!resp.ok) {
                success = false; error = `HTTP_${resp.status}`;
              } else {
                const json = await resp.json().catch(() => null);
                const text = String(json?.text || '').trim();
                if (!text) {
                  success = false; error = 'EMPTY_RESPONSE';
                } else {
                  result = { replyDraft: text, compose: { to, subject }, accessToken: base.accessToken, payload: { compose: { to, subject }, accessToken: base.accessToken } };
                }
              }
            }
          } catch (e: any) {
            success = false; error = String(e?.message || e || 'REFINE_FAILED');
          }
        }
      } else {
        // Prefer local refine to avoid server 500s; fallback to server if local fails
        try {
          const localText = await refineEmailDraft({
            email: { subject: base.email.subject, from: base.email.from, snippet: base.email.snippet },
            previousDraft: base.replyDraft,
            instruction,
          });
          if (localText && localText.length > 0) {
            result = { replyDraft: localText, email: base.email, actionItems: base.actionItems, accessToken: base.accessToken, payload: { email: base.email, actionItems: base.actionItems, accessToken: base.accessToken } };
          } else {
            throw new Error('EMPTY_LOCAL');
          }
        } catch {
          try {
            const prompt = `You are rewriting an email reply. Produce a full, concise, professional reply that follows the user's new instruction while preserving the context.

Original email:
Subject: ${String(base.email.subject || '')}
From: ${String(base.email.from || '')}
Snippet: ${String(base.email.snippet || '')}

Previous draft:
${String(base.replyDraft || '')}

User instruction (intent to reflect, not verbatim text):
${instruction}

Guidelines:
- Keep it first-person singular (“I”).
- Be direct and friendly.
- 2-5 sentences maximum unless needed.
- Do NOT say you are an AI.
- Replace the previous stance with the instruction.
- Output only the final reply text, nothing else.`;
            const resp = await fetch(`${deps.serverUrl}/ai/gemini/text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt }),
            });
            if (!resp.ok) {
              success = false; error = `HTTP_${resp.status}`;
            } else {
              const json = await resp.json().catch(() => null);
              const text = String(json?.text || '').trim();
              if (!text) {
                success = false; error = 'EMPTY_RESPONSE';
              } else {
                result = { replyDraft: text, email: base.email, actionItems: base.actionItems, accessToken: base.accessToken, payload: { email: base.email, actionItems: base.actionItems, accessToken: base.accessToken } };
              }
            }
          } catch (e: any) {
            success = false; error = String(e?.message || e || 'REFINE_FAILED');
          }
        }
      }
    } else {
      const handler = getToolHandler(name);
      if (!handler) {
        success = false; error = `Unknown tool: ${name}`;
      } else {
        result = await handler(args);
      }
    }
  } catch (e: any) {
    success = false; error = String(e?.message || e || 'Tool execution failed');
  }

  // Present results into chat-friendly messages/cards and optional navigation actions
  let messages: ExecuteResult['messages'] = [];
  let uiActions: ExecuteResult['uiActions'] = undefined;
  try {
    if (success) {
      if (name.startsWith('email_') || name === 'email_refine_draft') {
        const pres = presentEmailResult(name, result);
        messages = pres.messages || [];
        uiActions = pres.uiActions;
      } else if (name.startsWith('google_')) {
        const pres = presentGoogleResult(name, result);
        messages = pres.messages || [];
        uiActions = pres.uiActions;
      } else if (name.startsWith('todo_') || name.startsWith('todo.') || name.includes('todo')) {
        const pres = presentTodoResult(name, result);
        messages = pres.messages || [];
      } else if (name.startsWith('calendar_')) {
        const pres = presentCalendarResult(name, result);
        messages = pres.messages || [];
        uiActions = pres.uiActions;
      } else if (name === 'plan_my_day') {
        const date = typeof result?.date === 'string' ? result.date : new Date().toISOString().slice(0, 10);
        const calendarItems = Array.isArray(result?.calendarItems) ? result.calendarItems : [];
        const todoItems = Array.isArray(result?.todoItems) ? result.todoItems : [];
        setLastDayPlan({ date, calendarItems, todoItems });
        messages = [{
          role: 'assistant',
          content: buildPlanDraftMessage({ date, calendarItems, todoItems }),
          card: { type: 'dayPlan', date, calendarItems, todoItems },
        }];
      } else if (name === 'save_day_plan') {
        const date = typeof result?.date === 'string' ? result.date : new Date().toISOString().slice(0, 10);
        const calendarItems = Array.isArray(result?.calendarItems) ? result.calendarItems : [];
        const todoItems = Array.isArray(result?.todoItems) ? result.todoItems : [];
        messages = [{
          role: 'assistant',
          content: 'Saved the plan for the day.',
          card: { type: 'dayPlan', date, calendarItems, todoItems },
        }];
      } else if (name === 'daily_overview') {
        const date = result?.date || new Date().toISOString().slice(0, 10);
        const todos = Array.isArray(result?.todos) ? result.todos : [];
        const calendar = Array.isArray(result?.calendar) ? result.calendar : [];
        const emails = Array.isArray(result?.emails) ? result.emails : [];
        if (emails.length) {
          setLastEmailItems(emails.map((e: any) => ({ id: e.id, subject: e.subject, from: e.from, snippet: e.snippet, date: e.date })));
        }
        if (calendar.length) {
          setLastCalendarItems(calendar);
        }
        if (todos.length) {
          setLastQueryItems(todos);
        }
        messages = [{
          role: 'assistant',
          content: `Here’s your overview for ${date}.`,
          card: { type: 'dailyOverview', date, todos, calendar, emails },
        }];
      } else {
        messages = [{ role: 'assistant', content: 'Done.' }];
      }
    } else {
      messages = [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }];
    }
  } catch {
    // If presenter fails, still return a generic message
    if (success) messages = [{ role: 'assistant', content: 'Done.' }];
    else messages = [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }];
  }

  return { success, messages, uiActions, error, result };
}
