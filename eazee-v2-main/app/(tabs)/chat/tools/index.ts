import { todoToolHandlers, ToolHandler } from './todo';
import { emailToolHandlers } from './email';
import { calendarToolHandlers } from './calendar';
import { overviewToolHandlers } from './overview';
import { googleToolHandlers } from './google';

const handlers: Record<string, ToolHandler> = {
  ...todoToolHandlers,
  ...emailToolHandlers,
  ...calendarToolHandlers,
  ...overviewToolHandlers,
  ...googleToolHandlers,
};

export const getToolHandler = (name: string): ToolHandler | undefined => handlers[name];

export const KNOWN_TOOL_NAMES = Object.keys(handlers);

