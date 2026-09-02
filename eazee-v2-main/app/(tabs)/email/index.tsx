import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Switch, SafeAreaView, ScrollView, Dimensions, TextInput, Animated, ActivityIndicator, Image, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons, MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Email, EmailWithSummary } from '../../../types/email';
import { summarizeEmails } from '@/utils/emailSummarizer';
import { generateAutoReply } from '@/utils/emailAutoReply';
import { useRouter } from 'expo-router';
import { decode } from 'html-entities';
import { useTokens } from '@/app/context/TokenContext';
import { LinearGradient } from 'expo-linear-gradient';
import AIInputBox from '@/components/AIInputBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';

export default function EmailScreen() {
  const screenHorizontalPadding = 16;
  const shellHorizontalPadding = 8;
  const batchSelectorWidth = 32;
  const batchGap = 8;
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { getAccessToken, isLoading: isTokenLoading, hasTokens } = useTokens();
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const aiInputSpacer = floatingTabBarInset + 74;
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSummarized, setIsSummarized] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const searchBoxHeight = useRef(new Animated.Value(0)).current;
  const searchBoxOpacity = useRef(new Animated.Value(0)).current;


  const router = useRouter();

  const decodeHtmlEntities = (text: string): string => {
    return decode(text);
  };



  const getEmailBody = (payload: any): { content: string; mimeType: string; inlineImages: { [key: string]: string } } => {
    let content = '';
    let mimeType = 'text/plain';
    const inlineImages: { [key: string]: string } = {};

    if (payload.body && payload.body.data) {
      content = decodeURIComponent(escape(atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))));
      mimeType = payload.mimeType || mimeType;
    } else if (payload.parts && Array.isArray(payload.parts)) {
      for (let part of payload.parts) {
        if ((part.mimeType === 'text/html' || part.mimeType === 'text/plain') && part.body && part.body.data) {
          content = decodeURIComponent(escape(atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))));
          mimeType = part.mimeType || mimeType;
        } else if (part.mimeType && part.mimeType.startsWith('image/') && part.body && part.body.data) {
          const contentId = part.headers.find((header: any) => header.name === 'Content-ID')?.value;
          if (contentId) {
            const cid = contentId.replace(/[<>]/g, '');
            inlineImages[cid] = `data:${part.mimeType};base64,${part.body.data}`;
          }
        }
      }
    }

    return { content, mimeType, inlineImages };
  };

  const fetchEmails = useCallback(async () => {
    setIsLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        Alert.alert("Authentication Error", "Please reconnect your Google account.");
        return;
      }

      const response = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch emails');
      }

      const data = await response.json();
      // console.log('Fetched messages:', data.messages.length);

      const emailPromises = data.messages.map(async (message: { id: string }) => {
        const emailResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          console.error('Email API Error:', errorData);
          throw new Error(`Failed to fetch email details: ${emailResponse.status} ${emailResponse.statusText}`);
        }

        const emailData = await emailResponse.json();
        const headers = emailData.payload.headers;
        const getHeader = (name: string) => headers.find((header: { name: string; value: string }) => header.name.toLowerCase() === name.toLowerCase())?.value;
        const { content, mimeType } = getEmailBody(emailData.payload);
        return {
          id: emailData.id,
          subject: getHeader('Subject') || 'No Subject',
          from: getHeader('From') || 'Unknown Sender',
          snippet: emailData.snippet,
          body: content,
          mimeType: mimeType,
          date: getHeader('Date') || null,
        };
      });

      const fetchedEmails = await Promise.all(emailPromises);
      // console.log('Fetched emails:', fetchedEmails.length);
      const summarizedEmails = await summarizeEmails(fetchedEmails);
      // console.log('Summarized emails:', summarizedEmails);
      const filteredEmails = summarizedEmails.filter((email, index) => {
        if (email.from.includes('michaelc.limelight')) {
          // Skip the first (most recent) email from michaelc.limelight
          return index !== summarizedEmails.findIndex(e => e.from.includes('michaelc.limelight'));
        }
        return true;
      });
      setEmails(filteredEmails);
    } catch (error) {
      console.error('Error fetching emails:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);


  const selectAllEmails = () => {
    setSelectedEmails(emails.map(email => email.id));
  };

  const deselectAllEmails = () => {
    setSelectedEmails([]);
  };

  useFocusEffect(
    useCallback(() => {
      if (!isTokenLoading && hasTokens) {
        fetchEmails();
      }
    }, [isTokenLoading, hasTokens, fetchEmails])
  );


  const handleAutoReply = async (email: EmailWithSummary) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      Alert.alert("Authentication Error", "Please reconnect your Google account.");
      return;
    }
    try {
      setIsProcessing(true);
      const response = await generateAutoReply(email);
      router.push({
        pathname: 'email/draft',
        params: {
          email: JSON.stringify(email),
          replyDraft: response.replyDraft,
          actionItems: JSON.stringify(response.actionItems),
          accessToken
        }
      });
    } catch (error: any) {
      console.error('Error generating auto reply:', error);
      const message = getFriendlyAiErrorMessage(error);
      Alert.alert("AI Reply Failed", message);
    }
    finally {
      setIsProcessing(false);
    }
  };

  const ReplyButton = ({ onPress, email }: { onPress: (email: EmailWithSummary) => Promise<void>, email: EmailWithSummary }) => {
    return (
      <TouchableOpacity
        onPress={() => onPress(email)}
        disabled={isProcessing}
        style={{
          backgroundColor: '#E63D3D',
          borderRadius: 999,
          paddingHorizontal: 15,
          paddingVertical: 2,
        }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>Reply</Text>
      </TouchableOpacity>
    );
  };

  const toggleEmailSelection = (emailId: string) => {
    setSelectedEmails(prev =>
      prev.includes(emailId) ? prev.filter(id => id !== emailId) : [...prev, emailId]
    );
  };

  // Search animation to make box appear
  const toggleSearch = () => {
    setIsSearching(!isSearching);
    Animated.parallel([
      Animated.timing(searchBoxHeight, {
        toValue: isSearching ? 0 : 50,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(searchBoxOpacity, {
        toValue: isSearching ? 0 : 1,
        duration: 300,
        useNativeDriver: false,
      })
    ]).start();
  };

  // Filtered emails after searching
  const filteredEmails = emails.filter(email => {
    const searchLower = searchQuery.toLowerCase();
    return email.subject.toLowerCase().includes(searchLower) ||
      email.snippet.toLowerCase().includes(searchLower) ||
      email.from.toLowerCase().includes(searchLower);
  });


  const handleBatchAutoReply = async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      Alert.alert("Authentication Error", "Please reconnect your Google account.");
      return;
    }
    const selectedEmailsData = emails.filter(email => selectedEmails.includes(email.id));
    try {
      setIsProcessing(true);
      const replyDrafts = await Promise.all(selectedEmailsData.map(email => generateAutoReply(email)));
      router.push({
        pathname: 'email/batchDraft',
        params: { emails: JSON.stringify(selectedEmailsData), replyDrafts: JSON.stringify(replyDrafts), accessToken }
      });
    } catch (error: any) {
      console.error('Error generating batch auto replies:', error);
      const message = getFriendlyAiErrorMessage(error);
      Alert.alert("Batch AI Reply Failed", message);
    }
    finally {
      setIsProcessing(false);
    }
  };

  const getFriendlyAiErrorMessage = (error: any): string => {
    const raw = (error && (error.message || error.error || error.toString())) || '';
    const text = (typeof raw === 'string' ? raw : JSON.stringify(raw)).toLowerCase();
    if (text.includes('insufficient') && text.includes('quota')) return 'Quota exceeded. Please try again later.';
    if (text.includes('quota')) return 'Quota exceeded. Please try again later.';
    if (text.includes('429') || text.includes('rate limit')) return 'Rate limited by AI provider. Try again shortly.';
    if (text.includes('api key') || text.includes('authentication') || text.includes('unauthorized') || text.includes('invalid api')) return 'AI API key issue. Check configuration and try again.';
    if (text.includes('network') || text.includes('timeout')) return 'Network error while contacting AI. Check your connection and retry.';
    if (text.includes('invalid response')) return 'AI returned an unexpected response. Please try again.';
    return 'Something went wrong while generating the AI reply.';
  };

  const renderEmailItem = ({ item }: { item: EmailWithSummary }) => {
    const windowSize = Dimensions.get('window');
    const batchReserve = isBatchMode ? batchSelectorWidth + batchGap : 0;
    const availableWidth =
      windowSize.width - screenHorizontalPadding * 2 - shellHorizontalPadding * 2 - batchReserve;
    const cardWidth = isBatchMode ? Math.min(292, availableWidth) : availableWidth;
    const cardHeight = 106;
    const summaryPoints = item.summary?.filter((point) => point?.trim()) ?? [];
    const isExpandedSummary = isSummarized;

    const senderName = (() => {
      if (!item.from) return '';
      const match = item.from.match(/"?(.*?)"?\s*</);
      if (match && match[1]) return match[1].trim();
      const angleIndex = item.from.indexOf('<');
      if (angleIndex > 0) return item.from.slice(0, angleIndex).trim();
      return item.from;
    })();

    const senderInitial = senderName.charAt(0).toUpperCase() || '?';

    const iconImage = item.inlineImages ? Object.values(item.inlineImages)[0] : undefined;
    const previewText = isExpandedSummary
      ? (summaryPoints.length > 0
        ? summaryPoints.map((point) => `• ${point}`).join('\n')
        : 'No summary available')
      : decodeHtmlEntities(item.snippet || '').replace(/\s+/g, ' ').trim();

    const DiagonalArrows = ({ isExpanded }: { isExpanded: boolean }) => (
      <Icon
        name="arrow-expand"
        size={14}
        color="rgba(255,255,255,0.82)"
        style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
      />
    );

    return (
      <View className="flex-row items-center mb-2">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (!isBatchMode) {
              router.push({
                pathname: `/(modals)/emailView/${item.id}`,
                params: {
                  email: JSON.stringify(item)
                }
              });
            }
          }}
          className={`${isBatchMode ? 'mr-2' : 'flex-1'}`}
        >
          <LinearGradient
            colors={['#F05A5A', '#931B1A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: cardWidth,
              minHeight: cardHeight,
              height: isExpandedSummary ? undefined : cardHeight,
              borderRadius: 15,
              paddingHorizontal: 12,
              paddingTop: 9,
              paddingBottom: 9,
              alignSelf: isBatchMode ? 'flex-start' : 'center',
              overflow: 'hidden',
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 1,
                right: 1,
                bottom: 1,
                left: 1,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#FF5D6D',
              }}
            />
            <View className="flex-row items-start flex-1">
              <View
                style={{
                  width: 48,
                  marginRight: 12,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  alignSelf: 'stretch',
                }}
              >
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                >
                  {iconImage ? (
                    <Image
                      source={{ uri: iconImage }}
                      style={{ width: 48, height: 48, borderRadius: 24 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 'bold', fontSize: 18 }}>
                      {senderInitial}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    router.push({
                      pathname: `/(modals)/emailView/${item.id}`,
                      params: {
                        email: JSON.stringify(item),
                      },
                    });
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: -2,
                  }}
                >
                  <DiagonalArrows isExpanded={false} />
                </TouchableOpacity>
              </View>
              <View className="flex-1 justify-between">
                <View>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    color: 'rgba(255,255,255,0.92)',
                    fontWeight: '700',
                    fontSize: 15,
                    marginBottom: 3,
                  }}
                >
                  {senderName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' }}
                >
                  {item.subject}
                </Text>
                <Text
                  numberOfLines={isExpandedSummary ? undefined : 1}
                  ellipsizeMode={isExpandedSummary ? undefined : 'tail'}
                  style={{
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: 9.5,
                    marginTop: 2,
                    lineHeight: isExpandedSummary ? 14 : undefined,
                  }}
                >
                  {previewText}
                </Text>
                </View>
                <View className="flex-row justify-end items-center" style={{ marginTop: 2 }}>
                  {!isBatchMode && <ReplyButton onPress={handleAutoReply} email={item} />}
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        {isBatchMode && (
          <TouchableOpacity onPress={() => toggleEmailSelection(item.id)} className="self-center">
            <Ionicons
              name={selectedEmails.includes(item.id) ? "radio-button-on" : "radio-button-off"}
              size={24}
              color={selectedEmails.includes(item.id) ? "#FF5858" : "#821818"}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };


  return (
    <LinearGradient
      colors={['#E82B2B', '#821818']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 80,
          left: -30,
          right: 0,
          alignItems: 'center',
          zIndex: 0,
        }}
      >
        <Image
          source={require('../../../assets/images/email-ez-bg.png')}
          style={{
            width: 400,
            height: 570,
            opacity: 1,
          }}
          resizeMode="contain"
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -24,
          left: -12,
          right: -12,
          bottom: -24,
          zIndex: 11,
        }}
      >
        <Image
          source={require('../../../assets/images/email-bg.png')}
          style={{
            width: '100%',
            height: '100%',
            opacity: 0.07,
          }}
          resizeMode="cover"
        />
      </View>
      <SafeAreaView className="flex-1 pt-8" style={{ backgroundColor: 'transparent' }}>
        {isFocused && (
          <StatusBar
            style="light"
            backgroundColor="transparent"
            translucent
          />
        )}
        {/* {isLoading && (
          <View>
            <PulsatingLine width={600} height={4} />
          </View>
        )} */}
        <View
          className="flex-1"
          style={{
            paddingHorizontal: screenHorizontalPadding,
            paddingBottom: isBatchMode ? floatingTabBarInset : aiInputSpacer,
          }}
        >
          <View className="relative mt-4 mb-3 min-h-11 justify-center">
            <Text
              className="text-[24px] font-bold text-[#FBB0B0] text-center"
              style={{
                textShadowColor: 'rgba(0,0,0,0.25)',
                textShadowOffset: { width: 0, height: 3 },
                textShadowRadius: 8,
              }}
            >
              Emails
            </Text>
          </View>

          <View className="mb-3 flex-row items-center justify-between px-1">
            <View className="flex-row items-center">
              <Text className="mr-1 text-white/80">Summary</Text>
              <Switch
                value={isSummarized}
                onValueChange={setIsSummarized}
                trackColor={{ false: "#767577", true: "#821818" }}
                thumbColor={isSummarized ? "#ffffff" : "#f4f3f4"}
              />
              <Text className="ml-2 mr-1 text-white/80">Batch</Text>
              <Switch
                value={isBatchMode}
                onValueChange={(value) => {
                  setIsBatchMode(value);
                  setSelectedEmails([]);
                }}
                trackColor={{ false: "#767577", true: "#821818" }}
                thumbColor={isBatchMode ? "#ffffff" : "#f4f3f4"}
              />
            </View>

            <View className="flex-row items-center">
              <TouchableOpacity onPress={toggleSearch} className="mr-1 p-2">
                <Feather name="search" size={20} color="#FD8F8F" />
              </TouchableOpacity>
              <TouchableOpacity onPress={fetchEmails} className="p-2">
                <Icon name="refresh" size={20} color="#FD8F8F" />
              </TouchableOpacity>
            </View>
          </View>

          <View
            className="flex-1 overflow-hidden"
            style={{
              backgroundColor: 'rgba(86, 13, 13, 0.18)',
              borderRadius: 24,
            }}
          >
            <Animated.View style={{
              height: searchBoxHeight,
              opacity: searchBoxOpacity,
              overflow: 'hidden',
            }}>
              <View className="px-4 pt-4">
                <TextInput
                  className="bg-white p-2 rounded-lg"
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </Animated.View>

            {isBatchMode && (
              <View className="flex-row justify-end px-4 py-3">
                <TouchableOpacity
                  onPress={selectedEmails.length > 0 ? deselectAllEmails : selectAllEmails}
                >
                  <Text className="text-[#ffffff]/80 font-semibold">
                    {selectedEmails.length > 0 ? "Deselect All" : "Select All"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView
              className="flex-1"
              alwaysBounceVertical
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                flexGrow: 1,
                paddingTop: isSearching ? 10 : 14,
                paddingHorizontal: shellHorizontalPadding,
                paddingBottom: isBatchMode && selectedEmails.length > 0 ? 100 : 24,
              }}
            >
              {filteredEmails.length > 0 ? (
                filteredEmails.map((item: EmailWithSummary) => (
                  <View key={item.id} className="mb-2">
                    {renderEmailItem({ item })}
                  </View>
                ))
              ) : (
                <View className="flex-1 justify-center items-center px-6">
                  <Text className="text-lg text-white/80 text-center">
                    {isLoading ? 'Loading emails...' : 'No emails found'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>

          {isBatchMode && selectedEmails.length > 0 && (
            <View className="absolute left-0 right-0 p-4 bg-[#821818]" style={{ bottom: floatingTabBarInset - 8 }}>
              <TouchableOpacity
                onPress={handleBatchAutoReply}
                disabled={isProcessing}
                className="bg-[#E63D3D] py-3 px-6 rounded-lg items-center"
              >
                <Text className="text-white/80 font-bold text-lg">AI Reply to Selected ({selectedEmails.length})</Text>
              </TouchableOpacity>
            </View>
          )}
          {!isBatchMode && (
            <AIInputBox
              textInput=""
              isListening={false}
              microphoneColor="#F93737"
              glowAnim={new Animated.Value(0)}
              onTextInputPress={() => { }}
              onMicrophonePress={() => { }}
              minInputHeight={34}
              surfaceVariant="emailAsset"
              containerStyle={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: aiInputBottom,
                backgroundColor: 'transparent',
              }}
            />
          )}
        </View>
        {isProcessing && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="auto" className="bg-black/40 items-center justify-center">
            <View className="bg-white rounded-lg p-4 items-center">
              <ActivityIndicator size="large" color="#FF5858" />
              <Text className="mt-2 text-gray-700 font-semibold">Generating AI reply…</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}
