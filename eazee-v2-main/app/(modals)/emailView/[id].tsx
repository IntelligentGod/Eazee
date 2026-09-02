import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import WebView from 'react-native-webview';
import { getAccessTokenStatic } from '@/app/context/TokenContext';

interface DisplayedEmail {
  id: string;
  subject: string;
  from: string;
  date: string; 
  body: string;
  mimeType: string;
  inlineImages?: { [key: string]: string };
  snippet?: string; 
}

function extractHeader(headers: any[], name: string): string {
  const h = headers?.find((hdr: any) => String(hdr.name || '').toLowerCase() === name.toLowerCase());
  return String(h?.value || '');
}

function getEmailBody(payload: any): { content: string; mimeType: string; inlineImages: { [k: string]: string } } {
  let content = '';
  let mimeType = 'text/plain';
  const inlineImages: { [key: string]: string } = {};
  if (payload?.body?.size > 0 && payload?.body?.data) {
    content = decodeURIComponent(escape(atob(String(payload.body.data).replace(/-/g, '+').replace(/_/g, '/'))));
    mimeType = payload.mimeType || 'text/plain';
  } else if (Array.isArray(payload?.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
        content = decodeURIComponent(escape(atob(String(part.body?.data || '').replace(/-/g, '+').replace(/_/g, '/'))));
        mimeType = part.mimeType;
      } else if (typeof part.mimeType === 'string' && part.mimeType.startsWith('image/')) {
        const contentId = Array.isArray(part.headers) ? part.headers.find((h: any) => h?.name === 'Content-ID')?.value : undefined;
        if (contentId) {
          const cid = String(contentId).replace(/[<>]/g, '');
          inlineImages[cid] = `data:${part.mimeType};base64,${part.body?.data || ''}`;
        }
      }
    }
  }
  return { content, mimeType, inlineImages };
}

