import { EmailWithSummary } from '@/types/email';
import { generateAutoReply } from '@/utils/emailAutoReply';
import type { ToolHandler } from './todo';
import { getAccessTokenStatic } from '@/app/context/TokenContext';
import { refineEmailDraft, composeNewEmailDraft } from '@/utils/emailRefiner';
import { getLastEmailDraft } from './memory';

const getAccessToken = getAccessTokenStatic;

function extractHeader(headers: any[], name: string): string {
  const h = headers?.find((hdr: any) => String(hdr.name || '').toLowerCase() === name.toLowerCase());
  return String(h?.value || '');
}

function getEmailBody(payload: any): { content: string; mimeType: string; inlineImages: { [k: string]: string } } {
  let content = '';
  let mimeType = 'text/plain';
  const inlineImages: { [key: string]: string } = {};
  try {
    if (payload?.body?.size > 0 && payload?.body?.data) {
      // @ts-ignore
      content = decodeURIComponent(escape(atob(String(payload.body.data).replace(/-/g, '+').replace(/_/g, '/'))));
      mimeType = payload.mimeType || 'text/plain';
    } else if (Array.isArray(payload?.parts)) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
          // @ts-ignore
          content = decodeURIComponent(escape(atob(String(part.body?.data || '').replace(/-/g, '+').replace(/_/g, '/'))));
          mimeType = part.mimeType;
        } else if (typeof part.mimeType === 'string' && part.mimeType.startsWith('image/')) {
          const contentId = Array.isArray(part.headers) ? part.headers.find((h: any) => h?.name === 'Content-ID')?.value : undefined;
          if (contentId) {
            const cid = String(contentId).replace(/[<>]/g, '');
            inlineImages[cid] = `data:${part.mimeType};base64,${part.body?.data || ''}`;
          }
        }
      }
    }
  } catch {}
  return { content, mimeType, inlineImages };
}

async function gmailGet<T = any>(url: string, token: string): Promise<T> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`GMAIL_HTTP_${resp.status}`);
  return await resp.json();
}

async function fetchEmailById(id: string, token: string): Promise<EmailWithSummary> {
  const data: any = await gmailGet(`https://www.googleapis.com/gmail/v1/users/me/messages/${id}`, token);
  const headers = Array.isArray(data?.payload?.headers) ? data.payload.headers : [];
  const { content, mimeType, inlineImages } = getEmailBody(data?.payload || {});
  return {
    id: String(data?.id || id),
    subject: extractHeader(headers, 'Subject') || 'No Subject',
    from: extractHeader(headers, 'From') || 'Unknown Sender',
    snippet: String(data?.snippet || ''),
    body: content || '',
    mimeType: mimeType || 'text/plain',
    inlineImages,
    date: extractHeader(headers, 'Date') || undefined,
  };
}

async function fetchLatestEmails(
  limit: number,
  token: string,
  pageToken?: string
): Promise<{ emails: EmailWithSummary[]; nextPageToken?: string }> {
  const base = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.max(1, Math.min(50, limit))}`;
  const url = pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base;
  const list: any = await gmailGet(url, token);
  const nextPageToken = typeof list?.nextPageToken === 'string' ? list.nextPageToken : undefined;
  const ids = Array.isArray(list?.messages) ? list.messages.slice(0, limit).map((m: any) => String(m.id)) : [];
  const emails: EmailWithSummary[] = [];
  for (const id of ids) {
    try { emails.push(await fetchEmailById(id, token)); } catch {}
  }
  return { emails, nextPageToken };
}

async function searchEmails(
  { from, subject, query, limit, pageToken }: { from?: string; subject?: string; query?: string; limit: number; pageToken?: string },
  token: string
): Promise<{ emails: EmailWithSummary[]; nextPageToken?: string }> {
  const parts: string[] = [];
  if (from && from.trim()) parts.push(`from:"${from.trim()}"`);
  if (subject && subject.trim()) parts.push(`subject:"${subject.trim()}"`);
  if (query && query.trim()) parts.push(query.trim());
  const q = encodeURIComponent(parts.join(' ').trim());
  const base = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.max(1, Math.min(50, limit))}${q ? `&q=${q}` : ''}`;
  const url = pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base;
  const list: any = await gmailGet(url, token);
  const nextPageToken = typeof list?.nextPageToken === 'string' ? list.nextPageToken : undefined;
  const ids = Array.isArray(list?.messages) ? list.messages.slice(0, limit).map((m: any) => String(m.id)) : [];
  const emails: EmailWithSummary[] = [];
  for (const id of ids) {
    try { emails.push(await fetchEmailById(id, token)); } catch {}
  }
  return { emails, nextPageToken };
}

const email_fetch_latest: ToolHandler = async (args: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
  const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 1)));
  const pageToken = typeof args?.pageToken === 'string' ? args.pageToken : undefined;
  const { emails, nextPageToken } = await fetchLatestEmails(limit, token, pageToken);
  return { emails, nextPageToken, isPagination: !!pageToken };
};

