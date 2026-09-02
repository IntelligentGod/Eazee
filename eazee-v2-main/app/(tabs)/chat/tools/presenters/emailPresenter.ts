import { decode as decodeHtml } from 'html-entities';
import type { AssistantMessage, UiAction } from '../types';
import {
  appendLastEmailItems,
  getLastEmailItems,
  setLastEmailDraft,
  setLastEmailItems,
  setLastEmailPageToken,
} from '../memory';

export function presentEmailResult(name: string, result: any): { messages: AssistantMessage[]; uiActions?: UiAction[] } {
  const messages: AssistantMessage[] = [];
  const uiActions: UiAction[] = [];

  if (name === 'email_fetch_latest') {
    const emails = Array.isArray(result?.emails) ? result.emails : [];
    const nextPageToken = typeof result?.nextPageToken === 'string' && result.nextPageToken ? result.nextPageToken : null;
    const isPagination = !!result?.isPagination;
    setLastEmailPageToken(nextPageToken);
    if (emails.length) {
      const itemsForCard = emails.map((e: any) => ({
        id: String(e.id || ''),
        subject: String(e.subject || 'No Subject'),
        from: String(e.from || 'Unknown Sender'),
        snippet: decodeHtml(String(e.snippet || '')),
        body: typeof e.body === 'string' ? e.body : '',
        mimeType: typeof e.mimeType === 'string' ? e.mimeType : 'text/plain',
        inlineImages: typeof e.inlineImages === 'object' && e.inlineImages ? e.inlineImages : undefined,
        date: typeof e.date === 'string' ? e.date : undefined,
      }));
      const toStore = itemsForCard.map((it: any) => ({ id: it.id, subject: it.subject, from: it.from, snippet: it.snippet, date: it.date }));
      if (isPagination) {
        const prevIds = new Set((getLastEmailItems() || []).map((it: any) => String(it.id)));
        const uniqueItems = itemsForCard.filter((it: any) => !prevIds.has(it.id));
        const uniqueStore = toStore.filter((it: any) => !prevIds.has(it.id));
        appendLastEmailItems(uniqueStore);
        if (uniqueItems.length === 0) {
          messages.push({ role: 'assistant', content: nextPageToken ? 'No more new emails on this page.' : 'No more emails to show.' });
        } else if (uniqueItems.length === 1) {
          messages.push({ role: 'assistant', content: 'Here are the email details.', card: { type: 'emailDetail', items: uniqueItems } });
        } else {
          messages.push({ role: 'assistant', content: `${uniqueItems.length} more emails:`, card: { type: 'emailList', items: uniqueItems } });
        }
      } else {
        setLastEmailItems(toStore);
        if (itemsForCard.length === 1) {
          messages.push({ role: 'assistant', content: 'Here are the email details.', card: { type: 'emailDetail', items: itemsForCard } });
        } else {
          messages.push({ role: 'assistant', content: 'Here are your latest emails.', card: { type: 'emailList', items: itemsForCard } });
        }
      }
    } else {
      messages.push({ role: 'assistant', content: "I couldn't find any emails." });
    }
  } else if (name === 'email_search') {
    const emails = Array.isArray(result?.emails) ? result.emails : [];
    const nextPageToken = typeof result?.nextPageToken === 'string' && result.nextPageToken ? result.nextPageToken : null;
    const isPagination = !!result?.isPagination;
    setLastEmailPageToken(nextPageToken);
    if (emails.length) {
      const itemsForCard = emails.map((e: any) => ({
        id: String(e.id || ''),
        subject: String(e.subject || 'No Subject'),
        from: String(e.from || 'Unknown Sender'),
        snippet: decodeHtml(String(e.snippet || '')),
        body: typeof e.body === 'string' ? e.body : '',
        mimeType: typeof e.mimeType === 'string' ? e.mimeType : 'text/plain',
        inlineImages: typeof e.inlineImages === 'object' && e.inlineImages ? e.inlineImages : undefined,
        date: typeof e.date === 'string' ? e.date : undefined,
      }));
      const toStore = itemsForCard.map((it: any) => ({ id: it.id, subject: it.subject, from: it.from, snippet: it.snippet, date: it.date }));
      if (isPagination) {
        const prevIds = new Set((getLastEmailItems() || []).map((it: any) => String(it.id)));
        const uniqueItems = itemsForCard.filter((it: any) => !prevIds.has(it.id));
        const uniqueStore = toStore.filter((it: any) => !prevIds.has(it.id));
        appendLastEmailItems(uniqueStore);
        if (uniqueItems.length === 0) {
          messages.push({ role: 'assistant', content: nextPageToken ? 'No more new emails on this page.' : 'No more emails matched.' });
        } else if (uniqueItems.length <= 2) {
          messages.push({ role: 'assistant', content: "Here's what I found.", card: { type: 'emailDetail', items: uniqueItems } });
        } else {
          messages.push({ role: 'assistant', content: `Found ${uniqueItems.length} more emails:`, card: { type: 'emailList', items: uniqueItems } });
        }
      } else {
        setLastEmailItems(toStore);
        if (itemsForCard.length <= 2) {
          messages.push({ role: 'assistant', content: "Here's what I found.", card: { type: 'emailDetail', items: itemsForCard } });
        } else {
          messages.push({ role: 'assistant', content: `Found ${itemsForCard.length} emails:`, card: { type: 'emailList', items: itemsForCard } });
        }
      }
    } else {
      messages.push({ role: 'assistant', content: "I couldn't find any emails matching that." });
    }
  } else if (name === 'email_generate_reply_single') {
    const draft = String(result?.replyDraft || '').trim();
    if (draft) {
      setLastEmailDraft({ email: result?.email, replyDraft: draft, actionItems: result?.actionItems, accessToken: result?.accessToken });
      messages.push({ role: 'assistant', content: 'I drafted a reply for you.', card: { type: 'emailDraft', item: { email: result?.email, replyDraft: draft, actionItems: result?.actionItems, accessToken: result?.accessToken } } });
    } else {
      messages.push({ role: 'assistant', content: 'I wasn’t able to generate the draft.' });
    }
  } else if (name === 'email_generate_new_draft') {
    let draft = String(result?.replyDraft || '').trim();
    const to = String(result?.to || '').trim();
    const subject = String(result?.subject || '').trim() || 'No Subject';
    if (to) {
      setLastEmailDraft({ compose: { to, subject }, replyDraft: draft, accessToken: result?.accessToken });
      messages.push({ role: 'assistant', content: 'I drafted a reply for you.', card: { type: 'emailDraft', item: { compose: { to, subject }, replyDraft: draft, accessToken: result?.accessToken } } });
    } else {
      messages.push({ role: 'assistant', content: 'I wasn’t able to generate the draft.' });
    }
  } else if (name === 'email_update_draft') {
    const updated = String(result?.updatedDraft || '').trim();
    if (updated) {
      // Engine ensures memory already has base; we mirror it in the card
      const base = result?.baseDraft || null;
      if (base?.compose) {
        setLastEmailDraft({ compose: base.compose, replyDraft: updated, accessToken: base.accessToken });
        messages.push({ role: 'assistant', content: 'Here’s the updated draft.', card: { type: 'emailDraft', item: { compose: base.compose, replyDraft: updated, accessToken: base.accessToken } } });
      } else if (base?.email) {
        setLastEmailDraft({ email: base.email, replyDraft: updated, actionItems: base.actionItems, accessToken: base.accessToken });
        messages.push({ role: 'assistant', content: 'Here’s the updated draft.', card: { type: 'emailDraft', item: { email: base.email, replyDraft: updated, actionItems: base.actionItems, accessToken: base.accessToken } } });
      } else {
        setLastEmailDraft({ replyDraft: updated });
        messages.push({ role: 'assistant', content: 'Here’s the updated draft.', card: { type: 'emailDraft', item: { replyDraft: updated } } });
      }
    } else {
      messages.push({ role: 'assistant', content: 'No changes applied to the draft.' });
    }
  } else if (name === 'email_refine_draft') {
    const refined = String(result?.replyDraft || '').trim();
    if (refined) {
      const payload = result?.payload || {};
      // Update memory to mirror draft context
      if (payload?.compose) {
        setLastEmailDraft({ compose: payload.compose, replyDraft: refined, accessToken: payload.accessToken });
        messages.push({ role: 'assistant', content: 'Here’s the updated draft.', card: { type: 'emailDraft', item: { compose: payload.compose, replyDraft: refined, accessToken: payload.accessToken } } });
      } else if (payload?.email) {
        setLastEmailDraft({ email: payload.email, replyDraft: refined, actionItems: payload.actionItems, accessToken: payload.accessToken });
        messages.push({ role: 'assistant', content: 'Here’s the updated draft.', card: { type: 'emailDraft', item: { email: payload.email, replyDraft: refined, actionItems: payload.actionItems, accessToken: payload.accessToken } } });
      } else {
        setLastEmailDraft({ replyDraft: refined });
        messages.push({ role: 'assistant', content: 'Here’s the updated draft.', card: { type: 'emailDraft', item: { replyDraft: refined } } });
      }
    } else {
      messages.push({ role: 'assistant', content: 'I wasn’t able to generate the draft.' });
    }
  } else if (name === 'email_generate_reply_many') {
    const emails = Array.isArray(result?.emails) ? result.emails : [];
    const replyDrafts = Array.isArray(result?.replyDrafts) ? result.replyDrafts : [];
    const accessToken = String(result?.accessToken || '');
    if (emails.length && replyDrafts.length) {
      uiActions.push({
        type: 'navigate',
        route: '/(tabs)/email/batchDraft',
        params: { emails: JSON.stringify(emails), replyDrafts: JSON.stringify(replyDrafts), accessToken },
      });
      messages.push({ role: 'assistant', content: `Opening batch drafts for ${emails.length} ${emails.length === 1 ? 'email' : 'emails'}…` });
    } else {
      messages.push({ role: 'assistant', content: 'Could not prepare batch drafts.' });
    }
    } else if (name === 'email_send_reply') {
    if (result?.sent) {
      const to = String(result?.to || 'recipient');
      messages.push({ role: 'assistant', content: `Your reply was sent to ${to}.` });
    } else {
      messages.push({ role: 'assistant', content: 'Failed to send reply.' });
    }
  } else if (name === 'email_send_new') {
    if (result?.sent) {
      const to = String(result?.to || 'recipient');
      messages.push({ role: 'assistant', content: `Your email was sent to ${to}.` });
    } else {
      messages.push({ role: 'assistant', content: 'Failed to send email.' });
    }
  }

  return { messages, uiActions: uiActions.length ? uiActions : undefined };
}

