import React from 'react';
import { Text, View, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SettingItemProps } from '../../../types/settings'

const SettingItem: React.FC<SettingItemProps> = ({ iconName, title, onPress }) => (
  <TouchableOpacity className="flex-row items-center py-4" onPress={onPress}>
    <MaterialCommunityIcons name={iconName} size={24} color="#22AB93"/>
    <Text className="text-base font-normal text-black ml-2">{title}</Text>
  </TouchableOpacity>
);

const Settings: React.FC = () => {
  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9ECEB] pt-8">
      <View className="flex-row items-center p-4">
        <TouchableOpacity onPress={handleBack} className="mt-0.5 mr-1">
          <MaterialCommunityIcons name="chevron-left" size={28} color="#22AB93" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-black">Settings</Text>
      </View>
      <View className="px-6">
        <SettingItem
          iconName="account-circle"
          title="Manage Account"
          onPress={() => router.navigate('home/account')}
        />
        <SettingItem
          iconName="gesture-tap"
          title="Left/Right Handedness"
          onPress={() => {}}
        />
        <SettingItem
          iconName="palette"
          title="Themes"
          onPress={() => {}}
        />
      </View>
    </SafeAreaView>
  );
};

export default Settings;