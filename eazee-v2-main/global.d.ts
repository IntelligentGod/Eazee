/// <reference types="nativewind/types" />

declare module 'react-native-live-audio-stream' {
  interface AudioConfig {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource: number;
    bufferSize: number;
  }

  const LiveAudioStream: {
    init: (config: AudioConfig) => void;
    start: () => void;
    stop: () => void;
    on: (event: 'data', callback: (data: string) => void) => { remove: () => void };
  };

  export default LiveAudioStream;
}
