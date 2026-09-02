import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated } from 'react-native';
import { getDeepgramConfig } from '@/config/deepgram';
import { useDeepgramTranscription } from '@/lib/useDeepgramTranscription';

type UseCompactVoiceInputOptions = {
  inputValue: string;
  setInputValue: (value: string) => void;
  glowAnim: Animated.Value;
  onFinalTranscript?: (value: string) => Promise<void> | void;
};

const buildInputValue = (baseValue: string, transcript: string) => {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    return baseValue;
  }
  return baseValue ? `${baseValue} ${trimmedTranscript}` : trimmedTranscript;
};

export function useCompactVoiceInput({
  inputValue,
  setInputValue,
  glowAnim,
  onFinalTranscript,
}: UseCompactVoiceInputOptions) {
  const [microphoneColor, setMicrophoneColor] = useState('#FFFFFF');
  const inputBaseRef = useRef('');
  const deepgramConfig = getDeepgramConfig();

  const { isStreaming, startListening, stopListening, cancelListening } = useDeepgramTranscription({
    apiKey: deepgramConfig.apiKey,
    model: deepgramConfig.model,
    language: deepgramConfig.language,
    onPartialTranscript: (transcript) => {
      setInputValue(buildInputValue(inputBaseRef.current, transcript));
    },
    onFinalTranscript: (transcript) => {
      const nextValue = buildInputValue(inputBaseRef.current, transcript);
      setInputValue(nextValue);
      void onFinalTranscript?.(nextValue);
    },
    onError: (error) => {
      Alert.alert('Transcription Error', error);
    },
  });

  useEffect(() => {
    setMicrophoneColor(isStreaming ? '#12F61A' : '#FFFFFF');

    if (isStreaming) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();

      return () => {
        animation.stop();
      };
    }

    Animated.timing(glowAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [glowAnim, isStreaming]);

  const beginListening = useCallback(async () => {
    inputBaseRef.current = inputValue.trim();
    await startListening();
  }, [inputValue, startListening]);

  const handleMicrophonePress = useCallback(() => {
    if (isStreaming) {
      void stopListening();
      return;
    }
    void beginListening();
  }, [beginListening, isStreaming, stopListening]);

  return {
    isListening: isStreaming,
    microphoneColor,
    handleMicrophonePress,
    startListening: beginListening,
    stopListening,
    cancelListening,
  };
}
