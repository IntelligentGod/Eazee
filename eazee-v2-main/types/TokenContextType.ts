export interface TokenContextType {
    accessToken: string | null;
    refreshToken: string | null;
    setTokens: (accessToken: string | null, refreshToken: string | null) => Promise<void>;
    getAccessToken: () => Promise<string | null>;
  }