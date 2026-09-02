import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, Platform, Alert } from 'react-native';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import app from "../../../firebaseConfig";
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

export default function LoginScreen() {
  const isFocused = useIsFocused();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const auth = getAuth(app);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        router.replace('/home');
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const handleForgotPassword = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, username.trim());
      Alert.alert('Success', 'Password reset email sent. Please check your inbox.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error instanceof Error ? error.message : 'An unknown error occurred');
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, username.trim(), password);
      router.replace('/home/account');
    } catch (error: any) {
      Alert.alert("Login Failed", error.message);
    }
  };

  return (
      <SafeAreaView className="flex-1 bg-[#E9ECEB]">
        {isFocused && <StatusBar backgroundColor="#E9ECEB" style="dark" />}
        <View className={`flex-1 justify-start p-4 ${Platform.OS === 'android' ? 'pt-4' : ''}`}>
          <View className="flex-row items-center mb-5">
            <MaterialCommunityIcons name="login-variant" size={24} color="#22AB93" />
            <Text className="text-2xl font-semibold ml-2 text-black">Log In</Text>
          </View>

          <Text className="mb-1 text-base text-black font-light">Email/Username:</Text>
          <TextInput
            className="h-10 border border-gray-300 mb-3 px-2 bg-white w-[85%] text-black"
            value={username}
            onChangeText={setUsername}
            autoCapitalize='none'
          />
          
          <Text className="mb-1 text-base text-black font-light">Password:</Text>
          <View className="flex-row items-center mb-3">
            <TextInput
              className="flex-1 h-10 border border-gray-300 px-2 bg-white text-black"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity className="bg-[#22AB93] rounded-full w-10 h-10 justify-center items-center ml-2" onPress={handleLogin}>
              <MaterialIcons name="arrow-forward" size={30} color="white" />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity onPress={handleForgotPassword}>
            <Text className="text-[#22AB93] text-left mt-3">Forgot password?</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => router.navigate('/home/signup')}>
            <Text className="text-[#22AB93] text-left mt-3">Create new account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
  );
}