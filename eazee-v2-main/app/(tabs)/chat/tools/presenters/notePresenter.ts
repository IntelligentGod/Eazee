import type { AssistantMessage, UiAction } from '../types';

export function presentNoteResult(): { messages: AssistantMessage[]; uiActions?: UiAction[] } {
  return { messages: [] };
}
