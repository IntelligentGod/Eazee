import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import EmailModel from '../../../database/models/EmailModel';
import { database } from '../../../database/database';
import WebView from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshAsync } from 'expo-auth-session';
import { generateAutoReply } from '@/utils/emailAutoReply';
import { decode as decodeHtml } from 'html-entities';

const EmailModal = () => {
  const { id, returnTo, email } = useLocalSearchParams();
  const router = useRouter();
  const [emailData, setEmailData] = useState<EmailModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailBody, setEmailBody] = useState<{ content: string; mimeType: string; inlineImages: { [key: string]: string } }>({
    content: '',
    mimeType: 'text/plain',
    inlineImages: {}
  });
  const [emailPlain, setEmailPlain] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const loadEmail = async () => {
      try {
        // If full email payload is provided via params, use it directly
        if (typeof email === 'string' && email.length > 0) {
          try {
            const parsed = JSON.parse(email);
            setEmailPlain(parsed);
            setEmailBody({
              content: String(parsed?.body || ''),
              mimeType: String(parsed?.mimeType || 'text/plain'),
              inlineImages: typeof parsed?.inlineImages === 'object' && parsed?.inlineImages ? parsed.inlineImages : {},
            });
          } catch (e) {
            // fallback to DB
            const emailRecord = await database.get<EmailModel>('emails').find(id as string);
            setEmailData(emailRecord);
            if (emailRecord?.body) {
              setEmailBody({
                content: emailRecord.body,
                mimeType: 'text/html',
                inlineImages: {}
              });
            }
          }
        } else {
          const emailRecord = await database.get<EmailModel>('emails').find(id as string);
          setEmailData(emailRecord);
          if (emailRecord?.body) {
            setEmailBody({
              content: emailRecord.body,
              mimeType: 'text/html',
              inlineImages: {}
            });
          }
        }
      } catch (error) {
        console.error('Error loading email:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEmail();

    return () => {
      setEmailData(null);
      setEmailBody({ content: '', mimeType: 'text/plain', inlineImages: {} });
      setEmailPlain(null);
    };
  }, [id, email]);

  const handleClose = useCallback(() => {
    if (returnTo) {
      router.replace(returnTo as string);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  const GOOGLE_CLIENT_ID = '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com';
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const storedAccessToken = await AsyncStorage.getItem('googleAccessToken');
      if (storedAccessToken) return storedAccessToken;
      const refreshToken = await AsyncStorage.getItem('googleRefreshToken');
      if (!refreshToken) return null;
      const tokenResult = await refreshAsync(
        { clientId: GOOGLE_CLIENT_ID, refreshToken },
        { tokenEndpoint: 'https://oauth2.googleapis.com/token' }
      );
      if (tokenResult?.accessToken) {
        await AsyncStorage.setItem('googleAccessToken', tokenResult.accessToken);
        return tokenResult.accessToken;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const handleAiReply = useCallback(async () => {
    try {
      setIsProcessing(true);
      const baseEmail = emailPlain
        ? {
            id: String(emailPlain.id || ''),
            subject: String(emailPlain.subject || 'No Subject'),
            from: String(emailPlain.from || ''),
            snippet: String(emailPlain.snippet || ''),
            body: String(emailPlain.body || ''),
            mimeType: String(emailPlain.mimeType || 'text/plain'),
          }
        : emailData
        ? {
            id: String((emailData as any).gmailId || String(emailData.id)),
            subject: String(emailData.subject || 'No Subject'),
            from: String(emailData.from || ''),
            snippet: String(emailData.snippet || ''),
            body: String(emailBody.content || ''),
            mimeType: String(emailBody.mimeType || 'text/plain'),
          }
        : null;
      if (!baseEmail) {
        Alert.alert('Error', 'Email not available to draft a reply.');
        return;
      }
      const resp = await generateAutoReply(baseEmail);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        Alert.alert('Authentication Error', 'Please reconnect your Google account.');
        return;
      }
      router.replace({
        pathname: '/(tabs)/email/draft',
        params: {
          email: JSON.stringify(baseEmail),
          replyDraft: resp.replyDraft,
          actionItems: JSON.stringify(resp.actionItems),
          accessToken,
        },
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate AI reply.');
    } finally {
      setIsProcessing(false);
    }
  }, [emailPlain, emailData, emailBody, getAccessToken, router]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#22AB93" />
      </View>
    );
  }

  if (!emailData && !emailPlain) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-base text-gray-600">Email not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom'
        }} 
      />
      <View className="flex-1 bg-white pt-8">
        <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
          <View className="flex-row items-center">
            <TouchableOpacity 
              onPress={handleClose} 
              className="p-2"
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#22AB93" />
            </TouchableOpacity>
            <Text className="text-lg font-bold ml-4 text-gray-800">Email Details</Text>
          </View>
          <TouchableOpacity
            onPress={handleAiReply}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-[#22AB93] rounded"
            activeOpacity={0.8}
          >
            <Text className="text-white font-semibold">{isProcessing ? 'Working…' : 'AI Reply'}</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView 
          className="flex-1 p-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5">
            <Text className="text-[22px] font-bold text-gray-800 mb-2">
              {emailData?.subject || emailPlain?.subject || ''}
            </Text>
            <Text className="text-sm text-gray-600">
              {(emailData?.emailDate && format(emailData.emailDate, 'MMM d, yyyy h:mm a')) || ''}
            </Text>
          </View>
          
          <View className="flex-row mb-5">
            <Text className="text-base font-bold text-gray-800 mr-2">From:</Text>
            <Text className="text-base text-gray-600">{emailData?.from || emailPlain?.from || ''}</Text>
          </View>

          {/* <View className="p-4 bg-gray-100 rounded-lg mb-4">
            <Text className="text-base text-gray-800 leading-6">
              {emailData.snippet}
            </Text>
          </View> */}

          <WebView
            source={{
              html: `
              <html>
                <head>
                  <meta charset="UTF-8">
                  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=0.8, maximum-scale=1.0, user-scalable=yes">
                  <link href="https://fonts.googleapis.com/css?family=Noto+Sans+JP&display=swap" rel="stylesheet">
                  <style>
                    body {
                      font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      font-size: 16px;
                      line-height: 1.5;
                      height: 100%;
                      overflow-y: scroll;
                      -webkit-overflow-scrolling: touch;
                      word-wrap: break-word;
                      -webkit-font-smoothing: antialiased;
                    }
                    img { max-width: 100%; height: auto; }
                  </style>
                </head>
                <body>${emailBody.mimeType === 'text/html' ? emailBody.content : `<pre>${decodeHtml(emailBody.content)}</pre>`}</body>
              </html>
            `}}
            style={{ flex: 1, height: 500 }}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            bounces={false}
            showsVerticalScrollIndicator={true}
            containerStyle={{ flex: 1 }}
            scalesPageToFit={true}
            androidLayerType="hardware"
            originWhitelist={['*']}
          />
        </ScrollView>
      </View>
    </>
  );
};

export default EmailModal;