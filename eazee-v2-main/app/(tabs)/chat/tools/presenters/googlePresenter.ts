import type { AssistantMessage, UiAction } from '../types';

export function presentGoogleResult(name: string, result: any): { messages: AssistantMessage[]; uiActions?: UiAction[] } {
  if (name !== 'google_connection_status') {
    return { messages: [{ role: 'assistant', content: 'Done.' }] };
  }

  if (result?.active) {
    return {
      messages: [{ role: 'assistant', content: 'Your Google account is connected and active for email and calendar.' }],
    };
  }

  if (result?.requiresReconnect) {
    return {
      messages: [{ role: 'assistant', content: 'Your Google account exists, but it needs to be reconnected before email and calendar sync will work.' }],
    };
  }

  return {
    messages: [{ role: 'assistant', content: 'Your Google account is not connected.' }],
  };
}
