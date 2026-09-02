import { getGoogleConnectionStatusStatic } from '@/app/context/TokenContext';
import type { ToolHandler } from './todo';

const google_connection_status: ToolHandler = async () => {
  const status = await getGoogleConnectionStatusStatic();

  return {
    connected: status.isConnected,
    active: status.isActive,
    services: {
      email: status.isActive,
      calendar: status.isActive,
    },
    requiresReconnect: status.isConnected && !status.isActive,
  };
};

export const googleToolHandlers: Record<string, ToolHandler> = {
  google_connection_status,
};
