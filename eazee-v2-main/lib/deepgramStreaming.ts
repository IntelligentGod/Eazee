export type DeepgramModel = 'nova-3' | 'nova-3-general' | 'nova-2' | 'nova-2-general';

export interface DeepgramStreamingConfig {
  apiKey: string;
  model?: DeepgramModel;
  language?: string;
  punctuate?: boolean;
  smartFormat?: boolean;
  interimResults?: boolean;
  endpointing?: number | boolean;
  utteranceEndMs?: number;
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word: string;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

export interface DeepgramResultsMessage {
  type: 'Results';
  channel_index: number[];
  duration: number;
  start: number;
  is_final: boolean;
  speech_final: boolean;
  channel: DeepgramChannel;
  from_finalize?: boolean;
}

export interface DeepgramMetadataMessage {
  type: 'Metadata';
  transaction_key: string;
  request_id: string;
  sha256: string;
  created: string;
  duration: number;
  channels: number;
}

export interface DeepgramUtteranceEndMessage {
  type: 'UtteranceEnd';
  channel: number[];
  last_word_end: number;
}

export interface DeepgramSpeechStartedMessage {
  type: 'SpeechStarted';
  channel: number[];
  timestamp: number;
}

export interface DeepgramErrorMessage {
  type: 'Error';
  message: string;
  description?: string;
}

export type DeepgramServerMessage =
  | DeepgramResultsMessage
  | DeepgramMetadataMessage
  | DeepgramUtteranceEndMessage
  | DeepgramSpeechStartedMessage
  | DeepgramErrorMessage;

export interface DeepgramSessionCallbacks {
  onOpen?: () => void;
  onTranscriptPartial?: (transcript: string) => void;
  onTranscriptFinal?: (transcript: string) => void;
  onUtteranceEnd?: () => void;
  onSpeechStarted?: () => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

export interface DeepgramSession {
  start: () => void;
  sendAudio: (chunk: ArrayBuffer | Uint8Array) => void;
  finalize: () => void;
  close: () => void;
  isConnected: () => boolean;
  waitUntilConnected: (timeoutMs?: number) => Promise<boolean>;
}

function logDeepgram(message: string, value?: unknown) {
  void message;
  void value;
}

function buildDeepgramUrl(config: DeepgramStreamingConfig): string {
  const params = new URLSearchParams();
  params.set('model', config.model || 'nova-3');
  params.set('language', config.language || 'en');
  params.set('punctuate', String(config.punctuate !== false));
  params.set('smart_format', String(config.smartFormat !== false));
  params.set('interim_results', String(config.interimResults !== false));
  params.set('encoding', 'linear16');
  params.set('sample_rate', '16000');
  params.set('channels', '1');
  
  if (config.endpointing !== undefined) {
    params.set('endpointing', String(config.endpointing));
  }
  if (config.utteranceEndMs !== undefined) {
    params.set('utterance_end_ms', String(config.utteranceEndMs));
  }
  
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export function createDeepgramStreamingSession(
  config: DeepgramStreamingConfig,
  callbacks: DeepgramSessionCallbacks
): DeepgramSession {
  let ws: WebSocket | null = null;
  let connected = false;
  let shouldFinalizeOnOpen = false;
  let pendingAudioChunks: (ArrayBuffer | Uint8Array)[] = [];
  let connectionWaiters: ((isConnected: boolean) => void)[] = [];

  const resolveConnectionWaiters = (isReady: boolean) => {
    if (!connectionWaiters.length) {
      return;
    }
    for (const resolve of connectionWaiters) {
      resolve(isReady);
    }
    connectionWaiters = [];
  };

  const flushPendingAudio = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !pendingAudioChunks.length) {
      return;
    }
    for (const chunk of pendingAudioChunks) {
      ws.send(chunk);
    }
    pendingAudioChunks = [];
  };

