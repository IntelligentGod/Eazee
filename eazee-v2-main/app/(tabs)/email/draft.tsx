declare module 'base-64';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Animated, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { DocumentPickerResult, DocumentPickerAsset } from 'expo-document-picker';
import { encode as base64Encode } from 'base-64';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useDraft } from './DraftContext';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { database } from '../../../database/database';
import EmailModel from '@/database/models/EmailModel';
import { createTodo } from '@/lib/todoMutations';

type DraftParams = {
  email?: string;
  replyDraft?: string;
  accessToken?: string;
  batchEdit?: string;
  actionItems?: string;
  receiver?: string;
  subject?: string;
};

interface Email {
  from?: string;
  subject?: string;
}

interface EmailObject {
  from: string;
}

const WORKSPACES = ['Goals', 'Personal', 'Wishlist'];


export default function draft() {
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<DraftParams>();

  const { email, replyDraft, accessToken, batchEdit, actionItems, receiver: receiverParam, subject: subjectParam } = params;
  const [receiver, setReceiver] = useState(receiverParam ? String(receiverParam) : '');
  const [content, setContent] = useState(replyDraft || '');
  const [attachments, setAttachments] = useState<DocumentPickerAsset[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const { updateDraft } = useDraft();
  const isBatchEdit = batchEdit === 'true';

  const boundary = "foo_bar_baz";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  const [showNotification, setShowNotification] = useState(false);

  const parsedActionItems = actionItems ? JSON.parse(actionItems) : undefined;

  const [selectedTodos, setSelectedTodos] = useState<boolean[]>([]);

  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => {
        setShowNotification(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [showNotification]);

  useEffect(() => {
    if (parsedActionItems) {
      setSelectedTodos(current =>
        current.length === 0 ? new Array(parsedActionItems.length).fill(true) : current
      );
    }
  }, [parsedActionItems]);

  const NotificationToast = () => (
    <Animated.View
      className="absolute top-4 left-0 right-0 z-50 items-center"
      style={{
        opacity: showNotification ? 1 : 0,
      }}
    >
      <View className="bg-gray-800 px-4 py-2 rounded-lg">
        <Text className="text-white text-sm font-medium">Email sent!</Text>
      </View>
    </Animated.View>
  );

  useEffect(() => {
    if (receiverParam && typeof receiverParam === 'string') {
      setReceiver(receiverParam);
      return;
    }
    let toEmail = '';
    if (typeof email === 'object' && email !== null) {
      const fromField = (email as any).from || '';
      const match = fromField.match(emailRegex);
      toEmail = match ? match[0] : '';
    } else if (typeof email === 'string') {
      const match = email.match(emailRegex);
      toEmail = match ? match[0] : '';
    }
    setReceiver(toEmail)
  }, [email, receiverParam])

  useEffect(() => {
    setIsEditing(!!replyDraft);
  }, [replyDraft]);


  const handleSaveEdit = () => {
    if (content && receiver) {
      const parsedEmail = JSON.parse(email as string);
      updateDraft(content, parsedEmail.id);
      router.back();
    } else {
      console.error("Missing content or email ID");
    }
  };


  const handleSend = async () => {
    // console.log("handle send")
    try {
      if (!accessToken) {
        throw new Error('No access token found');
      }
      // console.log("access token:", accessToken)

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      let toEmail = receiver ? String(receiver) : '';

      if (!toEmail) {
        if (typeof email === 'object' && email !== null) {
          const fromField = (email as any).from || '';
          const match = fromField.match(emailRegex);
          toEmail = match ? match[0] : '';
        } else if (typeof email === 'string') {
          const match = email.match(emailRegex);
          toEmail = match ? match[0] : '';
        }
      }

      if (!toEmail) {
        throw new Error('No recipient email address found');
      }
      // console.log("sending to", toEmail)
      setReceiver(toEmail)

      const emailData = {
        to: toEmail,
        subject: (subjectParam && String(subjectParam)) || ((email as any)?.subject ? `Re: ${(email as any)?.subject}` : 'No Subject'),
        body: content,
      };


      let emailContent = [
        `To: ${emailData.to}`,
        `Subject: ${emailData.subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        delimiter,
        '',
        emailData.body,
      ].join('\r\n');

      // console.log(emailData.to, emailData.subject, emailData.body)


      for (const attachment of attachments) {
        const fileContent = await FileSystem.readAsStringAsync(attachment.uri, { encoding: FileSystem.EncodingType.Base64 });
        emailContent += delimiter;
        emailContent += `Content-Type: ${attachment.mimeType}\r\n`;
        emailContent += `Content-Transfer-Encoding: base64\r\n`;
        emailContent += `Content-Disposition: attachment; filename="${attachment.name}"\r\n\r\n`;
        emailContent += fileContent.replace(/(.{76})/g, "$1\r\n");
        emailContent += '\r\n';
      }

      emailContent += closeDelimiter;

      const encodedMessage = base64Encode(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: encodedMessage,
          }),
        }
      );

      // console.log("email response", response)

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to send email: ${errorData.error.message}`);
      }

      if (parsedActionItems && selectedTodos.some(selected => selected)) {
        const emailCollection = database.collections.get<EmailModel>('emails');
        const parsedEmail = JSON.parse(email as string);
        console.log(parsedEmail.from, parsedEmail.subject, parsedEmail.body, parsedEmail.snippet, parsedEmail.id, parsedEmail.date)

        let emailRecord!: EmailModel;
        await database.write(async () => {
          emailRecord = await emailCollection.create((email) => {
            email.from = parsedEmail.from;
            email.subject = parsedEmail.subject;
            email.snippet = parsedEmail.snippet;
            email.body = parsedEmail.body;
            email.gmailId = parsedEmail.id;
            email.emailDate = new Date(parsedEmail.date);
          });
        });

        for (let i = 0; i < selectedTodos.length; i++) {
          if (selectedTodos[i]) {
            await createTodo({
              text: parsedActionItems[i].description.trim(),
              completed: false,
              details: '',
              dueDate: new Date(),
              hasDueTime: false,
              starred: false,
              workspace: 'Personal',
              isAmazonUrlLoaded: false,
              amazonUrlLoadAttempts: 0,
              emailId: emailRecord.id,
              type: 'basic',
            });
          }
        }
      }

      setShowNotification(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      // Alert.alert('Success', 'Email sent successfully');
      navigation.goBack();
    } catch (error) {
      console.error('Error sending email:', error);
      Alert.alert('Error', 'Failed to send email. Please try again.');
    }
  };

  const handleAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        setAttachments(prevAttachments => [...prevAttachments, ...result.assets]);
      }
    } catch (error) {
      console.error('Error picking document:', error);
    }
  };

  const renderAttachmentChips = () => {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
        {attachments.map((attachment, index) => (
          <View key={index} className="bg-white rounded-full px-4 py-2 mr-2 flex-row items-center">
            <Text className="text-xs mr-1" numberOfLines={1} ellipsizeMode="middle">
              {attachment.name.length > 15 ? `${attachment.name.slice(0, 12)}...` : attachment.name}
            </Text>
            <TouchableOpacity onPress={() => removeAttachment(index)} className="ml-1">
              <Feather name="x" size={10} color="#666" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleBackPress = async () => {
    router.back();
  }

  return (
    <LinearGradient
      colors={['#E82B2B', '#821818']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: 'transparent' }}>
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
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <TouchableOpacity className='px-2' onPress={handleBackPress}>
            <MIcon name="chevron-left" size={24} color="white" />
          </TouchableOpacity>
          {showNotification && <NotificationToast />}
          <View className="p-4">
            <View className="mb-4">
              <Text className="text-white font-bold">To: {receiver}</Text>
            </View>
            <TextInput
              className="p-2 rounded-2xl mb-4"
              multiline
              value={content}
              onChangeText={setContent}
              style={{ 
                height: 300,
                backgroundColor: '#FF5858',
                color: 'rgba(255, 255, 255, 0.9)'
              }}
              textAlignVertical="top"
            />

            {parsedActionItems && parsedActionItems.length > 0 && (
              <View className="p-4 rounded-2xl mb-4" style={{ backgroundColor: '#FF5858' }}>
                <Text className="font-bold mb-2" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Select todo items to add:</Text>
                {parsedActionItems.map((item: { description: string }, index: number) => (
                  <View key={index} className="flex-row items-center mb-2">
                    <TouchableOpacity
                      className="w-5 h-5 border rounded mr-2 items-center justify-center"
                      style={{
                        backgroundColor: selectedTodos[index] ? '#E63D3D' : 'transparent',
                        borderColor: '#E63D3D',
                        borderWidth: 1
                      }}
                      onPress={() => {
                        setSelectedTodos(prev => {
                          const newSelected = [...prev];
                          newSelected[index] = !newSelected[index];
                          return newSelected;
                        });
                      }}
                    >
                      {selectedTodos[index] && (
                        <MIcon name="check" size={16} color="white" />
                      )}
                    </TouchableOpacity>
                    <Text className="flex-1" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                      {item.description}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {attachments.length > 0 && (
              <View className="mb-4">
                {renderAttachmentChips()}
              </View>
            )}
            <View className="flex-row justify-between items-center">
              <TouchableOpacity onPress={handleAttachment} className="flex-row items-center">
                <Feather name="paperclip" size={20} color="rgba(255, 255, 255, 0.9)" />
                <Text className="ml-2" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Attach ({attachments.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={isEditing && isBatchEdit ? handleSaveEdit : handleSend}
                className="px-4 py-2 rounded-2xl"
                style={{ backgroundColor: '#E63D3D' }}
              >
                <Text className="text-white font-bold">
                  {isEditing && isBatchEdit ? "Save Edit" : "Send"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
