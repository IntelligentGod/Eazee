import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, StyleSheet, SafeAreaView, TouchableOpacity, Image, TextInput, Alert } from 'react-native';
import { Redirect, useFocusEffect, router } from 'expo-router';
import { getAuth, signOut, updateProfile } from "firebase/auth";
import { ResponseType, makeRedirectUri, exchangeCodeAsync } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import CountryPicker, { Country, CountryCode } from 'react-native-country-picker-modal';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Q } from '@nozbe/watermelondb';
import { Image as ExpoImage } from 'expo-image';
import app, { auth } from "../../../firebaseConfig";
import AccountModel from '../../../database/models/AccountModel';
import { database } from '../../../database/database';
import { getGoogleConnectionStatusStatic, useTokens } from '../../context/TokenContext';


type AmazonStatus = 'idle' | 'processing' | 'success' | 'captcha' | 'failed' | 'error';
type GoogleConnectionState = 'disconnected' | 'connected' | 'needsReconnect';

const Account = () => {

    const user = auth.currentUser;
    const { setTokens } = useTokens();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [amazonUsername, setAmazonUsername] = useState<string>('');
    const [amazonPassword, setAmazonPassword] = useState<string>('');
    const [amazonStatus, setAmazonStatus] = useState<AmazonStatus>('idle');

    const [captchaUrl, setCaptchaUrl] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [captchaInput, setCaptchaInput] = useState<string>('');

    const [isAmazonConnected, setIsAmazonConnected] = useState<boolean>(false);
    const [googleConnectionState, setGoogleConnectionState] = useState<GoogleConnectionState>('disconnected');


    const [request, response, promptAsync] = Google.useAuthRequest({
        androidClientId: '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com',
        iosClientId: '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/calendar'],
        responseType: ResponseType.Code,
        redirectUri: makeRedirectUri({
            scheme: 'com.wave.app',
            path: 'home/account',
        }),
        extraParams: {
            access_type: 'offline',
            prompt: 'consent',
        },
    });

    const checkGoogleConnection = useCallback(async () => {
        const status = await getGoogleConnectionStatusStatic();
        if (status.isActive) {
            setGoogleConnectionState('connected');
            return;
        }

        setGoogleConnectionState(status.isConnected ? 'needsReconnect' : 'disconnected');
    }, []);

    useEffect(() => {
        checkGoogleConnection();
    }, [checkGoogleConnection]);

    useEffect(() => {
        if (response?.type !== 'success') {
            return;
        }

        let isMounted = true;

        const finishGoogleConnection = async () => {
            try {
                const code = response.params.code;

                if (!code || !request?.clientId || !request.redirectUri || !request.codeVerifier) {
                    Alert.alert('Google connection failed', 'The Google sign-in response was incomplete. Please try again.');
                    return;
                }

                const tokenResult = await exchangeCodeAsync(
                    {
                        code,
                        clientId: request.clientId,
                        redirectUri: request.redirectUri,
                        extraParams: {
                            code_verifier: request.codeVerifier,
                        },
                    },
                    { tokenEndpoint: 'https://oauth2.googleapis.com/token' }
                );

                if (!tokenResult.refreshToken || !tokenResult.accessToken) {
                    Alert.alert('Google connection failed', 'Google did not return the required account tokens. Please try again.');
                    return;
                }

                await setTokens(tokenResult.accessToken, tokenResult.refreshToken);

                if (!isMounted) {
                    return;
                }

                setGoogleConnectionState('connected');
                Alert.alert('Successfully connected to Google account');
            } catch (error) {
                console.error('Error connecting Google account:', error);
                if (isMounted) {
                    Alert.alert('Google connection failed', 'There was a problem finishing Google sign-in. Please try again.');
                }
            }
        };

        void finishGoogleConnection();

        return () => {
            isMounted = false;
        };
    }, [request, response, setTokens]);

    const handleGoogleConnect = async () => {
        try {
            if (!request) {
                Alert.alert('Google sign-in unavailable', 'The Google sign-in request is still loading. Please try again in a moment.');
                return;
            }

            await promptAsync();
        } catch (error) {
            console.error('Error connecting Google account:', error);
            Alert.alert('Google connection failed', 'There was a problem starting Google sign-in. Please try again.');
        }
    };

    const handleBack = () => {
        router.back();
    };

    useFocusEffect(
        useCallback(() => {
            const checkAmazonIntegration = async () => {
                await checkGoogleConnection();
                // console.log("Checking Amazon integration");
                if (user) {
                    // console.log("User exists:", user.uid);
                    try {
                        const accountsCollection = database.get<AccountModel>('accounts');
                        // console.log("Accounts collection retrieved");

                        const existingAccount = await accountsCollection.query(
                            Q.where('user_id', user.uid),
                            Q.where('integration_successful', true)
                        ).fetch();

                        // console.log("Existing account query results:", existingAccount);
                        //setIsAmazonConnected(existingAccount.length > 0);
                        setIsAmazonConnected(false);

                        // console.log("Amazon connected status set to:", existingAccount.length > 0);
                    } catch (error) {
                        console.error("Error checking Amazon integration:", error);
                    }
                } else {
                    // console.log("No user found");
                }
            };

            checkAmazonIntegration();
        }, [checkGoogleConnection, user])
    );

    useEffect(() => {
        const user = auth.currentUser;
        if (user) {
            setUserEmail(user.email);
            setUserName(user.displayName);
        }
    }, []);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            setUserEmail(currentUser.email);
            setUserName(currentUser.displayName);
        }
    }, []);

    const handleAmazonConnect = async (): Promise<void> => {
        setAmazonStatus('processing');
        try {
            const response = await fetch('https://170.64.200.117.nip.io/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    identifier: amazonUsername,
                    password: amazonPassword,
                }),
            });

            const responseText = await response.text();
            // console.log('Raw response:', responseText);
            // console.log({ response })

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Error parsing JSON:', parseError);
                setAmazonStatus('error');
                return;
            }
            // console.log({ data })


            if (data.captcha_required) {
                setAmazonStatus('captcha');
                setCaptchaUrl(data.captcha_image);
                setSessionId(data.session_id);
            } else if (data.message === "Login successful") {
                await saveAmazonAccount(data.session_id);
                setAmazonStatus('success');
            } else {
                setAmazonStatus('failed');
            }
        } catch (error) {
            console.error('Error connecting to Amazon:', error);
            setAmazonStatus('error');
        }
    };

    const handleContinueSession = async (): Promise<void> => {
        if (!sessionId || !captchaInput) return;

        setAmazonStatus('processing');
        try {
            const response = await fetch('https://170.64.200.117.nip.io/continue_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    captcha_solution: captchaInput,
                }),
            });

            // console.log({captchaInput, sessionId})

            const data = await response.json();
            // console.log({data})

            if (data.success) {
                await saveAmazonAccount(sessionId);
                setAmazonStatus('success');
            } else {
                setAmazonStatus('failed');
            }
        } catch (error) {
            console.error('Error continuing session:', error);
            setAmazonStatus('error');
        }
    };


    const saveAmazonAccount = async (sessionId: string) => {
        try {
            const accountsCollection = database.get<AccountModel>('accounts');

            if (!accountsCollection) {
                console.error('Accounts collection is null');
                return;
            }

            await database.write(async () => {
                await accountsCollection.create((account) => {
                    account.userId = user?.uid || '';
                    account.amazonUsername = amazonUsername;
                    account.amazonSessionId = sessionId;
                    account.amazonEmail = userEmail || '';
                    account.integrationSuccessful = true;
                });
            });

            // console.log('Amazon account saved successfully');
            setIsAmazonConnected(true);
        } catch (error) {
            console.error('Error saving Amazon account:', error);
            if (error instanceof Error) {
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }
        }
    };

    const handleLogout = async () => {
        const auth = getAuth(app);
        try {
            await signOut(auth);
            router.replace('/home/login');
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    };

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                setUserEmail(user.email);
                setUserName(user.displayName);
            } else {
                // Redirect to login if no user is found
                router.replace('/home/login');
            }
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    const [country, setCountry] = useState<Country | null>(null)
    const [countryCode, setCountryCode] = useState<CountryCode>('US')
    const [countryPickerVisible, setCountryPickerVisible] = useState(false)

    useEffect(() => {
        const loadUserCountry = async () => {
            const user = auth.currentUser;
            // console.log("user country:", user?.photoURL);
            if (user && user.photoURL) {
                try {
                    const savedCountry = JSON.parse(user.photoURL);
                    setCountry(savedCountry);
                    setCountryCode(savedCountry.cca2);
                } catch (error) {
                    console.error("Error parsing saved country:", error);
                }
            }
        };

        loadUserCountry();
    }, []);


    const onSelectCountry = async (selectedCountry: Country) => {
        setCountry(selectedCountry)
        setCountryCode(selectedCountry.cca2)
        setCountryPickerVisible(false)

        const user = auth.currentUser;
        if (user) {
            try {
                await updateProfile(user, {
                    photoURL: JSON.stringify(selectedCountry)
                });
                // console.log("Country saved successfully");
            } catch (error) {
                console.error("Error saving country:", error);
            }
        }
    }

    if (!user) {
        return <Redirect href="/home/login" />
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Icon name="chevron-left" size={28} color="#22AB93" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Manage Account</Text>
            </View>
            <View style={styles.profileSection}>
                <Icon name="account-circle" size={60} color="#22AB93" style={styles.profileImage} />
                <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{userName || 'Name'}</Text>
                    <Text style={styles.profileEmail}>{userEmail || 'Loading...'}</Text>
                </View>
                {/* <TouchableOpacity style={styles.editButton}>
                    <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity> */}
            </View>
            <View style={styles.content}>
                <View style={styles.countrySection}>
                    <View style={styles.countryDisplay}>
                        <Text style={styles.countryName}>
                            {country ? (typeof country.name === 'string' ? country.name : 'Unknown Country') : 'Select Country'}
                        </Text>
                        <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => setCountryPickerVisible(true)}
                        >
                            <Text style={styles.editButtonText}>Edit</Text>
                        </TouchableOpacity>
                    </View>
                    {countryPickerVisible && (
                        <CountryPicker
                            visible={countryPickerVisible}
                            onClose={() => setCountryPickerVisible(false)}
                            onSelect={onSelectCountry}
                            countryCode={countryCode}
                            withFlag
                            withFilter
                            withCountryNameButton
                        />
                    )}
                </View>
                {/* <View style={styles.amazonSection}>
                    <View style={styles.amazonHeader}>
                        <Image
                            source={require('../../../assets/amazon-logo.jpg')}
                            style={styles.amazonLogo}
                        />
                        <Text style={styles.amazonTitle}>
                            {isAmazonConnected ? 'Amazon Account' : 'Connect Amazon Account'}
                        </Text>
                        {isAmazonConnected && (
                            <Icon name="check-circle" size={24} color="#22AB93" style={styles.checkIcon} />
                        )}
                    </View>
                    {isAmazonConnected ? (
                        <Text style={styles.connectedText}>Connected</Text>
                    ) : (
                        <>
                            <TextInput
                                style={styles.input}
                                placeholder="Amazon Username"
                                value={amazonUsername}
                                onChangeText={setAmazonUsername}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Amazon Password"
                                value={amazonPassword}
                                onChangeText={setAmazonPassword}
                                secureTextEntry
                            />
                            <TouchableOpacity
                                style={styles.connectButton}
                                onPress={handleAmazonConnect}
                            >
                                <Text style={styles.connectButtonText}>Connect</Text>
                            </TouchableOpacity>
                            {amazonStatus !== 'idle' && (
                                <Text style={styles.statusText}>{getStatusMessage(amazonStatus)}</Text>
                            )}
                            {amazonStatus === 'captcha' && (
                                <>
                                    {captchaUrl && (
                                        <ExpoImage
                                            source={{ uri: captchaUrl }}
                                            style={styles.captchaImage}
                                            contentFit="contain"
                                        />
                                    )}
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter Captcha"
                                        value={captchaInput}
                                        onChangeText={setCaptchaInput}
                                    />
                                    <TouchableOpacity
                                        style={styles.connectButton}
                                        onPress={handleContinueSession}
                                    >
                                        <Text style={styles.connectButtonText}>Submit Captcha</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </>
                    )}
                </View> */}

                <View style={styles.googleSection}>
                    <View style={styles.googleHeader}>
                        <Image
                            source={require('../../../assets/google-logo.png')}
                            style={styles.googleLogo}
                        />
                        <Text style={styles.googleTitle}>
                            {googleConnectionState === 'disconnected' ? 'Connect Google Account' : 'Google Account'}
                        </Text>
                        {googleConnectionState === 'connected' && (
                            <Icon name="check-circle" size={24} color="#22AB93" style={styles.checkIcon} />
                        )}
                    </View>
                    {googleConnectionState === 'connected' ? (
                        <View style={styles.connectedContainer}>
                            <Text style={styles.connectedText}>Connected</Text>
                            <TouchableOpacity onPress={handleGoogleConnect}>
                                <Text style={styles.reconnectText}>Reconnect</Text>
                            </TouchableOpacity>
                        </View>
                    ) : googleConnectionState === 'needsReconnect' ? (
                        <View style={styles.connectedContainer}>
                            <Text style={styles.reconnectNeededText}>Reconnect required</Text>
                            <TouchableOpacity onPress={handleGoogleConnect}>
                                <Text style={styles.reconnectText}>Reconnect</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.connectButton}
                            onPress={handleGoogleConnect}
                        >
                            <Text style={styles.connectButtonText}>Connect Google Account</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    style={[styles.accountItem, styles.logoutButton]}
                    onPress={handleLogout}
                >
                    <Icon name="logout" size={24} color="#22AB93" style={styles.icon} />
                    <Text style={[styles.accountText, styles.logoutText]}>Log Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const getStatusMessage = (status: AmazonStatus): string => {
    switch (status) {
        case 'processing':
            return 'Processing...';
        case 'success':
            return 'Integration successful!';
        case 'captcha':
            return 'Captcha required. Please try again.';
        case 'failed':
            return 'Integration failed. Please try again.';
        case 'error':
            return 'Error occurred. Please try again.';
        default:
            return '';
    }
};


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#E9ECEB',
        paddingTop: 40,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    backButton: {
        marginRight: 16,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000',
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#E9ECEB',
        marginBottom: 0,
    },
    profileImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    profileInfo: {
        flex: 1,
        marginLeft: 16,
    },
    profileName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000',
    },
    profileEmail: {
        marginTop: 4,
        fontSize: 14,
        color: '#666',
    },
    editButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
        backgroundColor: '#22AB93',
    },
    editButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    content: {
        paddingHorizontal: 25,
    },
    accountItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    icon: {
        marginRight: 8,
    },
    accountText: {
        flex: 1,
        fontSize: 16,
        color: '#000',
    },
    chevron: {
        marginLeft: 'auto',
    },
    logoutButton: {
        marginTop: 5,
        borderBottomWidth: 0,
    },
    logoutText: {
        color: '#000',
    },
    // amazon
    amazonSection: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 10,
        marginBottom: 20,
    },
    amazonHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    amazonLogo: {
        width: 24,
        height: 24,
        marginRight: 8,
        marginTop: 5,
    },
    amazonTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        padding: 10,
        marginBottom: 10,
    },
    connectButton: {
        backgroundColor: '#22AB93',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
        marginTop: 10,
    },
    connectButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    statusText: {
        marginTop: 10,
        textAlign: 'center',
        color: '#22AB93',
    },
    captchaImage: {
        width: '100%',
        height: 100,
        resizeMode: 'contain',
        marginBottom: 10,
    },
    checkIcon: {
        marginLeft: 'auto',
    },
    connectedText: {
        fontSize: 16,
        color: '#22AB93',
        textAlign: 'center',
        marginTop: 10,
    },
    // google
    googleSection: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 10,
        marginBottom: 20,
    },
    googleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    googleLogo: {
        width: 24,
        height: 24,
        marginRight: 8,
    },
    googleTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    connectedContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
    },
    reconnectText: {
        color: '#22AB93',
        fontSize: 16,
        textDecorationLine: 'underline',
    },
    reconnectNeededText: {
        fontSize: 16,
        color: '#B26A00',
        textAlign: 'center',
        marginTop: 10,
    },
    // country picker
    countrySection: {
        marginBottom: 20,
    },
    countryDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0F0F0',
        borderRadius: 5,
        padding: 10,
    },
    countryFlag: {
        width: 30,
        height: 20,
        marginRight: 10,
    },
    countryName: {
        flex: 1,
        fontSize: 16,
        color: '#333',
    },
});

export default Account
