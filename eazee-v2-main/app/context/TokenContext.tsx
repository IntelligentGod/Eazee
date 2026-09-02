import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshAsync } from 'expo-auth-session';

const GOOGLE_CLIENT_ID = '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export type GoogleConnectionStatus = {
  isConnected: boolean;
  isActive: boolean;
  accessToken: string | null;
  refreshToken: string | null;
};

const isLikelyNetworkError = (err: any) => {
  const msg = String((err && (err.message || err.toString())) || '');
  return (
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    (msg.includes('fetch') && msg.includes('TypeError'))
  );
};

const isRefreshTokenInvalid = (err: any) => {
  const msg = String((err && (err.message || err.toString())) || '').toLowerCase();
  return (
    msg.includes('invalid_grant') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('token has been expired or revoked')
  );
};

async function clearStoredGoogleTokens() {
  await AsyncStorage.removeItem('googleAccessToken');
  await AsyncStorage.removeItem('googleRefreshToken');
}

async function validateGoogleAccessToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
    return response.ok;
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      return true;
    }
    return false;
  }
}

async function refreshStoredGoogleAccessToken(refreshToken: string | null): Promise<string | null> {
  if (!refreshToken) {
    return null;
  }

  try {
    const tokenResult = await refreshAsync(
      {
        clientId: GOOGLE_CLIENT_ID,
        refreshToken,
      },
      { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT }
    );

    if (!tokenResult?.accessToken) {
      return null;
    }

    await AsyncStorage.setItem('googleAccessToken', tokenResult.accessToken);
    return tokenResult.accessToken;
  } catch (error) {
    if (isRefreshTokenInvalid(error)) {
      await clearStoredGoogleTokens();
    }
    return null;
  }
}

interface TokenContextType {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (accessToken: string | null, refreshToken: string | null) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  isLoading: boolean;
  hasTokens: boolean;
}

const TokenContext = createContext<TokenContextType | undefined>(undefined);

export const TokenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const warnedMissingRefreshRef = useRef(false);


  useEffect(() => {
    const loadTokens = async () => {
      try {
        const storedAccessToken = await AsyncStorage.getItem('googleAccessToken');
        const storedRefreshToken = await AsyncStorage.getItem('googleRefreshToken');
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
      } catch (error) {
        console.error('Error loading tokens:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTokens();
  }, []);

  const setTokens = useCallback(async (newAccessToken: string | null, newRefreshToken: string | null) => {
    try {
      if (newAccessToken) {
        await AsyncStorage.setItem('googleAccessToken', newAccessToken);
      } else {
        await AsyncStorage.removeItem('googleAccessToken');
      }
      if (newRefreshToken) {
        await AsyncStorage.setItem('googleRefreshToken', newRefreshToken);
      } else {
        await AsyncStorage.removeItem('googleRefreshToken');
      }
      setAccessToken(newAccessToken);
      setRefreshToken(newRefreshToken);
    } catch (error) {
      console.error('Error saving tokens:', error);
    }
  }, []);

  const refreshAccessToken = useCallback(async () => {
    // Wait for the initial loading to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!refreshToken) {
      // If both tokens are missing, user is logged out — be silent.
      if (!accessToken) {
        return null;
      }
      // If we have an access token but no refresh token, warn once (unexpected state).
      if (!warnedMissingRefreshRef.current) {
        console.warn('Refresh token missing while access token exists — unexpected state');
        warnedMissingRefreshRef.current = true;
      }
      return null;
    }
    const nextAccessToken = await refreshStoredGoogleAccessToken(refreshToken);
    if (!nextAccessToken) {
      try {
        const latestRefreshToken = await AsyncStorage.getItem('googleRefreshToken');
        if (!latestRefreshToken) {
          await setTokens(null, null);
        }
      } catch (error) {
        console.error('Error syncing token state after refresh attempt:', error);
        await setTokens(null, null);
      }
      return null;
    }

    await setTokens(nextAccessToken, refreshToken);
    return nextAccessToken;
  }, [accessToken, refreshToken, setTokens, isLoading]);

const getAccessToken = useCallback(async () => {
    // Wait for the initial loading to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  
    if (!accessToken) {
      return await refreshAccessToken();
    }
  
    // Check if the token is expired
    try {
      const isValid = await validateGoogleAccessToken(accessToken);
      if (!isValid) {
        // Token is invalid or expired, refresh it
        return await refreshAccessToken();
      }
    } catch (error) {
      console.error('Error checking token validity:', error);
      // If offline/network issue, don't invalidate tokens; return current token
      if (isLikelyNetworkError(error)) {
        return accessToken;
      }
      // Otherwise, attempt refresh
      return await refreshAccessToken();
    }
  
    return accessToken;
  }, [accessToken, refreshAccessToken, isLoading]);

  const hasTokens = !!(accessToken || refreshToken);

  return (
    <TokenContext.Provider value={{ accessToken, refreshToken, setTokens, getAccessToken, isLoading, hasTokens }}>
      {children}
    </TokenContext.Provider>
  );
};

export const useTokens = () => {
  const context = useContext(TokenContext);
  if (context === undefined) {
    throw new Error('useTokens must be used within a TokenProvider');
  }
  return context;
};

export async function getGoogleConnectionStatusStatic(): Promise<GoogleConnectionStatus> {
  try {
    const storedAccessToken = await AsyncStorage.getItem('googleAccessToken');
    const storedRefreshToken = await AsyncStorage.getItem('googleRefreshToken');

    if (storedAccessToken) {
      const isValid = await validateGoogleAccessToken(storedAccessToken);
      if (isValid) {
        return {
          isConnected: true,
          isActive: true,
          accessToken: storedAccessToken,
          refreshToken: storedRefreshToken,
        };
      }

      if (!storedRefreshToken) {
        await AsyncStorage.removeItem('googleAccessToken');
        return {
          isConnected: false,
          isActive: false,
          accessToken: null,
          refreshToken: null,
        };
      }
    }

    const refreshedAccessToken = await refreshStoredGoogleAccessToken(storedRefreshToken);
    if (refreshedAccessToken) {
      return {
        isConnected: true,
        isActive: true,
        accessToken: refreshedAccessToken,
        refreshToken: storedRefreshToken,
      };
    }

    const latestAccessToken = await AsyncStorage.getItem('googleAccessToken');
    const latestRefreshToken = await AsyncStorage.getItem('googleRefreshToken');
    return {
      isConnected: !!(latestAccessToken || latestRefreshToken),
      isActive: false,
      accessToken: latestAccessToken,
      refreshToken: latestRefreshToken,
    };
  } catch {
    return {
      isConnected: false,
      isActive: false,
      accessToken: null,
      refreshToken: null,
    };
  }
}

// Standalone helper: get a valid Google access token without requiring React context
// Used by non-React modules (e.g., tool handlers) to avoid 401s on cold start.
export async function getAccessTokenStatic(): Promise<string | null> {
  try {
    const status = await getGoogleConnectionStatusStatic();
    return status.isActive ? status.accessToken : null;
  } catch {
    return null;
  }
}
