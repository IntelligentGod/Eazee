import React from 'react';
import { Stack } from 'expo-router';

export default function NoteLayoutDisabled() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
