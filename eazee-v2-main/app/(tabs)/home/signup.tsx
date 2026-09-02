import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useState } from 'react';
import { SafeAreaView, TextInput, Text, TouchableOpacity, StatusBar, Dimensions, Alert } from 'react-native';
import MCIcon from '@expo/vector-icons/MaterialCommunityIcons';
import app from "../../../firebaseConfig";
import { useRouter } from 'expo-router';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');

  const auth = getAuth(app);

  const handleSignUp = async () => {
    if (password !== retypePassword) {
      Alert.alert('Passwords do not match');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: username });
        // console.log('User account created & signed in!');
        router.replace('/home');
      } else {
        console.error('User creation successful, but user object is null');
      }
    } catch (error: any) {
      if (error.code === 'auth/invalid-email') {
        Alert.alert('Invalid email');
      } else if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Email already in use');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Password should be at least 6 characters');
      } else {
        Alert.alert('Error', error.message);
        console.error(error);
      }
    }
  };

  const handleSocialSignIn = (provider: string) => {
    // console.log(`Sign in with ${provider}`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <StatusBar backgroundColor="#E9ECEB" barStyle="dark-content" />
        <View style={styles.headerContainer}>
          <MCIcon name="account-plus" size={24} color="#22AB93" />
          <Text style={styles.headerText}>Sign Up</Text>
        </View>
        <Text style={styles.label}>Email:</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize='none'
          keyboardType="email-address"
        />
        <Text style={styles.label}>Username:</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize='none'
        />
        <Text style={styles.explanatoryText}>(your name which will be seen when collaborating with team members)</Text>
        <Text style={styles.label}>Password:</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Text style={styles.label}>Retype Password:</Text>
        <TextInput
          style={styles.input}
          value={retypePassword}
          onChangeText={setRetypePassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.signUpButton} onPress={handleSignUp}>
          <Text style={styles.signUpButtonText}>Sign Up</Text>
        </TouchableOpacity>
        {/* <View style={styles.socialContainer}>
          <Text style={styles.socialText}>Sign in with:</Text>
          <View style={styles.socialContentWrapper}>
            <View style={styles.socialButtonsContainer}>
              <View style={styles.socialButtonWrapper}>
                <Text style={styles.socialButtonText}>Apple</Text>
                <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialSignIn('Apple')}>
                  <MCIcon name="apple" size={32} color="black" />
                </TouchableOpacity>
              </View>
              <View style={styles.socialButtonWrapper}>
                <Text style={styles.socialButtonText}>Google</Text>
                <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialSignIn('Google')}>
                  <MCIcon name="google" size={32} color="black" />
                </TouchableOpacity>
              </View>
              <View style={styles.socialButtonWrapper}>
                <Text style={styles.socialButtonText}>Facebook</Text>
                <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialSignIn('Facebook')}>
                  <MCIcon name="facebook" size={32} color="black" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View> */}
      </View>
    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9ECEB',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'light',
    marginLeft: 10,
    color: '#000',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    height: 35,
    padding: 10,
    marginBottom: 15,
    color: '#000',
  },
  signUpButton: {
    backgroundColor: '#22AB93',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  signUpButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  explanatoryText: {
    fontSize: 12,
    color: '#666',
    marginTop: -10,
    marginBottom: 15,
    fontStyle: 'italic',
  },
  socialContainer: {
    height: 150,
    marginTop: 30,
    backgroundColor: '#F7F7F7',
    borderRadius: 10,
  },
  socialText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginTop: 15,
  },
  socialContentWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  socialButtonWrapper: {
    alignItems: 'center',
  },
  socialButtonText: {
    fontSize: 12,
    color: '#000',
    marginBottom: 5,
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 20,
  },
  socialButton: {
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 10,
  },
  toastContainer: {
    width: Dimensions.get('window').width * 0.9,
    padding: 10,
  },
  toastText: {
    color: 'black',
    fontSize: 14,
    flexShrink: 1,
  },
});