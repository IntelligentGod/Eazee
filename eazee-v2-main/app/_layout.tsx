import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { TabProvider } from './context/TabContext';
import * as NavigationBar from 'expo-navigation-bar';
import { Platform } from 'react-native';
import { configureTodoNotifications, syncAllTodoReminders } from '@/lib/todoNotifications';
import * as WebBrowser from 'expo-web-browser';
import { TokenProvider } from './context/TokenContext';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    // Set navigation bar color for Android
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
  }, []);

  useEffect(() => {
    configureTodoNotifications().catch((error) => {
      console.error('Error configuring todo notifications:', error);
    });
    syncAllTodoReminders().catch((error) => {
      console.error('Error syncing todo reminders:', error);
    });
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" backgroundColor="transparent" />
      <TokenProvider>
        <TabProvider>
          <Stack>
            <Stack.Screen
              name="(tabs)"
              options={{
                headerShown: false
              }}
            />
            <Stack.Screen
              name="(modals)/emailView/[id]"
              options={{
                headerShown: false,
                presentation: 'modal',
                animation: 'slide_from_bottom'
              }}
            />
          </Stack>
        </TabProvider>
      </TokenProvider>
    </GestureHandlerRootView>
  )
}
