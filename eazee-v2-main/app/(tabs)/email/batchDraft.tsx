import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useDraft } from './DraftContext';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { database } from '../../../database/database';
import EmailModel from '@/database/models/EmailModel';
import { createTodo } from '@/lib/todoMutations';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';


interface BatchDraftParams {
    emails: string;
    replyDrafts: string;
    accessToken: string;
    editedContent?: string;
    emailId: string;
    [key: string]: any;
}

interface Email {
    id: string;
    subject: string;
    from: string;
    body: string;
}

interface ReplyDraft {
    replyDraft: string;
    actionItems: any;
}

export default function BatchDraft() {
    const router = useRouter();
    const params = useLocalSearchParams<BatchDraftParams>();
    const { emails, replyDrafts, accessToken } = params;
    const { editedContent, emailId, clearDraft } = useDraft();
    const insets = useSafeAreaInsets();
    const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);

    const [expandedDrafts, setExpandedDrafts] = useState<string[]>([]);

    const [parsedEmails, setParsedEmails] = useState<Email[]>([]);
    const [parsedReplyDrafts, setParsedReplyDrafts] = useState<(string | ReplyDraft)[]>([]);

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedTodos, setSelectedTodos] = useState<boolean[]>([]);
    const [isSending, setIsSending] = useState(false);

    const toggleExpand = (id: string) => {
        setExpandedDrafts(prev =>
            prev.includes(id) ? prev.filter(draftId => draftId !== id) : [...prev, id]
        );
    };

    const handleEdit = (email: Email, replyDraft: string | { replyDraft: string; actionItems: any }) => {
        router.push({
            pathname: '/email/draft',
            params: {
                email: JSON.stringify(email),
                replyDraft: typeof replyDraft === 'object' ? replyDraft.replyDraft : replyDraft,
                actionItems: typeof replyDraft === 'object' ? JSON.stringify(replyDraft.actionItems) : undefined,
                accessToken,
                batchEdit: 'true'
            }
        });
    };

    const handleCreateTodos = () => {
        const allTodos = parsedReplyDrafts.reduce((acc: boolean[], draft) => {
            if (typeof draft === 'object' && draft.actionItems) {
                return [...acc, ...new Array(draft.actionItems.length).fill(false)];
            }
            return acc;
        }, []);
        setSelectedTodos(allTodos);
        setIsModalVisible(true);
    };

    const handleConfirmTodos = () => {
        setIsModalVisible(false);
    };

    useEffect(() => {
        setParsedEmails(JSON.parse(emails ?? '[]'));
        setParsedReplyDrafts(JSON.parse(replyDrafts ?? '[]'));
    }, [emails, replyDrafts]);

    useEffect(() => {
        if (editedContent && emailId) {
            setParsedReplyDrafts(prevDrafts => {
                const updatedDrafts = [...prevDrafts];
                const index = parsedEmails.findIndex(email => email.id === emailId);
                if (index !== -1) {
                    updatedDrafts[index] = editedContent;
                }
                return updatedDrafts;
            });
            clearDraft();
        }
    }, [editedContent, emailId, parsedEmails, clearDraft]);


    const handleSendAll = async () => {
        try {
            setIsSending(true);
            if (!accessToken) {
                throw new Error('No access token found');
            }

            // Send all emails first
            for (let i = 0; i < parsedEmails.length; i++) {
                const email = parsedEmails[i];
                const replyDraft = parsedReplyDrafts[i];

                const replyContent = typeof replyDraft === 'object' ? replyDraft.replyDraft : replyDraft;

                const emailContent = [
                    `From: me`,
                    `To: ${email.from}`,
                    `Subject: Re: ${email.subject}`,
                    '',
                    replyContent
                ].join('\r\n');

                const encoder = new TextEncoder();
                const bytes = encoder.encode(emailContent);
                const encodedMessage = btoa(String.fromCharCode(...bytes))
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
                            raw: encodedMessage
                        }),
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Failed to send email: ${errorData.error.message}`);
                }
            }

            // Create todos after emails are sent successfully
            const emailCollection = database.collections.get<EmailModel>('emails');

            let todoIndex = 0;
            for (let emailIndex = 0; emailIndex < parsedEmails.length; emailIndex++) {
                const email = parsedEmails[emailIndex];
                const draft = parsedReplyDrafts[emailIndex];

                if (typeof draft === 'object' && draft.actionItems) {
                    let emailRecord!: EmailModel;
                    await database.write(async () => {
                        emailRecord = await emailCollection.create((record: EmailModel) => {
                            record.from = email.from;
                            record.subject = email.subject;
                            record.snippet = '';
                            record.body = email.body || '';
                            record.gmailId = email.id;
                            record.emailDate = new Date();
                        });
                    });

                    for (let itemIndex = 0; itemIndex < draft.actionItems.length; itemIndex++) {
                        if (selectedTodos[todoIndex]) {
                            await createTodo({
                                text: draft.actionItems[itemIndex].description.trim(),
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
                        todoIndex++;
                    }
                }
            }

            Alert.alert('Success', 'All emails sent and tasks created successfully');
            router.back();
        } catch (error) {
            console.error('Error sending emails:', error);
            Alert.alert('Error', 'Failed to send emails. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const handleBackPress = async () => {
        router.replace('/email/');
    }

    return (
        <LinearGradient
            colors={['#E82B2B', '#821818']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ flex: 1 }}
        >
            <SafeAreaView
                edges={['top']}
                className="flex-1"
                style={{ backgroundColor: 'transparent', paddingBottom: floatingTabBarInset }}
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
                <TouchableOpacity className='px-2' onPress={handleBackPress}>
                    <MIcon name="chevron-left" size={24} color="#FD8F8F" />
                </TouchableOpacity>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 24 }}
            >
                <Text className="text-2xl font-bold mb-4" style={{ color: '#FD8F8F' }}>Batch Auto Replies</Text>
                {parsedEmails.map((email, index) => (
                    <View key={email.id} className="rounded-lg shadow-md mb-4 p-4" style={{ backgroundColor: '#FF5858' }}>
                        <View className="mb-2">
                            <Text className="font-bold" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{email.subject}</Text>
                        </View>
                        <Text className="mb-2" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{email.from}</Text>
                        <Text numberOfLines={expandedDrafts.includes(email.id) ? undefined : 4} style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            {typeof parsedReplyDrafts[index] === 'object' 
                                ? parsedReplyDrafts[index].replyDraft 
                                : parsedReplyDrafts[index]}
                        </Text>
                        <View className="flex-row justify-between items-center mt-2">
                            <View className="flex-1" />
                            <View className="flex-1 items-center">
                                <TouchableOpacity onPress={() => toggleExpand(email.id)}>
                                    <Ionicons
                                        name={expandedDrafts.includes(email.id) ? "chevron-up" : "chevron-down"}
                                        size={24}
                                        color="#E63D3D"
                                    />
                                </TouchableOpacity>
                            </View>
                            <View className="flex-1 items-end">
                                <TouchableOpacity onPress={() => handleEdit(email, parsedReplyDrafts[index])}>
                                    <Text className="font-semibold" style={{ color: '#E63D3D' }}>Edit</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ))}
            </ScrollView>
            <View className="p-4 flex-row justify-between space-x-4" style={{ backgroundColor: '#FF5858' }}>
                <TouchableOpacity
                    onPress={handleCreateTodos}
                    className="flex-1 py-2.5 px-6 rounded-lg items-center"
                    style={{ backgroundColor: '#E63D3D' }}
                    disabled={isSending}
                >
                    <Text className="text-white font-bold text-base">Create Tasks</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={handleSendAll}
                    disabled={isSending}
                    className="flex-1 py-2.5 px-6 rounded-lg items-center flex-row justify-center"
                    style={{ backgroundColor: '#E63D3D' }}
                >
                    {isSending ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-base">Send All</Text>
                    )}
                </TouchableOpacity>
            </View>

            {isModalVisible && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'white',
                    zIndex: 9999,
                }}>
                    <SafeAreaView style={{ flex: 1 }}>
                        <View className="p-4">
                            <Text className="text-2xl font-bold mb-4">Select Tasks to Create</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    const totalTodos = parsedReplyDrafts.reduce((count, draft) => {
                                        if (typeof draft === 'object' && draft.actionItems) {
                                            return count + draft.actionItems.length;
                                        }
                                        return count;
                                    }, 0);
                                    setSelectedTodos(new Array(totalTodos).fill(true));
                                }}
                                className="bg-[#22AB93] py-2 px-4 rounded-lg self-start mb-4"
                            >
                                <Text className="text-white font-medium">Select All</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView className="flex-1 px-4">
                            {parsedReplyDrafts.map((draft, emailIndex) => {
                                if (typeof draft === 'object' && draft.actionItems && Array.isArray(draft.actionItems)) {
                                    return draft.actionItems.map((item: { description: string }, itemIndex: number) => {
                                        const globalIndex = parsedReplyDrafts.slice(0, emailIndex)
                                            .reduce((count, d) => 
                                                count + (typeof d === 'object' && d.actionItems ? d.actionItems.length : 0), 0) + itemIndex;
                                        
                                        return (
                                            <View key={`${emailIndex}-${itemIndex}`} className="flex-row items-center mb-4">
                                                <TouchableOpacity
                                                    className={`w-6 h-6 border-2 border-gray-400 rounded mr-3 items-center justify-center ${
                                                        selectedTodos[globalIndex] ? 'bg-[#22AB93] border-[#22AB93]' : 'bg-white'
                                                    }`}
                                                    onPress={() => {
                                                        setSelectedTodos(prev => {
                                                            const newSelected = [...prev];
                                                            newSelected[globalIndex] = !newSelected[globalIndex];
                                                            return newSelected;
                                                        });
                                                    }}
                                                >
                                                    {selectedTodos[globalIndex] && (
                                                        <MIcon name="check" size={18} color="white" />
                                                    )}
                                                </TouchableOpacity>
                                                <Text className="text-gray-700 flex-1 text-base">{item.description}</Text>
                                            </View>
                                        );
                                    });
                                }
                                return null;
                            })}
                        </ScrollView>

                        <View className="p-4 flex-row justify-end space-x-4 border-t border-gray-200">
                            <TouchableOpacity
                                onPress={() => setIsModalVisible(false)}
                                className="bg-gray-200 py-3 px-6 rounded-lg"
                            >
                                <Text className="text-base font-medium">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleConfirmTodos}
                                className="bg-[#22AB93] py-3 px-6 rounded-lg"
                            >
                                <Text className="text-white text-base font-medium">Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            )}
            </SafeAreaView>
        </LinearGradient>
    );
}
