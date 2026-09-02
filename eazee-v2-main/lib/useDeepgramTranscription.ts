import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';
import LiveAudioStream from 'react-native-live-audio-stream';
import {
  createDeepgramStreamingSession,
  DeepgramSession,
  DeepgramStreamingConfig,
} from './deepgramStreaming';

export interface UseDeepgramTranscriptionConfig {
  apiKey: string;
  model?: DeepgramStreamingConfig['model'];
  language?: string;
  onFinalTranscript?: (transcript: string) => void;
  onPartialTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
  autoStopOnSilence?: boolean;
}

export interface UseDeepgramTranscriptionResult {
  isStreaming: boolean;
  partialTranscript: string;
  finalTranscript: string;
  lastError: string | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancelListening: () => Promise<void>;
}

type AudioStreamSubscription = {
  remove: () => void;
};

export function useDeepgramTranscription(
  config: UseDeepgramTranscriptionConfig
): UseDeepgramTranscriptionResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);

  const configRef = useRef(config);
  configRef.current = config;
  const sessionRef = useRef<DeepgramSession | null>(null);
  const accumulatedTranscriptRef = useRef<string>('');
  const stopListeningRef = useRef<(() => Promise<void>) | null>(null);
  const isStreamingRef = useRef(false);
  const audioBufferRef = useRef<Uint8Array[]>([]);
  const audioSubscriptionRef = useRef<AudioStreamSubscription | null>(null);
  const isConnectedRef = useRef(false);
  const displayedTranscriptRef = useRef('');
  const hasDeliveredFinalTranscriptRef = useRef(false);
  const pendingStopRef = useRef(false);

  const requestMicrophonePermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  };

  const createSession = useCallback(() => {
    const session = createDeepgramStreamingSession(
      {
        apiKey: configRef.current.apiKey,
        model: configRef.current.model || 'nova-3',
        language: configRef.current.language || 'en',
        punctuate: true,
        smartFormat: true,
        interimResults: true,
        endpointing: 150,
        utteranceEndMs: 1000,
      },
      {
        onOpen: () => {
          if (sessionRef.current !== session) {
            return;
          }
          isConnectedRef.current = true;
          for (const chunk of audioBufferRef.current) {
            session.sendAudio(chunk);
          }
          audioBufferRef.current = [];
          if (pendingStopRef.current) {
            pendingStopRef.current = false;
            session.finalize();
          }
        },
        onTranscriptPartial: (transcript) => {
          const nextTranscript = accumulatedTranscriptRef.current
            ? `${accumulatedTranscriptRef.current} ${transcript}`
            : transcript;
          displayedTranscriptRef.current = nextTranscript;
          setPartialTranscript(nextTranscript);
          configRef.current.onPartialTranscript?.(nextTranscript);
        },
        onTranscriptFinal: (transcript) => {
          accumulatedTranscriptRef.current += (accumulatedTranscriptRef.current ? ' ' : '') + transcript;
          displayedTranscriptRef.current = accumulatedTranscriptRef.current;
          setFinalTranscript(accumulatedTranscriptRef.current);
          setPartialTranscript(accumulatedTranscriptRef.current);
        },
        onUtteranceEnd: () => {
          if (configRef.current.autoStopOnSilence !== false && displayedTranscriptRef.current.trim()) {
            stopListeningRef.current?.();
          }
        },
        onError: (error) => {
          setLastError(error);
          configRef.current.onError?.(error);
        },
        onClose: () => {
          const isCurrentSession = sessionRef.current === session;
          if (isCurrentSession) {
            sessionRef.current = null;
            isConnectedRef.current = false;
          }
          if (isStreamingRef.current && isCurrentSession) {
            setIsStreaming(false);
            isStreamingRef.current = false;
          }
        },
      }
    );

    sessionRef.current = session;
    return session;
  }, []);

  const warmSession = useCallback(() => {
    if (!configRef.current.apiKey || sessionRef.current) {
      return;
    }
    const session = createSession();
    session.start();
  }, [createSession]);

  const stopAudioStream = useCallback(() => {
    audioSubscriptionRef.current?.remove();
    audioSubscriptionRef.current = null;
    LiveAudioStream.stop();
  }, []);

  const startListening = useCallback(async () => {
    if (isStreamingRef.current) return;

    setIsStreaming(true);
    isStreamingRef.current = true;
    setLastError(null);
    setPartialTranscript('');
    setFinalTranscript('');
    accumulatedTranscriptRef.current = '';
    displayedTranscriptRef.current = '';
    hasDeliveredFinalTranscriptRef.current = false;
    pendingStopRef.current = false;

    if (!configRef.current.apiKey) {
      const error = 'Deepgram API key not configured';
      setLastError(error);
      configRef.current.onError?.(error);
      setIsStreaming(false);
      isStreamingRef.current = false;
      return;
    }

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      setLastError('Microphone permission denied');
      setIsStreaming(false);
      isStreamingRef.current = false;
      return;
    }

    audioBufferRef.current = [];
    const session = sessionRef.current ?? createSession();
    isConnectedRef.current = session.isConnected();
    session.start();

    LiveAudioStream.init({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6,
      bufferSize: 2048,
    });

    audioSubscriptionRef.current?.remove();
    audioSubscriptionRef.current = LiveAudioStream.on('data', (base64: string) => {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (isConnectedRef.current && sessionRef.current?.isConnected()) {
        sessionRef.current.sendAudio(bytes);
      } else {
        audioBufferRef.current.push(bytes);
      }
    });

    LiveAudioStream.start();
  }, [createSession]);

  const finishListening = useCallback(async (deliverFinalTranscript: boolean) => {
    if (!isStreamingRef.current && !sessionRef.current) return;

    stopAudioStream();

    const session = sessionRef.current;
    if (session && !session.isConnected() && audioBufferRef.current.length) {
      pendingStopRef.current = true;
      await session.waitUntilConnected(1500);
    }

    session?.finalize();
    await new Promise((resolve) => setTimeout(resolve, 700));

    audioBufferRef.current = [];
    isConnectedRef.current = false;
    pendingStopRef.current = false;
    session?.close();
    sessionRef.current = null;
    setIsStreaming(false);
    isStreamingRef.current = false;

    if (deliverFinalTranscript) {
      const finalText = accumulatedTranscriptRef.current.trim() || displayedTranscriptRef.current.trim();
      if (finalText && !hasDeliveredFinalTranscriptRef.current) {
        hasDeliveredFinalTranscriptRef.current = true;
        setFinalTranscript(finalText);
        setPartialTranscript(finalText);
        configRef.current.onFinalTranscript?.(finalText);
      }
    } else {
      accumulatedTranscriptRef.current = '';
      displayedTranscriptRef.current = '';
      hasDeliveredFinalTranscriptRef.current = false;
      setFinalTranscript('');
      setPartialTranscript('');
    }
    warmSession();
  }, [stopAudioStream, warmSession]);

  const stopListening = useCallback(async () => {
    await finishListening(true);
  }, [finishListening]);

  const cancelListening = useCallback(async () => {
    await finishListening(false);
  }, [finishListening]);

  useEffect(() => {
    warmSession();

    return () => {
      pendingStopRef.current = false;
      audioBufferRef.current = [];
      isConnectedRef.current = false;
      stopAudioStream();
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [stopAudioStream, warmSession]);

  stopListeningRef.current = stopListening;

  return {
    isStreaming,
    partialTranscript,
    finalTranscript,
    lastError,
    startListening,
    stopListening,
    cancelListening,
  };
}