  const start = () => {
    if (ws) {
      logDeepgram('[Deepgram] WebSocket already exists, skipping');
      return;
    }

    const url = buildDeepgramUrl(config);

    logDeepgram('[Deepgram] Connecting to:', url);
    logDeepgram('[Deepgram] API key length:', config.apiKey?.length || 0);

    // @ts-expect-error React Native WebSocket accepts headers as third argument
    ws = new WebSocket(url, undefined, {
      headers: {
        Authorization: `Token ${config.apiKey}`,
      },
    });
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      logDeepgram('[Deepgram] WebSocket connected successfully');
      connected = true;
      resolveConnectionWaiters(true);
      callbacks.onOpen?.();
      flushPendingAudio();
      if (shouldFinalizeOnOpen && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'Finalize' }));
        shouldFinalizeOnOpen = false;
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') {
        logDeepgram('[Deepgram] Received binary data, length:', event.data?.byteLength);
        return;
      }
      logDeepgram('[Deepgram] Received message:', event.data.substring(0, 200));

      let msg: DeepgramServerMessage;
      try {
        msg = JSON.parse(event.data) as DeepgramServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'Results': {
          const transcript = (msg.channel?.alternatives?.[0]?.transcript || '').trim();
          if (!transcript) break;

          if (msg.is_final) {
            callbacks.onTranscriptFinal?.(transcript);
          } else {
            callbacks.onTranscriptPartial?.(transcript);
          }
          break;
        }
        case 'UtteranceEnd':
          callbacks.onUtteranceEnd?.();
          break;
        case 'SpeechStarted':
          callbacks.onSpeechStarted?.();
          break;
        case 'Error':
          callbacks.onError?.(msg.message || 'Unknown Deepgram error');
          break;
      }
    };

    ws.onerror = (error: any) => {
      logDeepgram('[Deepgram] WebSocket error:', error);
      logDeepgram('[Deepgram] Error message:', error?.message);
      logDeepgram('[Deepgram] Error type:', typeof error);
      resolveConnectionWaiters(false);
      callbacks.onError?.('WebSocket connection error');
    };

    ws.onclose = (event: any) => {
      logDeepgram('[Deepgram] WebSocket closed');
      logDeepgram('[Deepgram] Close code:', event?.code);
      logDeepgram('[Deepgram] Close reason:', event?.reason);
      connected = false;
      shouldFinalizeOnOpen = false;
      pendingAudioChunks = [];
      resolveConnectionWaiters(false);
      ws = null;
      callbacks.onClose?.();
    };
  };

  const sendAudio = (chunk: ArrayBuffer | Uint8Array) => {
    if (!ws) {
      pendingAudioChunks.push(chunk);
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      pendingAudioChunks.push(chunk);
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk);
    }
  };

  const finalize = () => {
    if (!ws) {
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      shouldFinalizeOnOpen = true;
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'Finalize' }));
    }
  };

  const close = () => {
    if (!ws) {
      return;
    }
    pendingAudioChunks = [];
    shouldFinalizeOnOpen = false;
    resolveConnectionWaiters(false);
    try {
      ws.send(JSON.stringify({ type: 'CloseStream' }));
    } catch {}
    try {
      ws.close(1000, 'Session closed');
    } catch {}
    ws = null;
    connected = false;
  };

  const isConnected = () => connected;

  const waitUntilConnected = (timeoutMs = 1500) => {
    if (connected || ws?.readyState === WebSocket.OPEN) {
      connected = true;
      return Promise.resolve(true);
    }
    if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        connectionWaiters = connectionWaiters.filter((waiter) => waiter !== onConnectionResolved);
        resolve(false);
      }, timeoutMs);

      const onConnectionResolved = (isReady: boolean) => {
        clearTimeout(timeoutId);
        resolve(isReady);
      };

      connectionWaiters.push(onConnectionResolved);
    });
  };

  return {
    start,
    sendAudio,
    finalize,
    close,
    isConnected,
    waitUntilConnected,
  };
}