const email_search: ToolHandler = async (args: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
  const from = typeof args?.from === 'string' ? args.from : undefined;
  const subject = typeof args?.subject === 'string' ? args.subject : undefined;
  const query = typeof args?.query === 'string' ? args.query : undefined;
  const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 10)));
  const pageToken = typeof args?.pageToken === 'string' ? args.pageToken : undefined;
  const { emails, nextPageToken } = await searchEmails({ from, subject, query, limit, pageToken }, token);
  return { emails, nextPageToken, isPagination: !!pageToken };
};

const email_generate_reply_single: ToolHandler = async (args: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
  const emailId = typeof args?.emailId === 'string' ? args.emailId : undefined;
  const instruction = typeof args?.instruction === 'string' ? args.instruction : undefined;
  const email = emailId ? await fetchEmailById(emailId, token) : (await fetchLatestEmails(1, token)).emails[0];
  if (!email) throw new Error('EMAIL_NOT_FOUND');
  const resp = await generateAutoReply(email);
  let replyDraft = resp.replyDraft;
  if (instruction && instruction.trim().length > 0) {
    try {
      const refined = await refineEmailDraft({
        email: { subject: email.subject, from: email.from, snippet: email.snippet },
        previousDraft: replyDraft,
        instruction: instruction.trim(),
      });
      if (refined && refined.length > 0) replyDraft = refined;
    } catch {}
  }
  return { email, replyDraft, actionItems: resp.actionItems, accessToken: token };
};

const email_generate_reply_many: ToolHandler = async (args: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
  const ids: string[] | undefined = Array.isArray(args?.emailIds) ? args.emailIds : undefined;
  const limit = Math.max(1, Math.min(20, Number(args?.limit || (ids ? ids.length : 3))));
  const emails = ids && ids.length
    ? await Promise.all(ids.map((id) => fetchEmailById(String(id), token)))
    : (await fetchLatestEmails(limit, token)).emails;
  const replyDrafts = await Promise.all(emails.map((e) => generateAutoReply(e)));
  return { emails, replyDrafts, accessToken: token };
};

const email_send_reply: ToolHandler = async (args: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
  const emailId = String(args?.emailId || '');
  const reply = String(args?.reply || '');
  if (!emailId || !reply) throw new Error('MISSING_PARAMS');
  const email = await fetchEmailById(emailId, token);
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const toMatch = String(email.from || '').match(emailRegex);
  const to = toMatch ? toMatch[0] : '';
  const subject = `Re: ${email.subject || 'No Subject'}`;
  const emailContent = [`To: ${to}`, `Subject: ${subject}`, '', reply].join('\r\n');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(emailContent);
  // @ts-ignore
  const encodedMessage = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const resp = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodedMessage }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`SEND_FAILED: ${String(err?.error?.message || resp.status)}`);
  }
  return { sent: true, to, subject };
};

// generate a draft for a new outgoing email (do not send)
const email_generate_new_draft: ToolHandler = async (args: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
  const to = String(args?.to || '').trim();
  const subjectInput = typeof args?.subject === 'string' ? String(args.subject).trim() : '';
  const bodyInput = typeof args?.body === 'string' ? String(args.body).trim() : '';
  if (!to) throw new Error('MISSING_TO');
  // Use AI to compose a concise subject and a polished body based on the short message
  let subject = subjectInput;
  let replyDraft = bodyInput;
  try {
    const composed = await composeNewEmailDraft({ to, message: bodyInput || subjectInput || '', tone: 'professional' });
    if (!subject) subject = composed.subject;
    if (!replyDraft) replyDraft = composed.body;
  } catch {}
  if (!subject) subject = 'No Subject';
  return { to, subject, replyDraft, accessToken: token };
};

// NEW: send a brand new email to a specific address
const email_send_new: ToolHandler = async (args: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
  const to = String(args?.to || '').trim();
  const body = String(args?.body || '').trim();
  const subject = (typeof args?.subject === 'string' ? String(args.subject).trim() : '') || 'No Subject';
  if (!to || !body) throw new Error('MISSING_PARAMS');

  const emailContent = [`To: ${to}`, `Subject: ${subject}`, '', body].join('\r\n');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(emailContent);
  // @ts-ignore
  const encodedMessage = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const resp = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodedMessage }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`SEND_FAILED: ${String(err?.error?.message || resp.status)}`);
  }
  return { sent: true, to, subject };
};

export const emailToolHandlers: Record<string, ToolHandler> = {
  email_fetch_latest,
  email_search,
  email_generate_reply_single,
  email_generate_reply_many,
  email_generate_new_draft,
  email_send_new,
  email_send_reply,
  email_update_draft: async (args: any) => {
    const reply = String(args?.reply || '').trim();
    if (!reply) throw new Error('MISSING_REPLY');
    const baseDraft = getLastEmailDraft();
    return { updatedDraft: reply, baseDraft };
  },
};