async function fetchFullEmail(emailId: string): Promise<DisplayedEmail | null> {
  const token = await getAccessTokenStatic();
  if (!token) return null;
  const resp = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${emailId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const headers = Array.isArray(data?.payload?.headers) ? data.payload.headers : [];
  const { content, mimeType, inlineImages } = getEmailBody(data?.payload || {});
  return {
    id: String(data?.id || emailId),
    subject: extractHeader(headers, 'Subject') || 'No Subject',
    from: extractHeader(headers, 'From') || 'Unknown Sender',
    snippet: String(data?.snippet || ''),
    body: content || '',
    mimeType: mimeType || 'text/plain',
    inlineImages,
    date: extractHeader(headers, 'Date') || '',
  };
}

const EmailModal = () => {
  const { id, returnTo, email: emailString } = useLocalSearchParams<{ id?: string, returnTo?: string, email?: string }>();
  const router = useRouter();
  const [emailData, setEmailData] = useState<DisplayedEmail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEmail = async () => {
      if (emailString) {
        const parsedEmail = JSON.parse(emailString) as Partial<DisplayedEmail>;
        if (parsedEmail.body) {
          setEmailData(parsedEmail as DisplayedEmail);
          setLoading(false);
          return;
        }
        if (parsedEmail.id || id) {
          const fullEmail = await fetchFullEmail(parsedEmail.id || id || '');
          if (fullEmail) {
            setEmailData({ ...parsedEmail, ...fullEmail } as DisplayedEmail);
          } else {
            setEmailData(null);
          }
          setLoading(false);
          return;
        }
      }
      setEmailData(null);
      setLoading(false);
    };
    loadEmail();
    return () => setEmailData(null);
  }, [emailString, id]);

  const handleClose = useCallback(() => {
    if (returnTo) {
      router.replace(returnTo as string);
    } else {
      router.back();
    }
  }, [returnTo, router]);

  if (loading) {
    return (
      <LinearGradient
        colors={['#E82B2B', '#E82B2B']}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator size="large" color="#FFFFFF" />
      </LinearGradient>
    );
  }

  if (!emailData) {
    return (
      <LinearGradient
        colors={['#E82B2B', '#E82B2B']}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text className="text-base text-white">Email not found or invalid data</Text>
      </LinearGradient>
    );
  }

  // Helper to get a displayable date
  const getFormattedDate = () => {
    if (!emailData.date) return 'No date';
    try {
      // Attempt to parse common date formats or ISO strings
      const parsed = parseISO(emailData.date);
      if (parsed.toString() !== 'Invalid Date') {
        return format(parsed, 'MMM d, yyyy h:mm a');
      }
      // Fallback for other potential date string formats if parseISO fails
      const genericParsed = new Date(emailData.date);
       if (genericParsed.toString() !== 'Invalid Date') {
        return format(genericParsed, 'MMM d, yyyy h:mm a');
      }
      return emailData.date; // If all parsing fails, show the original string
    } catch (e) {
      console.warn("Failed to parse date in modal:", emailData.date, e);
      return emailData.date; // Show original string on error
    }
  };
  
  const htmlContent = emailData.body || "";
  const mimeType = emailData.mimeType || "text/plain";
  const inlineImages = emailData.inlineImages || {};

  const replaceInlineImagesInHtml = (html: string, images: { [key: string]: string }) => {
    return html.replace(/src="cid:([^"]+)"/g, (match, cid) => {
      return images[cid] ? `src="${images[cid]}"` : match;
    });
  };
  
  const finalHtmlBody = mimeType === 'text/html' 
    ? replaceInlineImagesInHtml(htmlContent, inlineImages) 
    : `<pre>${htmlContent}</pre>`;

  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom'
        }} 
      />
      <LinearGradient
        colors={['#E82B2B', '#821818']}
        style={{ flex: 1 }}
      >
        <View
          style={{
            position: 'absolute',
            top: 40,
            left: -30,
            right: 0,
            alignItems: 'center',
            zIndex: 10,
          }}
          pointerEvents="none"
        >
          <Image
            source={require('../../../assets/images/eazee-bg-screen.png')}
            style={{
              width: 662,
              height: 664,
              opacity: 1.0,
            }}
            resizeMode="contain"
          />
        </View>
        <View className="flex-1 px-4 py-12">
          <View className="flex-1 bg-[#FF5858] rounded-3xl overflow-hidden">
            <View className="flex-row items-center p-4">
              <TouchableOpacity 
                onPress={handleClose} 
                className="p-2"
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" opacity={0.9} />
              </TouchableOpacity>
              <Text className="text-lg font-bold ml-4 text-white/40">Email Details</Text>
            </View>
            <View className="h-px bg-[#FFA5A5]" />
            
            <ScrollView 
              className="flex-1 px-4 pb-4 pt-4"
              showsVerticalScrollIndicator={false}
            >
              <View className="mb-3">
                <Text className="text-[17px] font-bold text-white mb-2">
                  {emailData.subject}
                </Text>
                <Text className="text-sm text-white/40">
                  {getFormattedDate()}
                </Text>
              </View>
              
              <View className="flex-row mb-5">
                <Text className="text-base font-bold text-white mr-2">From:</Text>
                <Text className="text-base text-white/70">{emailData.from}</Text>
              </View>

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
                          background-color: #FF5858;
                          color: #FFFFFF;
                        }
                        img { max-width: 100%; height: auto; }
                      </style>
                    </head>
                    <body>${finalHtmlBody}</body>
                  </html>
                `}}
                style={{ flex: 1, height: 500, backgroundColor: '#FF5858' }}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                bounces={false}
                showsVerticalScrollIndicator={true}
                containerStyle={{ flex: 1, backgroundColor: '#FF5858' }}
                scalesPageToFit={true}
                androidLayerType="hardware"
                originWhitelist={['*']}
              />
            </ScrollView>
          </View>
        </View>
      </LinearGradient>
    </>
  );
};

export default EmailModal;