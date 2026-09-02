import { Tabs } from 'expo-router';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import React from 'react';
import { TabBarIcon } from '@/components/navigation/TabBarIcon';
import { GlassTabBarBackground } from '@/components/navigation/GlassTabBar';
import { TabBarIconMaterial } from '@/components/navigation/TaBarIconMaterial';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

const ACTIVE_BUBBLE_DURATION = 350;
const INACTIVE_BUBBLE_SCALE = 0.3;

function AnimatedTabBarButton({
  children,
  style,
  'aria-selected': ariaSelected,
  ...props
}: BottomTabBarButtonProps) {
  const focused = Boolean(ariaSelected);
  const bubbleProgress = useDerivedValue(() =>
    withTiming(focused ? 1 : 0, {
      duration: ACTIVE_BUBBLE_DURATION,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    })
  );

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleProgress.value,
    transform: [
      {
        scaleX: interpolate(bubbleProgress.value, [0, 1], [INACTIVE_BUBBLE_SCALE, 1]),
      },
      {
        scaleY: interpolate(bubbleProgress.value, [0, 1], [INACTIVE_BUBBLE_SCALE, 1]),
      },
    ],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(bubbleProgress.value, [0, 1], [0.94, 1]) }],
  }));

  return (
    <PlatformPressable
      {...props}
      aria-selected={ariaSelected}
      android_ripple={{ color: 'rgba(0,0,0,0.15)', borderless: true, radius: 0 }}
      style={[styles.tabButton, style]}
    >
      <Animated.View pointerEvents="none" style={[styles.activeBubbleLayer, bubbleStyle]}>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.28)', 'rgba(0, 0, 0, 0.2)']}
          start={{ x: 0, y: 0.15 }}
          end={{ x: 1, y: 0.85 }}
          style={styles.activeIconBubble}
        >
          <View style={styles.activeIconBorder} />
        </LinearGradient>
      </Animated.View>
      <Animated.View style={iconStyle}>{children}</Animated.View>
    </PlatformPressable>
  );
}

export default function TabLayout() {
  const tabBarBottomOffset = Platform.OS === 'android' ? 10 : 8;
  const tabBarHeight = 56;

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={({ navigation }) => {
        const state = navigation.getState();
        const activeRoute = state.routes[state.index]?.name;
        const tabIconTint =
          activeRoute === 'home'
            ? '#85837E'
            : activeRoute === 'todo'
            ? '#258876'
            : activeRoute === 'chat'
              ? '#6CE1DD'
              : activeRoute === 'email'
                ? '#C67676'
                : activeRoute === 'calendar'
                  ? '#2F9FB0'
                : 'rgba(247, 255, 254, 0.72)';
        const tabBarBackgroundColors: [string, string] =
          activeRoute === 'calendar'
            ? ['rgba(71, 69, 69, 0.2)', 'rgba(71, 69, 69, 0.2)']
            : ['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.08)'];

        return {
          tabBarActiveTintColor: tabIconTint,
          tabBarInactiveTintColor: tabIconTint,
          tabBarShowLabel: false,
          headerShown: false,
          tabBarHideOnKeyboard: true,
          animation: 'none',
          freezeOnBlur: true,
          tabBarButton: ({ ref: _ref, ...props }) => <AnimatedTabBarButton {...props} />,
          tabBarIconStyle: {
            marginTop: 'auto',
            marginBottom: 'auto',
          },
          tabBarBackground: () => <GlassTabBarBackground colors={tabBarBackgroundColors} />,
          tabBarStyle: {
            position: 'absolute',
            left: 28,
            right: 28,
            bottom: tabBarBottomOffset,
            height: tabBarHeight,
            marginHorizontal: 20,
            paddingTop: 9,
            paddingBottom: 9,
            paddingHorizontal: 8,
            borderTopWidth: 0,
            borderRadius: 999,
            backgroundColor: 'transparent',
            elevation: 0,
            shadowColor: '#000000',
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            overflow: 'hidden',
          },
        };
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          sceneStyle: {
            backgroundColor: '#8C8268',
          },
          tabBarIcon: ({ color }) => <TabBarIcon name="home-outline" color={color} style={styles.iconGlyph} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          sceneStyle: {
            backgroundColor: '#28D5D1',
          },
          tabBarIcon: ({ color }) => <TabBarIconMaterial name="chat-outline" color={color} style={styles.iconGlyph} />,
        }}
      />
      <Tabs.Screen
        name="email"
        options={{
          title: 'Email',
          tabBarIcon: ({ color }) => <TabBarIconMaterial name="email-outline" color={color} style={styles.iconGlyph} />,
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: 'To Do',
          sceneStyle: {
            backgroundColor: '#0E453B',
          },
          tabBarIcon: ({ color }) => (
            <TabBarIconMaterial
              name="checkbox-marked-circle-outline"
              color={color}
              style={styles.iconGlyph}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          sceneStyle: {
            backgroundColor: '#0E4048',
          },
          tabBarIcon: ({ color }) => (
            <TabBarIconMaterial name="calendar-outline" color={color} style={styles.iconGlyph} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
          headerTitle: "Home Tab",
          title: "Home Tab Title"
        }}
      />
      <Tabs.Screen
        name="note"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeIconBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activeBubbleLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconBubble: {
    width: 68,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconGlyph: {
    transform: [{ translateY: 0 }],
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
