import type { DeepgramModel } from '../lib/deepgramStreaming';

export interface DeepgramConfig {
  apiKey: string;
  model: DeepgramModel;
  language: string;
}

export function getDeepgramConfig(): DeepgramConfig {
  const apiKey = 'a1ebb639de0c16332351b4ea1cd1b6b6b2a54efe';
  
  return {
    apiKey,
    model: 'nova-3',
    language: 'en',
  };
}

export function isDeepgramConfigured(): boolean {
  const apiKey = 'a1ebb639de0c16332351b4ea1cd1b6b6b2a54efe';
  return apiKey.length > 0;
}
