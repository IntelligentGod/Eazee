import React, { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  RefreshControl, Animated, Keyboard, Linking, Alert,
  ActivityIndicator, Easing, Modal, TouchableWithoutFeedback,
  Image, Platform, NativeSyntheticEvent, NativeScrollEvent, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isPast,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import PagerView from 'react-native-pager-view';
import axios from 'axios';
import { withDatabase } from '@nozbe/watermelondb/DatabaseProvider';
import { withObservables } from '@nozbe/watermelondb/react';
import ActionSheet, { ActionSheetRef } from "react-native-actions-sheet";
import { database } from '../../../database/database';
import EventModel from '../../../database/models/EventModel';
import TodoModel from '../../../database/models/TodoModel';
import PulsatingRGB from './PulsatingRGB';
import { getTodoWorkspaceAppearance } from './workspaceThemes';
import { SafeAreaView } from 'react-native';
import debounce from 'lodash/debounce';
import { StyleSheet } from 'react-native';
import { Q } from '@nozbe/watermelondb';
// import ColorPicker, { Swatches, Preview } from 'reanimated-color-picker';
import UserPreferenceModel from '../../../database/models/UserPreferenceModel';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import EmailModel from '../../../database/models/EmailModel';
import { LinearGradient } from 'expo-linear-gradient';
import AIInputBox from '@/components/AIInputBox';
import CompactAiBanner from '@/components/CompactAiBanner';

import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import { getTodoHasDueTime, parseTodoInput, removeTodoInputTime } from '@/utils/todoDates';
import { useCompactTabAI } from '@/lib/useCompactTabAI';
import { useCompactVoiceInput } from '@/lib/useCompactVoiceInput';
import {
  createTodo,
  deleteTodo,
  restoreTodo,
  updateTodo,
  type TodoSnapshot,
} from '@/lib/todoMutations';
import {
  buildCustomReminderMinutes,
  DEFAULT_CUSTOM_REMINDER,
  getTodoReminderLabel,
  normalizeTodoReminderState,
  splitCustomReminderMinutes,
  TODO_REMINDER_PRESETS,
  type TodoReminderMode,
} from '@/utils/todoReminders';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  details?: string;
  dueDate?: Date;
  hasDueTime?: boolean;
  starred?: boolean;
  workspace?: string;
  amazonUrl?: string;
  isAmazonUrlLoaded?: boolean;
  amazonUrlLoadAttempts?: number;
  emailId?: string;
  type: 'basic' | 'progress' | 'slider';
  startedAt?: Date;
  progress?: number;
  reminderEnabled: boolean;
  reminderMode: TodoReminderMode;
  reminderMinutesBefore?: number | null;
  notificationId?: string | null;
}

type TodoSectionKey =
  | 'today'
  | 'upcoming'
  | 'past'
  | 'completed'
  | 'wishlist'
  | 'thisWeek'
  | 'thisMonth'
  | 'thisYear'
  | 'longTerm';

type GoalSectionKey = 'thisWeek' | 'thisMonth' | 'thisYear' | 'longTerm';

const getWeekStartsOnFromLocale = (): 0 | 1 | 2 | 3 | 4 | 5 | 6 => {
  try {
    const LocaleCtor = (Intl as any)?.Locale;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const firstDay = LocaleCtor ? new LocaleCtor(locale).weekInfo?.firstDay : undefined;

    if (typeof firstDay === 'number') {
      return (firstDay === 7 ? 0 : firstDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }
  } catch (error) {
    console.warn('Failed to resolve locale week start', error);
  }

  return 1;
};

const getGoalDefaultDueDate = (
  sectionKey: GoalSectionKey,
  now: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
) => {
  if (sectionKey === 'thisWeek') {
    return startOfDay(endOfWeek(now, { weekStartsOn }));
  }

  if (sectionKey === 'thisMonth') {
    return startOfDay(endOfMonth(now));
  }

  if (sectionKey === 'thisYear') {
    return startOfDay(endOfYear(now));
  }

  return startOfDay(new Date(now.getFullYear() + 1, 0, 1));
};

const EXACT_ALARM_PROMPT_KEY = 'todoExactAlarmPromptSeenV1';
const EXACT_ALARM_SETTINGS_ACTION = 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM';
const TODO_DETAILS_SHELL_COLOR = 'rgba(24, 94, 82, 0.25)';
const TODO_DETAILS_CARD_GRADIENT: [string, string] = ['#BEFFF4', '#298071'];
const TODO_DETAILS_TITLE_COLOR = '#C1FFF4';

const shouldOfferExactAlarmSetup = Platform.OS === 'android' && Number(Platform.Version) >= 31;

const toTodoItem = (todo: TodoModel): TodoItem => {
  const reminder = normalizeTodoReminderState(todo, todo.hasDueTime);

  return {
    id: todo.id,
    text: todo.text,
    completed: todo.completed,
    details: todo.details,
    dueDate: todo.dueDate,
    hasDueTime: todo.hasDueTime,
    starred: todo.starred,
    workspace: todo.workspace,
    amazonUrl: todo.amazonUrl,
    isAmazonUrlLoaded: todo.isAmazonUrlLoaded,
    amazonUrlLoadAttempts: todo.amazonUrlLoadAttempts,
    emailId: todo.emailId,
    type: todo.type || 'basic',
    startedAt: todo.startedAt,
    progress: todo.progress,
    reminderEnabled: reminder.reminderEnabled,
    reminderMode: reminder.reminderMode,
    reminderMinutesBefore: reminder.reminderMinutesBefore,
    notificationId: reminder.notificationId,
  };
};

type TodoKind = 'basic' | 'progress' | 'slider';
type Workspace = {
  key: string; // stable identifier stored on todos (original/builtin name)
  displayName: string; // user-visible name
  originalName: string; // seed/original name
  color: string;
  todoType: TodoKind;
  builtin: boolean;
  locked: boolean; // true for Wishlist
};

interface ThemeConfig {
  overallBg: string;
  gradientColors?: [string, string];
  gradientStart?: { x: number; y: number };
  gradientEnd?: { x: number; y: number };
  sectionBg: string;
  sectionGradientColors: [string, string];
  todoCardGradientColors: [string, string];
  todoCardStrokeColor: string;
  basicDotColor: string;
  progressStarted: string;
  progressStartedInactive: string;
  progressFinished: string;
  progressFinishedInactive?: string; // Added for completeness
  sliderStarted: string;
  sliderHalfway: string;
  sliderFinished: string;
  sliderThumbDefault: string;
  workspaceDotColor: string;
  workspaceNameColor: string;
  headerTitleColor: string;
  headerMenuColor: string;
  todoTitleColor: string;
  statusBarColor: string;
  isDark: boolean; // for status bar style
}

const darkenColor = (hex: string, amount: number) => {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  const next = (value: number) => Math.round(clamp(value * (1 - amount)));

  return `#${[channel(1), channel(3), channel(5)]
    .map((value) => next(value).toString(16).padStart(2, '0'))
    .join('')}`;
};

const lightenColor = (hex: string, amount: number) => {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  const next = (value: number) => Math.round(clamp(value + (255 - value) * amount));

  return `#${[channel(1), channel(3), channel(5)]
    .map((value) => next(value).toString(16).padStart(2, '0'))
    .join('')}`;
};

const getTheme = (color: string = '#22AB93'): ThemeConfig => {
  const c = color?.toLowerCase();

  // Mint
  if (c?.startsWith('#8aedd2') || c?.startsWith('#8a3dd2') || c?.startsWith('#a2fdff')) {
    return {
      overallBg: '#A2FDFF',
      sectionBg: '#9EE9EB',
      sectionGradientColors: ['#9EE9EB', '#68cfd1'],
      todoCardGradientColors: ['#d8ffff', '#8bdfe1'],
      todoCardStrokeColor: '#95E0E2',
      basicDotColor: '#95E0E2',
      progressStarted: '#95E0E2',
      progressStartedInactive: '#C5FCFD',
      progressFinished: '#95E0E2',
      progressFinishedInactive: '#C5FCFD',
      sliderStarted: '#C5FCFD',
      sliderHalfway: '#95E0E2',
      sliderFinished: '#95E0E2',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#95E0E2',
      workspaceNameColor: '#95E0E2',
      headerTitleColor: '#FFFFFF',
      headerMenuColor: '#6dcfd0',
      todoTitleColor: '#FFFFFF',
      statusBarColor: '#A2FDFF',
      isDark: true,
    };
  }

  // High Purple
  if (c?.startsWith('#d8b3fd') || c?.startsWith('#d7afff')) {
    return {
      overallBg: '#D7AFFF',
      sectionBg: '#AD5AFF',
      sectionGradientColors: ['#AD5AFF', '#6b2aad'],
      todoCardGradientColors: ['#e2c7ff', '#9f67d8'],
      todoCardStrokeColor: '#AD5AFF',
      basicDotColor: '#7F4BB5',
      progressStarted: '#D8B3FD',
      progressStartedInactive: 'rgba(216, 179, 253, 0.66)',
      progressFinished: '#7F4BB5',
      progressFinishedInactive: 'rgba(216, 179, 253, 0.66)',
      sliderStarted: '#D8B3FD',
      sliderHalfway: '#7F4BB5',
      sliderFinished: '#7F4BB5',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#AD5AFF',
      workspaceNameColor: '#AD5AFF',
      headerTitleColor: '#F5EAFF',
      headerMenuColor: '#7F4BB5',
      todoTitleColor: '#F5EAFF',
      statusBarColor: '#D7AFFF',
      isDark: true,
    };
  }

  // Coral
  if (c?.startsWith('#ffc4c4') || c?.startsWith('#f1c9b7')) {
    return {
      overallBg: '#FFC4C4',
      sectionBg: '#DC7474',
      sectionGradientColors: ['#DC7474', '#925050'],
      todoCardGradientColors: ['#ffd8d8', '#d38f8f'],
      todoCardStrokeColor: '#DC7474',
      basicDotColor: '#DC7474',
      progressStarted: '#B1765C',
      progressStartedInactive: 'rgba(232, 181, 144, 0.66)',
      progressFinished: '#B1765C',
      progressFinishedInactive: 'rgba(232, 181, 144, 0.66)',
      sliderStarted: '#E8B590',
      sliderHalfway: '#DC7474',
      sliderFinished: '#DC7474',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#DC7474',
      workspaceNameColor: '#DC7474',
      headerTitleColor: '#FFD8D8',
      headerMenuColor: '#B1765C',
      todoTitleColor: '#FFD8D8',
      statusBarColor: '#FFC4C4',
      isDark: true,
    };
  }

  // Indigo
  if (c?.startsWith('#889afc') || c?.startsWith('#a2eefa')) {
    return {
      overallBg: '#889AFC',
      sectionBg: '#5B6ED5',
      sectionGradientColors: ['#5B6ED5', '#344690'],
      todoCardGradientColors: ['#c8d0ff', '#7c8ede'],
      todoCardStrokeColor: '#5B6ED5',
      basicDotColor: '#6F7DC5',
      progressStarted: '#6F7DC5',
      progressStartedInactive: 'rgba(180, 191, 255, 0.66)',
      progressFinished: '#6F7DC5',
      progressFinishedInactive: 'rgba(180, 191, 255, 0.66)',
      sliderStarted: '#B4BFFF',
      sliderHalfway: '#6F7DC5',
      sliderFinished: '#6F7DC5',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#5B6ED5',
      workspaceNameColor: '#5B6ED5',
      headerTitleColor: '#E2E8FF',
      headerMenuColor: '#6F7DC5',
      todoTitleColor: '#FFD8D8',
      statusBarColor: '#889AFC',
      isDark: true,
    };
  }

  // Light Gold
  if (c?.startsWith('#ffeb80') || c?.startsWith('#f8e061')) {
    return {
      overallBg: '#FFEB80',
      sectionBg: '#FFDC21',
      sectionGradientColors: ['#FFDC21', '#b29116'],
      todoCardGradientColors: ['#fff2ab', '#e2c54e'],
      todoCardStrokeColor: '#CBB43F',
      basicDotColor: '#CBB43F',
      progressStarted: '#CBB43F',
      progressStartedInactive: 'rgba(248, 224, 97, 0.66)',
      progressFinished: '#CBB43F',
      progressFinishedInactive: 'rgba(248, 224, 97, 0.66)',
      sliderStarted: '#F8E061',
      sliderHalfway: '#CBB43F',
      sliderFinished: '#CBB43F',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#FFDC21',
      workspaceNameColor: '#FFDC21',
      headerTitleColor: '#FFFCEB',
      headerMenuColor: '#CBB43F',
      todoTitleColor: '#FFFCEB',
      statusBarColor: '#FFEB80',
      isDark: false,
    };
  }

  // Pink
  if (c?.startsWith('#ffc2dc')) {
    return {
      overallBg: '#FFC2DC',
      sectionBg: '#F0B0CD',
      sectionGradientColors: ['#F0B0CD', '#b87895'],
      todoCardGradientColors: ['#ffe1ee', '#d99db8'],
      todoCardStrokeColor: '#BE88A0',
      basicDotColor: '#BE88A0',
      progressStarted: '#FFDCEC',
      progressStartedInactive: 'rgba(255, 220, 236, 0.66)',
      progressFinished: '#BE88A0',
      progressFinishedInactive: 'rgba(255, 220, 236, 0.66)',
      sliderStarted: '#FFDCEC',
      sliderHalfway: '#BE88A0',
      sliderFinished: '#BE88A0',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#F0B0CD',
      workspaceNameColor: '#F0B0CD',
      headerTitleColor: '#F9E6EF',
      headerMenuColor: '#BE88A0',
      todoTitleColor: '#F9E6EF',
      statusBarColor: '#FFC2DC',
      isDark: true,
    };
  }

  // Teal
  if (c?.startsWith('#22ab93')) {
    return {
      overallBg: '#22AB93',
      gradientColors: ['#22ab93', '#0E453B'],
      gradientStart: { x: 0, y: 0 },
      gradientEnd: { x: 1, y: 1 },
      sectionBg: '#3BCAB1',
      sectionGradientColors: ['#3BCAB1', '#1D6457'],
      todoCardGradientColors: ['#9BE4D7', '#47A090'],
      todoCardStrokeColor: '#43A5A4',
      basicDotColor: '#A7D0C9',
      progressStarted: '#469386',
      progressStartedInactive: '#99C8C0',
      progressFinished: '#469386',
      progressFinishedInactive: '#99C8C0',
      sliderStarted: '#99C8C0',
      sliderHalfway: '#5FC0AF',
      sliderFinished: '#469386',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#3BCAB1',
      workspaceNameColor: '#3BCAB1',
      headerTitleColor: '#82E2CD',
      headerMenuColor: '#297769',
      todoTitleColor: '#CFFEF5',
      statusBarColor: '#22AB93',
      isDark: true,
    };
  }

  // Default / Other
  return {
    overallBg: '#E9ECEB',
    sectionBg: color,
    sectionGradientColors: [lightenColor(color, 0.1), darkenColor(color, 0.45)],
    todoCardGradientColors: [lightenColor(color, 0.45), darkenColor(color, 0.08)],
    todoCardStrokeColor: lightenColor(color, 0.18),
    basicDotColor: '#55c2a1', // Default fallback
    progressStarted: '#469386',
    progressStartedInactive: '#99C8C0',
    progressFinished: '#469386',
    progressFinishedInactive: '#99C8C0',
    sliderStarted: '#99C8C0',
    sliderHalfway: '#5FC0AF',
    sliderFinished: '#469386',
    sliderThumbDefault: '#D4D9D9',
    workspaceDotColor: color,
    workspaceNameColor: color,
    headerTitleColor: darkenColor(color, 0.08),
    headerMenuColor: darkenColor(color, 0.22),
    todoTitleColor: '#1f2937', // gray-800
    statusBarColor: '#E9ECEB',
    isDark: false,
  };
};

const BUILTIN_DEFAULTS: Record<string, { color: string; todoType: TodoKind }> = {
  Goals: { color: '#FF9500', todoType: 'basic' },
  Personal: { color: '#22AB93', todoType: 'basic' },
  Wishlist: { color: '#FF3B30', todoType: 'basic' },
};

const BUILTIN_WORKSPACE_ORDER = ['Goals', 'Personal', 'Wishlist'] as const;
const WORKSPACE_SHELL_HORIZONTAL_PADDING = 8;
const WORKSPACE_SHELL_TOP_PADDING = 10;
const WORKSPACE_SHELL_BOTTOM_PADDING = 8;

const normalizeWorkspaceKey = (value?: string) => {
  if (!value) return '';
  return value === 'Work' ? 'Goals' : value;
};

const TodoCardSurface = ({
  children,
  gradientColors,
  strokeColor,
}: {
  children: React.ReactNode;
  gradientColors: [string, string];
  strokeColor: string;
}) => (
  <View style={[styles.todoCardFrame, { backgroundColor: strokeColor }]}>
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.todoCardGradient}
    >
      {children}
    </LinearGradient>
  </View>
);

const SliderTodoItem = ({
  todo,
  onSliderChange,
  handleTodoPress,
  handleLongPress,
  themeColor,
}: {
  todo: TodoItem;
  onSliderChange: (id: string, value: number) => void;
  handleTodoPress: (todo: TodoItem) => void;
  handleLongPress: (todo: TodoItem) => void;
  themeColor?: string;
}) => {
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(todo.progress || 0)).current;
  const workspaceAppearance = getTodoWorkspaceAppearance(todo.workspace);
  const theme = getTheme(workspaceAppearance?.themeColor || themeColor);

  useEffect(() => {
    Animated.spring(progress, {
      toValue: todo.progress || 0,
      useNativeDriver: false,
      bounciness: 10,
    }).start();
  }, [todo.progress, progress]);

  const onGestureEvent = (event: any) => {
    const newProgress = Math.max(0, Math.min(1, event.nativeEvent.x / width));
    progress.setValue(newProgress);
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      // @ts-ignore
      let newProgress = progress._value;
      if (newProgress < 0.05) newProgress = 0;
      else if (newProgress < 0.3) newProgress = 0.1; // "Started" state
      else if (newProgress < 0.75) newProgress = 0.5;
      else newProgress = 1;

      onSliderChange(todo.id, newProgress);

      Animated.spring(progress, {
        toValue: newProgress,
        useNativeDriver: false,
        bounciness: 10,
      }).start();
    }
  };

  const handleStartedPress = () => {
    const newProgress = (todo.progress || 0) > 0 ? 0 : 0.1;
    onSliderChange(todo.id, newProgress);
  };

  const animatedWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const thumbTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width > 0 ? width - 20 : 0], // 20 is thumb width
    extrapolate: 'clamp',
  });

  const getThumbColor = (p: number) => {
    if (p >= 1) return theme.sliderFinished;
    if (p >= 0.5) return theme.sliderHalfway;
    if (p > 0) return theme.sliderStarted;
    return theme.sliderThumbDefault;
  };

  const thumbColor = getThumbColor(todo.progress || 0);

  return (
    <TouchableOpacity
      key={todo.id}
      onPress={() => handleTodoPress(todo)}
      onLongPress={() => handleLongPress(todo)}
      delayLongPress={500}
      activeOpacity={0.8}
    >
      <TodoCardSurface
        gradientColors={workspaceAppearance?.todoCardGradientColors || theme.todoCardGradientColors}
        strokeColor={workspaceAppearance?.todoCardStrokeColor || theme.todoCardStrokeColor}
      >
        <Text className="text-[15px] text-center mb-3" style={{ color: '#3A6860', fontWeight: '700' }}>{todo.text}</Text>
        <View className="flex-row items-center justify-between px-2">
          <TouchableOpacity onPress={handleStartedPress}>
            <Text
              className={`text-[11px] italic ${(todo.progress || 0) > 0 ? 'text-gray-800 font-bold' : 'text-gray-400'
                }`}
            >
              Started
            </Text>
          </TouchableOpacity>
          <Text
            className={`text-[11px] italic ${(todo.progress || 0) >= 0.5 ? 'text-gray-800 font-bold' : 'text-gray-400'
              }`}
          >
            half way
          </Text>
          <Text
            className={`text-[11px] italic ${(todo.progress || 0) >= 1 ? 'text-gray-800 font-bold' : 'text-gray-400'
              }`}
          >
            Finished
          </Text>
        </View>

        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          minDist={0}
        >
          <Animated.View
            onLayout={e => setWidth(e.nativeEvent.layout.width)}
            className="h-5 justify-center"
          >
            <View
              className="h-2 bg-[#D9D9D9] w-full rounded-full"
            />
            <Animated.View
              className="h-2 absolute rounded-full"
              style={{
                width: animatedWidth,
                backgroundColor: thumbColor === '#D4D9D9' ? 'transparent' : thumbColor,
              }}
            />
            <Animated.View
              className="w-5 h-5 rounded-full absolute"
              style={{
                transform: [{ translateX: thumbTranslateX }],
                backgroundColor: thumbColor
              }}
            />
          </Animated.View>
        </PanGestureHandler>
      </TodoCardSurface>
    </TouchableOpacity>
  );
};

const getNextHalfHourTime = (baseDate?: Date) => {
  const now = new Date();
  const next = new Date(baseDate || now);
  next.setSeconds(0, 0);

  const minutes = now.getMinutes();
  if (minutes <= 30) {
    next.setHours(now.getHours(), 30, 0, 0);
  } else {
    next.setHours(now.getHours() + 1, 0, 0, 0);
  }

  return next;
};

const reminderOptions = [
  { key: 'none', label: 'None', mode: 'none' as const, minutes: null },
  { key: 'on_time', label: 'On time', mode: 'on_time' as const, minutes: 0 },
  ...TODO_REMINDER_PRESETS.map((option) => ({
    key: `preset-${option.minutes}`,
    label: option.label,
    mode: 'preset' as const,
    minutes: option.minutes,
  })),
  { key: 'custom', label: 'Custom', mode: 'custom' as const, minutes: null },
];

const REMINDER_WHEEL_ROW_HEIGHT = 40;
const REMINDER_WHEEL_PADDING = REMINDER_WHEEL_ROW_HEIGHT * 2;

const getReminderSelectionKey = (todo: Pick<TodoItem, 'reminderEnabled' | 'reminderMode' | 'reminderMinutesBefore' | 'hasDueTime'>) => {
  const normalized = normalizeTodoReminderState(todo, todo.hasDueTime);
  if (normalized.reminderMode === 'none') return 'none';
  if (normalized.reminderMode === 'on_time') return 'on_time';
  const preset = TODO_REMINDER_PRESETS.find((option) => option.minutes === normalized.reminderMinutesBefore);
  return preset ? `preset-${preset.minutes}` : 'custom';
};

const formatTodoTimeLabel = (date?: Date, hasDueTime?: boolean) => {
  if (!date || !getTodoHasDueTime(date, hasDueTime)) {
    return 'None';
  }

  return format(date, 'h:mm a');
};

const ReminderWheelColumn = React.memo(({
  values,
  selectedValue,
  onChange,
  renderLabel,
}: {
  values: number[];
  selectedValue: number;
  onChange: (value: number) => void;
  renderLabel?: (value: number) => string;
}) => {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const selectedIndex = Math.max(0, values.indexOf(selectedValue));
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: selectedIndex * REMINDER_WHEEL_ROW_HEIGHT,
        animated: false,
      });
    });
  }, [selectedValue, values]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.y / REMINDER_WHEEL_ROW_HEIGHT);
    const nextIndex = Math.max(0, Math.min(values.length - 1, rawIndex));
    const nextValue = values[nextIndex];
    onChange(nextValue);
    scrollRef.current?.scrollTo({
      y: nextIndex * REMINDER_WHEEL_ROW_HEIGHT,
      animated: true,
    });
  };

  return (
    <View style={styles.reminderWheelColumn}>
      <View style={styles.reminderWheelSelection} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={REMINDER_WHEEL_ROW_HEIGHT}
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={{
          paddingTop: REMINDER_WHEEL_PADDING,
          paddingBottom: REMINDER_WHEEL_PADDING,
        }}
      >
        {values.map((value) => (
          <View key={value} style={styles.reminderWheelItem}>
            <Text
              style={[
                styles.reminderWheelItemText,
                value === selectedValue && styles.reminderWheelItemTextSelected,
              ]}
            >
              {renderLabel ? renderLabel(value) : String(value)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
});
ReminderWheelColumn.displayName = 'ReminderWheelColumn';

const TodoComposer = React.memo(({
  initialTodo,
  themeColor,
  onSave,
}: {
  initialTodo: Partial<TodoItem>;
  themeColor: string;
  onSave: (draft: Partial<TodoItem>) => Promise<void>;
}) => {
  const [draft, setDraft] = useState<Partial<TodoItem>>(initialTodo);
  const [inputText, setInputText] = useState(initialTodo.text || '');
  const textRef = useRef(initialTodo.text || '');
  const [committedText, setCommittedText] = useState(initialTodo.text || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pendingTime, setPendingTime] = useState(() => initialTodo.dueDate || new Date());
  const inputPlaceholder = initialTodo.workspace === 'Goals' ? 'Add new goal...' : 'Add new task...';

  const parsedTodoInput = useMemo(
    () => parseTodoInput(committedText, { fallbackDate: draft.dueDate }),
    [committedText, draft.dueDate]
  );
  const previewUsesParsedDueDate = parsedTodoInput.matchedDate || parsedTodoInput.matchedTime;
  const previewDueDate = previewUsesParsedDueDate ? parsedTodoInput.dueDate : draft.dueDate;
  const previewHasDueTime = previewUsesParsedDueDate
    ? parsedTodoInput.hasDueTime
    : getTodoHasDueTime(draft.dueDate, draft.hasDueTime);

  const formatDateChipLabel = (date?: Date) => {
    if (!date) return 'Today';
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  };

  const formatTimeChipLabel = (date?: Date) => {
    if (!date) return '';
    return format(date, 'h:mm a');
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (!selectedDate) {
      return;
    }

    const newDate = new Date(selectedDate);
    setDraft((currentDraft) => {
      const nextDate = new Date(newDate);
      const hasDueTime = getTodoHasDueTime(currentDraft.dueDate, currentDraft.hasDueTime);

      if (hasDueTime && currentDraft.dueDate) {
        nextDate.setHours(
          currentDraft.dueDate.getHours(),
          currentDraft.dueDate.getMinutes(),
          0,
          0
        );
      } else {
        nextDate.setHours(0, 0, 0, 0);
      }

      return { ...currentDraft, dueDate: nextDate, hasDueTime };
    });
  };

  const handleOpenTimePicker = () => {
    const parsedHasDueTime = !!parsedTodoInput.dueDate && parsedTodoInput.hasDueTime;
    const sourceDate = parsedHasDueTime ? parsedTodoInput.dueDate : draft.dueDate;
    const hasDueTime = parsedHasDueTime || getTodoHasDueTime(draft.dueDate, draft.hasDueTime);
    const nextTime = hasDueTime
      ? new Date(sourceDate || new Date())
      : getNextHalfHourTime(sourceDate);

    setPendingTime(nextTime);
    setShowTimePicker(true);
  };

  const handleTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (_event.type === 'dismissed') {
      setShowTimePicker(false);
      return;
    }

    if (!selectedDate) {
      return;
    }

    setPendingTime(selectedDate);

    if (Platform.OS === 'android') {
      setDraft((currentDraft) => {
        const nextDate = currentDraft.dueDate ? new Date(currentDraft.dueDate) : startOfDay(new Date());
        nextDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        return { ...currentDraft, dueDate: nextDate, hasDueTime: true };
      });
      setShowTimePicker(false);
    }
  };

  const handleClearTime = () => {
    const nextText = removeTodoInputTime(textRef.current);
    if (nextText !== textRef.current) {
      textRef.current = nextText;
      setInputText(nextText);
      setCommittedText(nextText);
    }

    setDraft((currentDraft) => {
      const nextDate = currentDraft.dueDate ? new Date(currentDraft.dueDate) : startOfDay(new Date());
      nextDate.setHours(0, 0, 0, 0);
      return { ...currentDraft, dueDate: nextDate, hasDueTime: false };
    });
    setShowTimePicker(false);
  };

  const handleConfirmTime = () => {
    setDraft((currentDraft) => {
      const nextDate = currentDraft.dueDate ? new Date(currentDraft.dueDate) : startOfDay(new Date());
      nextDate.setHours(pendingTime.getHours(), pendingTime.getMinutes(), 0, 0);
      return { ...currentDraft, dueDate: nextDate, hasDueTime: true };
    });
    setShowTimePicker(false);
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    textRef.current = text;
    setCommittedText((currentCommittedText) => {
      if (!text) {
        return '';
      }

      if (/\s$/.test(text) || text.length < currentCommittedText.length) {
        return text;
      }

      return currentCommittedText;
    });
  };

  const handleTextBlur = () => {
    setCommittedText(textRef.current);
  };

  const handleSavePress = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await onSave({ ...draft, text: textRef.current });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <View className="p-4">
        <View style={styles.todoComposerInputContainer}>
          <TouchableOpacity
            onPress={handleOpenTimePicker}
            style={styles.todoComposerClockButton}
            accessibilityRole="button"
            accessibilityLabel="Select due time"
          >
            <Ionicons
              name={previewHasDueTime ? "time" : "time-outline"}
              size={20}
              color={previewHasDueTime ? themeColor : '#6b7280'}
            />
          </TouchableOpacity>
          <TextInput
            autoFocus={true}
                style={styles.todoComposerInput}
                value={inputText}
                onChangeText={handleTextChange}
                onBlur={handleTextBlur}
                placeholder={inputPlaceholder}
                placeholderTextColor="#999"
                selectionColor={themeColor}
              />
        </View>
        {showDetails && (
          <TextInput
            className="h-20 border border-gray-300 rounded-lg px-3 mt-2 mb-2"
            value={draft.details}
            onChangeText={(details) => setDraft((currentDraft) => ({ ...currentDraft, details }))}
            placeholder="Add details..."
            placeholderTextColor="#999"
            multiline
          />
        )}
        <View className="flex-row justify-between items-center">
          <View style={styles.todoComposerActions}>
            <TouchableOpacity onPress={() => setShowDetails((current) => !current)}>
              <Ionicons name="list" size={21} color={themeColor} />
            </TouchableOpacity>
            <View style={styles.todoComposerDateTimeGroup}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={styles.todoComposerChip}
              >
                <Ionicons name="calendar" size={17} color={themeColor} />
                <Text style={styles.todoComposerChipText}>{formatDateChipLabel(previewDueDate)}</Text>
              </TouchableOpacity>
              {previewHasDueTime && previewDueDate && (
                <View style={styles.todoComposerChip}>
                  <Ionicons name="time" size={16} color={themeColor} />
                  <Text style={styles.todoComposerChipText}>{formatTimeChipLabel(previewDueDate)}</Text>
                  <TouchableOpacity
                    onPress={handleClearTime}
                    style={styles.todoComposerChipCloseButton}
                    hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                  >
                    <Ionicons name="close" size={13} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setDraft((currentDraft) => ({ ...currentDraft, starred: !currentDraft.starred }))}
              style={styles.todoComposerStarButton}
            >
              <MaterialCommunityIcons
                name={draft.starred ? "hexagram" : "hexagram-outline"}
                size={20}
                color={themeColor}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            className="px-3.5 py-2 rounded-lg"
            style={{ backgroundColor: themeColor }}
            onPressIn={() => {
              void handleSavePress();
            }}
            disabled={isSaving}
          >
            <Text className="text-white font-bold text-sm">Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={draft.dueDate || new Date()}
          mode="date"
          display="default"
          onChange={handleDateChange}
          accentColor={themeColor}
          textColor={themeColor}
        />
      )}

      {showTimePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pendingTime}
          mode="time"
          display="spinner"
          onChange={handleTimeChange}
        />
      )}

      {Platform.OS !== 'android' && (
        <Modal
          transparent
          visible={showTimePicker}
          animationType="fade"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowTimePicker(false)}>
            <View style={styles.todoComposerTimeModalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.todoComposerTimeModalCard}>
                  <DateTimePicker
                    value={pendingTime}
                    mode="time"
                    display="spinner"
                    onChange={handleTimeChange}
                    accentColor={themeColor}
                    textColor="#111827"
                    style={styles.todoComposerTimePicker}
                  />
                  <TouchableOpacity
                    onPress={handleConfirmTime}
                    style={[styles.todoComposerTimePrimaryButton, { backgroundColor: themeColor }]}
                  >
                    <Text style={styles.todoComposerTimePrimaryButtonText}>Set</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </>
  );
});
TodoComposer.displayName = 'TodoComposer';

const enhanceWithTodosAndPreferences = withObservables([], () => ({
  todos: database.collections.get<TodoModel>('todos').query().observe(),
  preferences: database.collections.get<UserPreferenceModel>('user_preferences').query().observe(),
}));

const TodoScreen = enhanceWithTodosAndPreferences(({ todos, preferences }: {
  todos: TodoModel[],
  preferences: UserPreferenceModel[]
}) => {
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const aiInputSpacer = floatingTabBarInset + 74;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAiInputFocused, setIsAiInputFocused] = useState(false);
  const isAiComposerActive = isKeyboardVisible || isAiInputFocused;
  const aiInputKeyboardBottom = Platform.OS === 'android' && isAiComposerActive ? 0 : aiInputBottom;

  const [currentWorkspace, setCurrentWorkspace] = useState(0);
  const currentWorkspaceRef = useRef(0);
  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
  }, [currentWorkspace]);
  const [isOptionsMenuVisible, setIsOptionsMenuVisible] = useState(false);
  const [workspaceTodoTypes, setWorkspaceTodoTypes] = useState<Record<string, 'basic' | 'progress' | 'slider'>>({});
  const [selectedTodoType, setSelectedTodoType] = useState<'basic' | 'progress' | 'slider'>('basic');
  const workspaceNameAnim = useRef(new Animated.Value(0)).current;
  const dotPositionAnim = useRef(new Animated.Value(0)).current;
  const [fadeAnim] = useState(new Animated.Value(1));
  const scrollViewRef = useRef<ScrollView>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [composerInitialTodo, setComposerInitialTodo] = useState<Partial<TodoItem>>({ hasDueTime: false });
  const [composerKey, setComposerKey] = useState(0);
  const [localTodos, setLocalTodos] = useState<TodoItem[]>([]);
  const localTodosRef = useRef<TodoItem[]>([]);
  const weekStartsOn = getWeekStartsOnFromLocale();

  const refreshLocalTodos = useCallback(async () => {
    const fresh = await database.collections.get<TodoModel>('todos').query().fetch();
    const items = fresh.map(toTodoItem);
    setLocalTodos(items);
    localTodosRef.current = items;
  }, []);

  const { scrollToEnd, workspaceKey } = useLocalSearchParams();
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const swipeAnimValue = useRef(new Animated.Value(0)).current;

  const [isProcessing, setIsProcessing] = useState(false);

  // Lightweight speech overlay (testing): shows interim and final recognized text
  const [speechOverlayText, setSpeechOverlayText] = useState('');
  const [showSpeechOverlay, setShowSpeechOverlay] = useState(false);

  const [isTextInputModalVisible, setIsTextInputModalVisible] = useState(false)

  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingUrls, setIsLoadingUrls] = useState(false);

  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addToCartSuccess, setAddToCartSuccess] = useState(false);

  const [selectedTodoForDetails, setSelectedTodoForDetails] = useState<TodoItem | null>(null);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const detailsModalAnim = useRef(new Animated.Value(0)).current;
  const [editedTodoDetails, setEditedTodoDetails] = useState('');
  const [isDetailsTimePickerVisible, setIsDetailsTimePickerVisible] = useState(false);
  const [pendingDetailsTime, setPendingDetailsTime] = useState(new Date());
  const pendingDetailsTimeRef = useRef(new Date());
  const [isReminderModalVisible, setIsReminderModalVisible] = useState(false);
  const [isCustomReminderModalVisible, setIsCustomReminderModalVisible] = useState(false);
  const [customReminderDays, setCustomReminderDays] = useState<number>(DEFAULT_CUSTOM_REMINDER.days);
  const [customReminderHours, setCustomReminderHours] = useState<number>(DEFAULT_CUSTOM_REMINDER.hours);
  const [customReminderMinutes, setCustomReminderMinutes] = useState<number>(DEFAULT_CUSTOM_REMINDER.minutes);
  const [completingTodoId, setCompletingTodoId] = useState<string | null>(null);
  const [emailSenders, setEmailSenders] = useState<Record<string, string>>({});

  const showReminderPermissionAlert = useCallback(() => {
    Alert.alert(
      'Notifications are off',
      'Enable notifications in Settings to get todo reminders on this device.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings().catch((error) => {
              console.error('Error opening settings:', error);
            });
          },
        },
      ]
    );
  }, []);

  const openExactAlarmSettings = useCallback(() => {
    if (!shouldOfferExactAlarmSetup) {
      return;
    }

    Linking.sendIntent(EXACT_ALARM_SETTINGS_ACTION).catch((error) => {
      console.error('Error opening exact alarm settings:', error);
      Linking.openSettings().catch((settingsError) => {
        console.error('Error opening settings:', settingsError);
      });
    });
  }, []);

  const maybeShowExactAlarmPrompt = useCallback(async () => {
    if (!shouldOfferExactAlarmSetup) {
      return;
    }

    try {
      const hasShownPrompt = await AsyncStorage.getItem(EXACT_ALARM_PROMPT_KEY);
      if (hasShownPrompt === '1') {
        return;
      }

      await AsyncStorage.setItem(EXACT_ALARM_PROMPT_KEY, '1');
      Alert.alert(
        'Improve reminder accuracy',
        'On Android, reminders can arrive late while your phone is locked unless "Alarms & reminders" is allowed for this app.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openExactAlarmSettings },
        ]
      );
    } catch (error) {
      console.error('Error handling exact alarm prompt:', error);
    }
  }, [openExactAlarmSettings]);

  const handleReminderResult = useCallback((status: string) => {
    if (status === 'permission_denied') {
      showReminderPermissionAlert();
      return;
    }

    if (status === 'scheduled') {
      void maybeShowExactAlarmPrompt();
    }
  }, [maybeShowExactAlarmPrompt, showReminderPermissionAlert]);


  const animationsRef = useRef({
    fadeAnims: {} as Record<string, Animated.Value>,
    translateXAnims: {} as Record<string, Animated.Value>,
    animationStates: {} as Record<string, any>
  });

  const buildWorkspacesFromPreferences = useCallback((): Workspace[] => {
    const base: Workspace[] = BUILTIN_WORKSPACE_ORDER.map(name => ({
      key: name,
      displayName: name,
      originalName: name,
      color: getTodoWorkspaceAppearance(name)?.themeColor || BUILTIN_DEFAULTS[name].color,
      todoType: BUILTIN_DEFAULTS[name].todoType,
      builtin: true,
      locked: name === 'Wishlist',
    }));
    const byKey = new Map<string, Workspace>(base.map(w => [w.key, w]));
    // Process legacy prefs first (no original_name), then modern (with original_name) to let modern override
    const legacyPrefs = preferences.filter(p => !(p as any).original_name);
    const modernPrefs = preferences.filter(p => !!(p as any).original_name);
    const orderedPrefs = [...legacyPrefs, ...modernPrefs];
    orderedPrefs.forEach(pref => {
      const rawKey = (pref.original_name as string) || (pref.workspace_name as string);
      const key = normalizeWorkspaceKey(rawKey);
      if (!key) return;
      const existing = byKey.get(key);
      const rawDisplayName = (pref.display_name as string) || (pref.workspace_name as string) || existing?.displayName || key;
      const updated: Workspace = {
        key,
        displayName: rawDisplayName === 'Work' ? 'Goals' : rawDisplayName,
        originalName: key,
        color: getTodoWorkspaceAppearance(key)?.themeColor || (pref.color as string) || existing?.color || BUILTIN_DEFAULTS[key]?.color,
        todoType: (pref.todo_type as 'basic' | 'progress' | 'slider') || existing?.todoType || 'basic',
        builtin: BUILTIN_WORKSPACE_ORDER.includes(key as typeof BUILTIN_WORKSPACE_ORDER[number]),
        locked: key === 'Wishlist',
      };
      byKey.set(key, updated);
    });
    const list = Array.from(byKey.values());
    return list.sort((a, b) => {
      const order = BUILTIN_WORKSPACE_ORDER as readonly string[];
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [preferences]);

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => buildWorkspacesFromPreferences());

  // Workspace color editing disabled.
  // const [isColorPickerVisible, setIsColorPickerVisible] = useState(false);
  // const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState(0);

  useEffect(() => {
    setWorkspaces(buildWorkspacesFromPreferences());
  }, [preferences, buildWorkspacesFromPreferences]);
  const workspaceColors = useMemo(() => workspaces.map(w => w.color), [workspaces]);

  // One-time normalization: fix todos whose workspace was saved using a display name or variant
  const didNormalizeRef = useRef(false);
  useEffect(() => {
    const normalize = async () => {
      if (didNormalizeRef.current || !workspaces.length) return;
      didNormalizeRef.current = true;
      try {
        const validKeys = new Set(workspaces.map(w => w.key));
        const nameToKey = new Map<string, string>();
        workspaces.forEach(w => {
          nameToKey.set(w.key.toLowerCase(), w.key);
          nameToKey.set(w.displayName.toLowerCase(), w.key);
          nameToKey.set((w.displayName + ' workspace').toLowerCase(), w.key);
          if (w.key === 'Goals') {
            nameToKey.set('work', 'Goals');
            nameToKey.set('work workspace', 'Goals');
          }
        });
        const preferencesCollection = database.collections.get<UserPreferenceModel>('user_preferences');
        const preferenceRows = await preferencesCollection.query().fetch();
        const canonicalPrefs = new Map<string, UserPreferenceModel>();
        preferenceRows.forEach((pref) => {
          const rawKey = String((pref as any).original_name || (pref as any).workspace_name || '');
          const key = normalizeWorkspaceKey(rawKey);
          if (!canonicalPrefs.has(key)) {
            canonicalPrefs.set(key, pref);
          }
        });

        await database.write(async () => {
          for (const pref of preferenceRows) {
            const rawKey = String((pref as any).original_name || (pref as any).workspace_name || '');
            const normalizedKey = normalizeWorkspaceKey(rawKey);
            const workspaceName = String(pref.workspace_name || '');
            const displayName = String((pref as any).display_name || '');
            const canonicalPref = canonicalPrefs.get(normalizedKey);
            const hasDuplicateBuiltin = rawKey === 'Work' && canonicalPref && canonicalPref.id !== pref.id;

            if (hasDuplicateBuiltin) {
              await pref.destroyPermanently();
              continue;
            }

            if (
              rawKey !== normalizedKey ||
              workspaceName === 'Work' ||
              displayName === 'Work'
            ) {
              await pref.update((record) => {
                if (record.workspace_name === 'Work') {
                  record.workspace_name = 'Goals';
                }
                // @ts-ignore
                if ((record as any).original_name === 'Work') {
                  // @ts-ignore
                  record.original_name = 'Goals';
                }
                // @ts-ignore
                if ((record as any).display_name === 'Work') {
                  // @ts-ignore
                  record.display_name = 'Goals';
                }
              });
            }
          }
        });

        const todosCol = database.collections.get<TodoModel>('todos');
        const rows = await todosCol.query().fetch();
        const toFix = rows.filter(t => !!t.workspace && !validKeys.has(String(t.workspace)));
        if (toFix.length) {
          await database.write(async () => {
            for (const row of toFix) {
              const norm = String(row.workspace).toLowerCase();
              const mapped = nameToKey.get(norm);
              if (mapped) { await row.update(r => { /* @ts-ignore */ r.workspace = mapped; }); }
            }
          });
        }
      } catch (e) { /* no-op */ }
    };
    normalize();
  }, [workspaces, database]);

  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const autoReplyMicNoticeRef = useRef<object | null>(null);

  const [showUndo, setShowUndo] = useState(false);
  const [lastDeletedTodo, setLastDeletedTodo] = useState<TodoSnapshot | null>(null);
  const undoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoAnim = useRef(new Animated.Value(0)).current;

  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (preferences) {
      const newWorkspaceTodoTypes = preferences.reduce((acc, pref) => {
        if ((pref.workspace_name || pref.original_name) && pref.todo_type) {
          const key = normalizeWorkspaceKey(
            // @ts-ignore
            (pref.original_name as string) || (pref.workspace_name as string)
          );
          acc[key] = pref.todo_type;
        }
        return acc;
      }, {} as Record<string, 'basic' | 'progress' | 'slider'>);
      setWorkspaceTodoTypes(newWorkspaceTodoTypes);

      const currentKey = workspaces[currentWorkspace]?.key;
      setSelectedTodoType((currentKey && newWorkspaceTodoTypes[currentKey]) || 'basic');
    }
  }, [preferences, currentWorkspace, workspaces]);

  // Move email sender effect outside of render cycle
  useEffect(() => {
    const fetchEmailSenders = async () => {
      const todosWithEmailIds = localTodos.filter(todo => todo.emailId);

      if (todosWithEmailIds.length === 0) return;

      try {
        const emailIds = todosWithEmailIds.map(todo => todo.emailId).filter((id): id is string => id !== undefined);

        const emails = await database.collections
          .get<EmailModel>('emails')
          .query(Q.where('id', Q.oneOf(emailIds)))
          .fetch();

        const senderMap = emails.reduce((acc, email) => {
          acc[email.id] = email.from;
          return acc;
        }, {} as Record<string, string>);

        setEmailSenders(senderMap);
      } catch (error) {
        console.error('Error fetching email senders:', error);
      }
    };

    fetchEmailSenders();
  }, [localTodos, database]);

  useEffect(() => {
    localTodos.forEach(todo => {
      if (!animationsRef.current.fadeAnims[todo.id]) {
        animationsRef.current.fadeAnims[todo.id] = new Animated.Value(todo.completed ? 0.6 : 1);
        animationsRef.current.translateXAnims[todo.id] = new Animated.Value(todo.completed ? 20 : 0);
        animationsRef.current.animationStates[todo.id] = {
          isFaded: todo.completed,
          isTranslated: todo.completed
        };
      }
    });
  }, [localTodos]);

  useEffect(() => {
    if (scrollToEnd === 'true' && pagerViewRef.current) {
      // Initial delay
      setTimeout(() => {
        // Start speaking and show swipe hint simultaneously
        setIsSpeaking(true);
        setShowSwipeHint(true);

        const animateSwipe = () => {
          swipeAnimValue.setValue(0);

          Animated.timing(swipeAnimValue, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }).start(() => {
            pagerViewRef.current?.setPage(workspaces.length - 2);

            setTimeout(() => {
              swipeAnimValue.setValue(0);
              Animated.timing(swipeAnimValue, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
                easing: Easing.inOut(Easing.ease),
              }).start(() => {
                pagerViewRef.current?.setPage(workspaces.length - 1);

                setTimeout(() => {
                  setShowSwipeHint(false);
                  setIsSpeaking(false);
                }, 500);
              });
            }, 500);
          });
        };

        animateSwipe();
      }, 1000);
    }
  }, []);

  // Navigate directly to a workspace when provided via route param
  useEffect(() => {
    try {
      if (typeof workspaceKey === 'string' && workspaceKey && workspaces.length) {
        const normalizedWorkspaceKey = normalizeWorkspaceKey(workspaceKey);
        const idx = workspaces.findIndex(w => (
          w.key === normalizedWorkspaceKey ||
          w.displayName === normalizedWorkspaceKey ||
          w.originalName === normalizedWorkspaceKey ||
          w.key === workspaceKey ||
          w.displayName === workspaceKey ||
          w.originalName === workspaceKey
        ));
        if (idx >= 0) {
          setCurrentWorkspace(idx);
          requestAnimationFrame(() => {
            pagerViewRef.current?.setPage(idx);
            animateWorkspaceChange(idx);
          });
        }
      }
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey, workspaces.length]);


  useEffect(() => {
    refreshLocalTodos();
  }, [todos, refreshLocalTodos]);

  useFocusEffect(
    useCallback(() => {
      refreshLocalTodos();
    }, [refreshLocalTodos])
  );

  useEffect(() => {
    localTodosRef.current = localTodos;
  }, [localTodos]);

  useEffect(() => {
    const checkOverdueStartedTodos = async () => {
      const today = startOfDay(new Date());
      const overdueIds = localTodos
        .filter(t =>
          t.type === 'progress' &&
          t.startedAt &&
          !t.completed &&
          t.dueDate &&
          isPast(endOfDay(t.dueDate))
        )
        .map(t => t.id);

      if (overdueIds.length > 0) {
        for (const id of overdueIds) {
          await updateTodo(id, { dueDate: today, hasDueTime: false }, { syncReminder: true });
        }
        await refreshLocalTodos();
      }
    };

    checkOverdueStartedTodos();
  }, [localTodos, refreshLocalTodos]);

  const UndoNotification = () => {
    useEffect(() => {
      Animated.spring(undoAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      return () => {
        Animated.timing(undoAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      };
    }, []);

    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TouchableOpacity
          onPress={handleUndo}
          activeOpacity={0.8}
        >
          <Animated.View
            style={[{
              backgroundColor: '#333',
              borderRadius: 20,
              padding: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
              width: 200,
              transform: [{
                translateY: undoAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-100, 30]
                })
              }]
            }]}
          >
            <Text style={{ color: 'white', fontSize: 13 }}>Item deleted</Text>
            <Text style={{ color: '#22AB93', fontWeight: 'bold', fontSize: 13 }}>UNDO</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
    );
  };

  const handleUndo = useCallback(async () => {
    if (lastDeletedTodo) {
      try {
        const result = await restoreTodo(lastDeletedTodo);
        handleReminderResult(result.reminderStatus);

        await refreshLocalTodos();
        setShowUndo(false);
        setLastDeletedTodo(null);
        if (undoTimeout.current) {
          clearTimeout(undoTimeout.current);
        }
      } catch (error) {
        console.error('Error undoing delete:', error);
      }
    }
  }, [lastDeletedTodo, refreshLocalTodos, handleReminderResult]);

  const handleSwipeDelete = useCallback(async (todoId: string) => {
    try {
      const snapshot = await deleteTodo(todoId);
      setLastDeletedTodo(snapshot);

      await refreshLocalTodos();

      setShowUndo(true);

      // Clear any existing timeout
      if (undoTimeout.current) {
        clearTimeout(undoTimeout.current);
      }

      // Set new timeout
      undoTimeout.current = setTimeout(() => {
        setShowUndo(false);
        setLastDeletedTodo(null);
      }, 3000);

    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  }, [refreshLocalTodos]);

  const fetchAmazonUrl = async (keyword: string) => {
    console.log("Fetching amazon link")
    try {
      const response = await axios.get(`https://170.64.200.117.nip.io/search_amazon`, {
        params: { query: keyword }
      });
      if (response.data && response.data.link) {
        console.log("Link:", response.data.link)
        return response.data.link;
      }
    } catch (error) {
      console.error('Error fetching Amazon URL:', error);
    }
    return null;
  };

  const loadAmazonUrls = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      const candidates = localTodosRef.current.filter(todo =>
        todo.workspace === 'Wishlist' &&
        (!todo.isAmazonUrlLoaded || (todo.amazonUrlLoadAttempts ?? 0) < 3) &&
        !todo.amazonUrl
      );

      for (const item of candidates) {
        const url = await fetchAmazonUrl(item.text);
        const model = await database.collections.get<TodoModel>('todos').find(item.id);
        await database.write(async () => {
          await model.update(t => {
            if (url) {
              t.amazonUrl = url;
              t.isAmazonUrlLoaded = true;
              t.amazonUrlLoadAttempts = 0;
            } else {
              t.amazonUrlLoadAttempts = (t.amazonUrlLoadAttempts || 0) + 1;
            }
          });
        });
      }

      await refreshLocalTodos();
    } finally {
      isLoadingRef.current = false;
      setIsLoadingUrls(false);
    }
  }, [refreshLocalTodos]);

  useEffect(() => {
    const newWishlistItems = localTodos.filter(todo =>
      todo.workspace === 'Wishlist' &&
      !todo.isAmazonUrlLoaded &&
      (todo.amazonUrlLoadAttempts ?? 0) < 3
    );

    if (newWishlistItems.length > 0 && !isLoadingUrls) {
      loadAmazonUrls();
    }
  }, [localTodos, isLoadingUrls, loadAmazonUrls]);

  const handleBuyPress = async (todo: TodoModel) => {
    if (todo.amazonUrl) {
      await openAmazonLink(todo.amazonUrl);
    } else {
      const url = await fetchAmazonUrl(todo.text);
      if (url) {
        await database.write(async () => {
          await todo.update(todoToUpdate => {
            todoToUpdate.amazonUrl = url;
            todoToUpdate.isAmazonUrlLoaded = true;
            todoToUpdate.amazonUrlLoadAttempts = 0;
          });
        });
        await openAmazonLink(url);
      } else {
        console.log('No Amazon URL found for this item');
        Alert.alert('Error', 'Unable to find a product link for this item.');
      }
    }
  };

  // Workspace color editing and workspace creation are disabled.
  // const handleWorkspaceColorChange = (index: number) => {
  //   setSelectedWorkspaceIndex(index);
  //   setIsColorPickerVisible(true);
  // };

  // const MAX_WORKSPACES = 5;
  // const createWorkspace = async () => {
  //   if (workspaces.length >= MAX_WORKSPACES) {
  //     Alert.alert('Limit reached', `You can have at most ${MAX_WORKSPACES} workspaces.`);
  //     return;
  //   }
  //   const baseName = 'New workspace';
  //   const existingNames = new Set(workspaces.map(w => w.displayName));
  //   const existingKeys = new Set(workspaces.map(w => w.key));
  //   let name = baseName;
  //   let suffix = 1;
  //   while (existingNames.has(name)) name = `${baseName} ${suffix++}`;

  //   const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  //   while (existingKeys.has(uniqueKey)) {
  //     name = `${baseName} ${suffix++}`;
  //   }

  //   const ws: Workspace = {
  //     key: uniqueKey,
  //     displayName: name,
  //     originalName: name,
  //     color: '#22AB93',
  //     todoType: 'basic',
  //     builtin: false,
  //     locked: false,
  //   };

  //   setWorkspaces(prev => [...prev, ws]);
  //   setCurrentWorkspace(workspaces.length);
  //   requestAnimationFrame(() => {
  //     pagerViewRef.current?.setPage(workspaces.length);
  //     animateWorkspaceChange(workspaces.length);
  //   });

  //   try {
  //     await database.write(async () => {
  //       const prefCollection = database.collections.get<UserPreferenceModel>('user_preferences');
  //       await prefCollection.create(pref => {
  //         // @ts-ignore
  //         pref.workspace_name = ws.displayName;
  //         // @ts-ignore
  //         pref.display_name = ws.displayName;
  //         // @ts-ignore
  //         pref.original_name = ws.key;
  //         // @ts-ignore
  //         pref.color = ws.color;
  //         // @ts-ignore
  //         pref.todo_type = ws.todoType;
  //       });
  //     });
  //   } catch (e) {
  //     console.error('Failed to create workspace', e);
  //   }
  // };

  // const deleteWorkspace = (index: number) => {
  //   const ws = workspaces[index];
  //   if (!ws || ws.builtin || ws.locked) return;

  //   Alert.alert(
  //     'Delete workspace',
  //     `Delete "${ws.displayName}"? Todos will be moved to Personal.`,
  //     [
  //       { text: 'Cancel', style: 'cancel' },
  //       {
  //         text: 'Delete',
  //         style: 'destructive',
  //         onPress: async () => {
  //           try {
  //             await database.write(async () => {
  //               const todosToMove = await database.collections
  //                 .get<TodoModel>('todos')
  //                 .query(Q.where('workspace', ws.key))
  //                 .fetch();
  //               for (const t of todosToMove) {
  //                 await t.update(todo => {
  //                   // @ts-ignore
  //                   todo.workspace = 'Personal';
  //                   // @ts-ignore
  //                   todo.type = 'basic';
  //                 });
  //               }
  //               const prefCollection = database.collections.get<UserPreferenceModel>('user_preferences');
  //               const existing = await prefCollection.query(Q.where('original_name', ws.key)).fetch();
  //               if (existing.length) {
  //                 await existing[0].destroyPermanently();
  //               }
  //             });
  //             const remainingCount = workspaces.length - 1;
  //             const maxIndex = Math.max(0, remainingCount - 1);
  //             const targetIndex = Math.min(index, maxIndex);

  //             setWorkspaces(prev => prev.filter((_, i) => i !== index));
  //             setCurrentWorkspace(targetIndex);
  //             requestAnimationFrame(() => {
  //               pagerViewRef.current?.setPage(targetIndex);
  //               animateWorkspaceChange(targetIndex);
  //             });
  //           } catch (e) {
  //             console.error('Failed to delete workspace', e);
  //             Alert.alert('Error', 'Failed to delete workspace.');
  //           }
  //         },
  //       },
  //     ]
  //   );
  // };

  // const [tempColor, setTempColor] = useState(workspaces[selectedWorkspaceIndex]?.color || '#22AB93');
  // const [tempName, setTempName] = useState(workspaces[selectedWorkspaceIndex]?.displayName || '');

  // useEffect(() => {
  //   if (!isColorPickerVisible) return;
  //   setTempColor(workspaces[selectedWorkspaceIndex]?.color || '#22AB93');
  //   setTempName(workspaces[selectedWorkspaceIndex]?.displayName || '');
  // }, [isColorPickerVisible, selectedWorkspaceIndex]);

  // const ColorPickerModal = useMemo(() => {
  //   const handleColorChange = ({ hex }: { hex: string }) => {
  //     setTempColor(hex);
  //   };

  //   const handleCancel = () => {
  //     setIsColorPickerVisible(false);
  //   };

  //   const handleDone = async () => {
  //     const ws = workspaces[selectedWorkspaceIndex];
  //     if (!ws) { setIsColorPickerVisible(false); return; }

  //     setWorkspaces(prev => {
  //       const next = [...prev];
  //       next[selectedWorkspaceIndex] = { ...ws, color: tempColor, displayName: tempName || ws.displayName };
  //       return next;
  //     });

  //     try {
  //       await database.write(async () => {
  //         const preferencesCollection = database.collections.get<UserPreferenceModel>('user_preferences');
  //         const existingPref = await preferencesCollection
  //           .query(Q.where('original_name', ws.key))
  //           .fetch();

  //         if (existingPref.length > 0) {
  //           for (const pref of existingPref) {
  //             await pref.update(p => {
  //               // @ts-ignore
  //               p.color = tempColor;
  //               // @ts-ignore
  //               if (tempName?.trim()) p.display_name = tempName.trim();
  //             });
  //           }
  //         } else {
  //           await preferencesCollection.create(pref => {
  //             // @ts-ignore
  //             pref.workspace_name = ws.displayName;
  //             // @ts-ignore
  //             pref.display_name = (tempName?.trim()) || ws.displayName;
  //             // @ts-ignore
  //             pref.original_name = ws.key;
  //             // @ts-ignore
  //             pref.color = tempColor;
  //             // @ts-ignore
  //             pref.todo_type = ws.todoType;
  //           });
  //         }
  //       });
  //       setIsColorPickerVisible(false);
  //     } catch (error) {
  //       console.error('Error saving workspace color:', error);
  //     }
  //   };
  //   const wsLocal = workspaces[selectedWorkspaceIndex];
  //   const canDelete = !!wsLocal && !wsLocal.builtin && !wsLocal.locked;

  //   return (
  //     <Modal
  //       visible={isColorPickerVisible}
  //       transparent={true}
  //       animationType="fade"
  //       onRequestClose={() => setIsColorPickerVisible(false)}
  //     >
  //       <TouchableWithoutFeedback onPress={() => setIsColorPickerVisible(false)}>
  //         <View style={styles.modalOverlay}>
  //           <TouchableWithoutFeedback>
  //             <View style={styles.colorPickerContainer}>
  //               {wsLocal && (
  //                 <TouchableOpacity
  //                   onPress={() => {
  //                     if (canDelete) {
  //                       setIsColorPickerVisible(false);
  //                       deleteWorkspace(selectedWorkspaceIndex);
  //                     } else {
  //                       Alert.alert('Not allowed', 'Personal and Work cannot be deleted.');
  //                     }
  //                   }}
  //                   style={{ position: 'absolute', top: 6, right: 6, padding: 6, zIndex: 2 }}
  //                   hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
  //                 >
  //                   <View style={{ width: 26, height: 26, justifyContent: 'center', alignItems: 'center' }}>
  //                     <Ionicons name="trash-outline" size={24} color={canDelete ? '#FF3B30' : (wsLocal.locked ? '#9ca3af' : '#9ca3af')} />
  //                     {!canDelete && !wsLocal.locked && (
  //                       <View
  //                         style={{
  //                           position: 'absolute',
  //                           width: 20,
  //                           height: 2,
  //                           backgroundColor: '#9ca3af',
  //                           transform: [{ rotate: '45deg' }],
  //                         }}
  //                       />
  //                     )}
  //                     {wsLocal.locked && (
  //                       <View
  //                         style={{
  //                           position: 'absolute',
  //                           width: 20,
  //                           height: 2,
  //                           backgroundColor: '#9ca3af',
  //                           transform: [{ rotate: '45deg' }],
  //                         }}
  //                       />
  //                     )}
  //                   </View>
  //                 </TouchableOpacity>
  //               )}
  //               {workspaces[selectedWorkspaceIndex] && (workspaces[selectedWorkspaceIndex].locked ? (
  //                 <View style={{ height: 0 }} />
  //               ) : (
  //                 <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, alignSelf: 'stretch', paddingRight: 34 }}>
  //                   <TextInput
  //                     value={tempName}
  //                     onChangeText={setTempName}
  //                     placeholder="Workspace name"
  //                     style={{ flex: 1, backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, color: '#175857', borderWidth: 1, borderColor: '#d1d5db' }}
  //                     returnKeyType="done"
  //                   />
  //                 </View>
  //               ))}
  //               <Text style={styles.colorPickerTitle}>
  //                 Choose color
  //               </Text>
  //               <ColorPicker
  //                 style={{ width: '100%' }}
  //                 value={tempColor}
  //                 onComplete={handleColorChange}
  //                 onChange={handleColorChange}
  //                 sliderThickness={25}
  //               >
  //                 <Preview hideInitialColor />
  //                 <View className='p-2'>
  //                   <Swatches
  //                     style={{ marginTop: 8, maxHeight: 100 }}
  //                     swatchStyle={{ width: 26, height: 26, borderRadius: 16, marginHorizontal: 4 }}
  //                     colors={[
  //                       '#22AB93',
  //                       '#A2FDFF',
  //                       '#FFC4C4',
  //                       '#889AFC',
  //                       '#FFEB80',
  //                       '#FFC2DC',
  //                       '#D7AFFF'
  //                     ]}
  //                   />
  //                 </View>
  //               </ColorPicker>
  //               <View style={styles.colorPickerButtonContainer}>
  //                 <TouchableOpacity
  //                   style={[styles.colorPickerButton, styles.colorPickerButtonCancel]}
  //                   onPress={handleCancel}
  //                 >
  //                   <Text style={styles.colorPickerButtonText}>Cancel</Text>
  //                 </TouchableOpacity>
  //                 <TouchableOpacity
  //                   style={styles.colorPickerButton}
  //                   onPress={handleDone}
  //                 >
  //                   <Text style={styles.colorPickerButtonText}>Done</Text>
  //                 </TouchableOpacity>
  //               </View>
  //             </View>
  //           </TouchableWithoutFeedback>
  //         </View>
  //       </TouchableWithoutFeedback>
  //     </Modal>
  //   );
  // }, [isColorPickerVisible, selectedWorkspaceIndex, tempColor, tempName, workspaces, database]);

  const handleSelectTodoType = useCallback(async (newType: 'basic' | 'progress' | 'slider') => {
    const ws = workspaces[currentWorkspace];
    if (!ws || ws.locked) {
      setIsOptionsMenuVisible(false);
      return;
    }
    const workspace = ws.key;
    const oldType = workspaceTodoTypes[workspace] || 'basic';

    if (newType === oldType) {
      setIsOptionsMenuVisible(false);
      return;
    }

    setSelectedTodoType(newType);
    setWorkspaceTodoTypes(prev => ({ ...prev, [workspace]: newType }));

    // Optimistically update the UI
    setLocalTodos(prevTodos =>
      prevTodos.map(todo => {
        if (todo.workspace === workspace && !todo.completed) {
          const newTodoState: TodoItem = { ...todo, type: newType };

          // Convert state between types without losing data
          if (newType === 'progress') {
            // To Progress: if slider has progress, mark as started
            if (todo.progress && todo.progress > 0 && !todo.startedAt) {
              newTodoState.startedAt = new Date();
            }
          } else if (newType === 'slider') {
            // To Slider: if marked as started in progress, set slider to "started"
            if (todo.startedAt && (!todo.progress || todo.progress < 0.1)) {
              newTodoState.progress = 0.1;
            } else if (!todo.startedAt) {
              newTodoState.progress = todo.progress || 0;
            }
          }
          // When switching to 'basic', we don't change anything to preserve state.
          return newTodoState;
        }
        return todo;
      })
    );

    setIsOptionsMenuVisible(false);

    try {
      await database.write(async () => {
        // Update preference
        const prefCollection = database.collections.get<UserPreferenceModel>('user_preferences');
        const existingPref = await prefCollection.query(Q.where('workspace_name', workspace)).fetch();

        if (existingPref.length > 0) {
          await existingPref[0].update(pref => {
            // @ts-ignore
            pref.todo_type = newType;
          });
        } else {
          await prefCollection.create(pref => {
            pref.workspace_name = workspace;
            // @ts-ignore
            pref.display_name = ws.displayName;
            // @ts-ignore
            pref.original_name = ws.originalName;
            pref.color = workspaceColors[currentWorkspace] || ws.color;
            // @ts-ignore
            pref.todo_type = newType;
          });
        }

        // Update existing todos
        const todosToUpdate = await database.collections.get<TodoModel>('todos')
          .query(
            Q.where('workspace', workspace)
          ).fetch();

        for (const todo of todosToUpdate) {
          await todo.update(t => {
            // @ts-ignore
            t.type = newType;

            // Conversion logic without destroying state
            if (newType === 'progress') {
              // To Progress: if slider has progress, mark as started
              // @ts-ignore
              if (t.progress > 0 && !t.startedAt) {
                t.startedAt = new Date();
              }
            } else if (newType === 'slider') {
              // To Slider: if marked as started in progress, set slider to "started"
              // @ts-ignore
              if (t.startedAt && (!t.progress || t.progress < 0.1)) {
                // @ts-ignore
                t.progress = 0.1;
              } else if (!t.startedAt) {
                // @ts-ignore
                t.progress = t.progress || 0;
              }
            }
            // When switching to 'basic', we don't change anything to preserve state.
          });
        }
      });
    } catch (error) {
      console.error('Error saving todo type preference and updating todos:', error);
    }
  }, [currentWorkspace, workspaceColors, workspaceTodoTypes]);

  const currentWs = workspaces[currentWorkspace];
  const canEditCurrent = !!currentWs && !currentWs.locked;

  const OptionsMenuModal = useMemo(() => {
    const theme = getTheme(workspaceColors[currentWorkspace]);
    const hexToRgba = (hex: string, opacity: number) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${opacity})` : hex;
    };
    const darkenColor = (hex: string, amount: number) => {
      let color = hex.indexOf('#') === 0 ? hex.substring(1) : hex;
      let r = parseInt(color.substring(0, 2), 16);
      let g = parseInt(color.substring(2, 4), 16);
      let b = parseInt(color.substring(4, 6), 16);
      r = Math.max(0, Math.floor(r * (1 - amount)));
      g = Math.max(0, Math.floor(g * (1 - amount)));
      b = Math.max(0, Math.floor(b * (1 - amount)));
      const rr = (r.toString(16).length === 1) ? "0" + r.toString(16) : r.toString(16);
      const gg = (g.toString(16).length === 1) ? "0" + g.toString(16) : g.toString(16);
      const bb = (b.toString(16).length === 1) ? "0" + b.toString(16) : b.toString(16);
      return "#" + rr + gg + bb;
    };

    const modalBg = hexToRgba(theme.overallBg, 0.9);
    const darkerBase = darkenColor(theme.workspaceNameColor, 0.4);
    const activeColor = darkerBase;
    const inactiveColor = hexToRgba(darkerBase, 0.5);

    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={isOptionsMenuVisible}
        onRequestClose={() => setIsOptionsMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsOptionsMenuVisible(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-start', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: modalBg,
                borderRadius: 20,
                marginTop: 50,
                width: '90%',
                padding: 20,
                height: 480,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: activeColor }}>To Do Options</Text>
                  <TouchableOpacity onPress={() => setIsOptionsMenuVisible(false)} style={{ position: 'absolute', right: 0, top: -5 }}>
                    <Text style={{ fontSize: 32, fontWeight: 'bold', color: activeColor }}>×</Text>
                  </TouchableOpacity>
                </View>

                {canEditCurrent ? (
                  <></>
                ) : (
                  <Text style={{ color: activeColor, marginBottom: 15 }}>Wishlist cannot be edited</Text>
                )}

                <TouchableOpacity onPress={() => handleSelectTodoType('basic')} style={{ paddingLeft: 15, marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: selectedTodoType === 'basic' ? 'bold' : 'normal', color: selectedTodoType === 'basic' ? activeColor : inactiveColor }}>Basic</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleSelectTodoType('progress')} style={{ paddingLeft: 15, marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: selectedTodoType === 'progress' ? 'bold' : 'normal', color: selectedTodoType === 'progress' ? activeColor : inactiveColor }}>Progress</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleSelectTodoType('slider')} style={{ paddingLeft: 15, marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: selectedTodoType === 'slider' ? 'bold' : 'normal', color: selectedTodoType === 'slider' ? activeColor : inactiveColor }}>Slider</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    )
  }, [isOptionsMenuVisible, selectedTodoType, handleSelectTodoType, currentWorkspace, workspaceColors]);


  const openAmazonLink = async (amazonUrl: string) => {
    const asinMatch = amazonUrl.match(/\/dp\/([A-Z0-9]{10})/);
    const asin = asinMatch ? asinMatch[1] : null;

    if (!asin) {
      console.error('Invalid Amazon URL:', amazonUrl);
      Alert.alert('Error', 'Invalid Amazon product URL');
      return;
    }

    const amazonAppUrls = [
      `com.amazon.mobile.shopping://www.amazon.com.au/products/${asin}/`,
      // `amzn://apps/android?p=${asin}`,
      // `amazon://www.amazon.com.au/dp/${asin}`
    ];
    const amazonWebUrl = `https://www.amazon.com.au/dp/${asin}`;

    for (const appUrl of amazonAppUrls) {
      try {
        const supported = await Linking.canOpenURL(appUrl);
        console.log(`Can open Amazon app URL (${appUrl}):`, supported);

        if (supported) {
          console.log('Attempting to open app URL:', appUrl);
          await Linking.openURL(appUrl);
          return; // Exit the function if successful
        }
      } catch (error) {
        console.error(`Error opening Amazon app URL (${appUrl}):`, error);
      }
    }

    // If none of the app URLs worked, try the web URL
    try {
      console.log('Attempting to open web URL:', amazonWebUrl);
      await Linking.openURL(amazonWebUrl);
    } catch (webError) {
      console.error('Error opening web URL:', webError);
      Alert.alert('Error', 'Unable to open Amazon. Please try again.');
    }
  };


  const bottomSheetRef = useRef<ActionSheetRef>(null);
  const longPressSheetRef = useRef<ActionSheetRef>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const micWorkspaceIndexRef = useRef<number | null>(null);


  const router = useRouter();

  const [currentSnapPoint, setCurrentSnapPoint] = useState(0);

  const [expandedSections, setExpandedSections] = useState<Record<string, Record<TodoSectionKey, boolean>>>({});

  const defaultExpanded: Record<TodoSectionKey, boolean> = {
    today: true,
    upcoming: false,
    past: false,
    completed: false,
    wishlist: true,
    thisWeek: true,
    thisMonth: false,
    thisYear: false,
    longTerm: false,
  };
  const getExpandedState = useCallback((workspaceKey: string) =>
    expandedSections[workspaceKey] || defaultExpanded, [expandedSections]);

  // const [showTimePicker, setShowTimePicker] = useState(false);

  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null);
  // const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);

  const updateTodoStateEverywhere = useCallback((todoId: string, patch: Partial<TodoItem>) => {
    setLocalTodos((prevTodos) =>
      prevTodos.map((todo) => (todo.id === todoId ? { ...todo, ...patch } : todo))
    );
    setSelectedTodo((prevTodo) =>
      prevTodo?.id === todoId ? { ...prevTodo, ...patch } : prevTodo
    );
    setSelectedTodoForDetails((prevTodo) =>
      prevTodo?.id === todoId ? { ...prevTodo, ...patch } : prevTodo
    );
  }, []);

  const {
    inputValue,
    setInputValue,
    submit,
    submitText,
    isRunning: isAiRunning,
    notice: aiNotice,
    dismissNotice,
    confirmPendingAction,
    cancelPending,
    getHandoffChatParams,
  } = useCompactTabAI('todo', {
    onMutationSuccess: async ({ name, result }) => {
      if (name === 'todo_create_many') {
        const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
        if (createdItems.length) {
          setLocalTodos((current) => {
            const next = [
              ...current.filter((todo) => !createdItems.some((item: any) => String(item?.id || '') === todo.id)),
              ...createdItems.map((item: any) => ({
                id: String(item?.id || ''),
                text: String(item?.text || ''),
                completed: false,
                details: '',
                dueDate: item?.dueDate ? new Date(item.dueDate) : undefined,
                hasDueTime: typeof item?.hasDueTime === 'boolean' ? item.hasDueTime : false,
                starred: !!item?.starred,
                workspace: typeof item?.workspace === 'string' ? item.workspace : 'Personal',
                type: 'basic' as const,
                reminderEnabled: false,
                reminderMode: 'none' as TodoReminderMode,
                reminderMinutesBefore: null,
                notificationId: null,
              })),
            ];
            localTodosRef.current = next;
            return next;
          });
        }
      }

      if (name === 'todo_edit_many') {
        const updatedItems = Array.isArray(result?.updatedItems) ? result.updatedItems : [];
        if (updatedItems.length) {
          setLocalTodos((current) => {
            const next = current.map((todo) => {
              const match = updatedItems.find((item: any) => String(item?.id || '') === todo.id);
              if (!match) return todo;
              return {
                ...todo,
                text: String(match?.newText || todo.text),
                dueDate: match?.dueDate ? new Date(match.dueDate) : todo.dueDate,
                hasDueTime: typeof match?.hasDueTime === 'boolean' ? match.hasDueTime : todo.hasDueTime,
                starred: typeof match?.starred === 'boolean' ? match.starred : todo.starred,
                workspace: typeof match?.workspace === 'string' ? match.workspace : todo.workspace,
              };
            });
            localTodosRef.current = next;
            return next;
          });
        }
      }

      if (name === 'todo_delete_many' || name === 'todo_delete_by_day_except') {
        const deletedItems = Array.isArray(result?.deletedItems) ? result.deletedItems : [];
        if (deletedItems.length) {
          const deletedIds = new Set(deletedItems.map((item: any) => String(item?.id || '')).filter(Boolean));
          setLocalTodos((current) => {
            const next = current.filter((todo) => !deletedIds.has(todo.id));
            localTodosRef.current = next;
            return next;
          });
        }
      }
    },
  });
  const {
    isListening,
    microphoneColor,
    handleMicrophonePress: handleCompactVoiceMicrophonePress,
    cancelListening: cancelCompactVoiceListening,
  } = useCompactVoiceInput({
    inputValue,
    setInputValue,
    glowAnim,
    onFinalTranscript: submitText,
  });

  const handleMicrophonePress = useCallback(() => {
    micWorkspaceIndexRef.current = currentWorkspaceRef.current;
    setShowSpeechOverlay(false);
    setSpeechOverlayText('');
    handleCompactVoiceMicrophonePress();
  }, [handleCompactVoiceMicrophonePress]);

  useEffect(() => {
    const replyNotice =
      aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? aiNotice : null;

    if (!replyNotice || isAiRunning) {
      const shouldCancelReplyMic = autoReplyMicNoticeRef.current !== null;
      autoReplyMicNoticeRef.current = null;
      if (shouldCancelReplyMic && isListening) {
        void cancelCompactVoiceListening();
      }
      return;
    }

    if (autoReplyMicNoticeRef.current === replyNotice || isListening) {
      return;
    }

    autoReplyMicNoticeRef.current = replyNotice;
    handleMicrophonePress();
  }, [aiNotice, cancelCompactVoiceListening, handleMicrophonePress, isAiRunning, isListening]);

  // Auto-hide overlay after processing completes and we're no longer listening
  useEffect(() => {
    if (!isProcessing && !isListening) {
      setShowSpeechOverlay(false);
      setSpeechOverlayText('');
    }
  }, [isProcessing, isListening]);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event: any) => {
      setIsKeyboardVisible(true);
      if (Platform.OS !== 'ios') return;
      const keyboardHeight = event?.endCoordinates?.height || 0;
      const nextOffset = Math.max(0, keyboardHeight - aiInputBottom);
      Animated.timing(keyboardOffset, {
        toValue: nextOffset,
        duration: event?.duration || 250,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (event: any) => {
      setIsKeyboardVisible(false);
      setIsAiInputFocused(false);
      inputRef.current?.blur();
      if (Platform.OS !== 'ios') return;
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: event?.duration || 250,
        useNativeDriver: true,
      }).start();
    };
    const subShow = Keyboard.addListener(show, onShow);
    const subHide = Keyboard.addListener(hide, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [aiInputBottom, keyboardOffset]);

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    const todoTabTint = workspaces[currentWorkspace]?.key === 'Wishlist' ? '#31C5CC' : '#258876';

    parent.setOptions({
      tabBarActiveTintColor: todoTabTint,
      tabBarInactiveTintColor: todoTabTint,
      tabBarStyle: {
        position: 'absolute',
        left: 28,
        right: 28,
        bottom: Platform.OS === 'android' ? 10 : 8,
        height: 56,
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
        display: isAiComposerActive ? 'none' : 'flex',
      },
    });

    return () => {
      parent.setOptions({
        tabBarActiveTintColor: '#258876',
        tabBarInactiveTintColor: '#258876',
        tabBarStyle: {
          position: 'absolute',
          left: 28,
          right: 28,
          bottom: Platform.OS === 'android' ? 10 : 8,
          height: 56,
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
          display: 'flex',
        },
      });
    };
  }, [currentWorkspace, isAiComposerActive, navigation, workspaces]);

  const handleLongPress = useCallback((todo: TodoItem) => {
    setSelectedTodo(todo);
    longPressSheetRef?.current?.show()
  }, []);

  const handleMoveToCalendar = useCallback(async (todoToMove?: TodoItem) => {
    const todoForCalendar = todoToMove || selectedTodo;
    if (todoForCalendar) {
      const startDate = todoForCalendar.dueDate || new Date();
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);

      try {
        await database.write(async () => {
          const eventsCollection = database.get<EventModel>('events');
          await eventsCollection.create((event) => {
            event.title = todoForCalendar.text;
            event.startDate = startDate;
            event.startTime = startDate.getHours();
            event.endDate = endDate;
            event.endTime = endDate.getHours();
            // event.details = selectedTodo.details || '';
            event.isGoogleEvent = false;
            event.isTodo = true;
          });
        });

        bottomSheetRef.current?.hide();

        // Navigate to the calendar screen
        router.push('/(tabs)/calendar');
      } catch (error) {
        console.error('Error moving todo to calendar:', error);
      }
    }
  }, [selectedTodo, router]);

  const handleDeleteTodo = async () => {
    if (selectedTodo) {
      try {
        await deleteTodo(selectedTodo.id);
        await refreshLocalTodos();
      } catch (error) {
        console.error('Error deleting todo:', error);
      } finally {
        if (selectedTodoForDetails) {
          handleCloseDetailsModal();
        }
        longPressSheetRef.current?.hide();
      }
    }
    bottomSheetRef.current?.hide();
  };

  const handleEditTodo = useCallback(() => {
    // Implement the logic to edit the todo
    if (!selectedTodo) return;
    console.log('Edit todo:', selectedTodo);
    bottomSheetRef.current?.hide();
    handleTodoPress(selectedTodo);
  }, [selectedTodo]);


  const handleToggleStarred = async () => {
    let toBeStarttedTodo = selectedTodo || selectedTodoForDetails;
    if (toBeStarttedTodo) {
      try {
        // Update local state immediately
        const nextStarred = !toBeStarttedTodo.starred;
        updateTodoStateEverywhere(toBeStarttedTodo.id, { starred: nextStarred });
        await updateTodo(toBeStarttedTodo.id, { starred: nextStarred });
      } catch (error) {
        console.error('Error toggling starred status:', error);
        updateTodoStateEverywhere(toBeStarttedTodo.id, { starred: !!toBeStarttedTodo.starred });
      }
    }
    bottomSheetRef.current?.hide();
  };


  const toggleSection = useCallback((section: TodoSectionKey, workspaceKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [workspaceKey]: {
        ...(prev[workspaceKey] || defaultExpanded),
        [section]: !(prev[workspaceKey]?.[section] ?? defaultExpanded[section])
      }
    }));
  }, []);

  const sortedTodos = useMemo(() => {
    return localTodos.reduce((acc, todo) => {
      let category: TodoSectionKey;

      if (todo.completed) {
        category = 'completed';
      } else if (todo.workspace === 'Goals') {
        const now = new Date();
        const dueDate = todo.dueDate ? startOfDay(todo.dueDate) : startOfDay(now);
        const weekStart = startOfWeek(now, { weekStartsOn });
        const weekEnd = endOfDay(endOfWeek(now, { weekStartsOn }));
        const monthStart = startOfMonth(now);
        const monthEnd = endOfDay(endOfMonth(now));
        const yearEnd = endOfDay(endOfYear(now));

        if (dueDate >= weekStart && dueDate <= weekEnd) {
          category = 'thisWeek';
        } else if (dueDate >= monthStart && dueDate <= monthEnd) {
          category = 'thisMonth';
        } else if (dueDate > yearEnd) {
          category = 'longTerm';
        } else {
          category = 'thisYear';
        }
      } else {
        category = todo.dueDate
          ? (isToday(todo.dueDate) ? 'today' : (isPast(endOfDay(todo.dueDate)) ? 'past' : 'upcoming'))
          : 'today';
      }

      acc[category].push({ ...todo, workspace: todo.workspace || workspaces[currentWorkspace]?.key });
      return acc;
    }, {
      today: [],
      upcoming: [],
      past: [],
      completed: [],
      wishlist: [],
      thisWeek: [],
      thisMonth: [],
      thisYear: [],
      longTerm: [],
    } as Record<TodoSectionKey, (TodoItem & { workspace: string })[]>);
  }, [currentWorkspace, localTodos, weekStartsOn]);


  const addTodo = useCallback((workspace: string, sectionKey?: GoalSectionKey) => {
    const nextInitialTodo: Partial<TodoItem> = { workspace, hasDueTime: false };

    if (workspace === 'Goals' && sectionKey) {
      nextInitialTodo.dueDate = getGoalDefaultDueDate(sectionKey, new Date(), weekStartsOn);
    }

    setComposerInitialTodo(nextInitialTodo);
    setComposerKey((currentKey) => currentKey + 1);
    bottomSheetRef.current?.show();
  }, [weekStartsOn]);

  const saveTodo = useCallback(async (draft: Partial<TodoItem>) => {
    const parsedInput = parseTodoInput(draft.text || '', {
      now: new Date(),
      fallbackDate: draft.dueDate,
    });
    const todoText = parsedInput.cleanedText.trim();

    if (!todoText) {
      Alert.alert('Missing title', 'Add a task name before saving.');
      return;
    }

    try {
      const dueDate = parsedInput.dueDate
        || (draft.dueDate ? new Date(draft.dueDate) : startOfDay(new Date()));
      const hasDueTime = (parsedInput.matchedDate || parsedInput.matchedTime)
        ? parsedInput.hasDueTime
        : getTodoHasDueTime(draft.dueDate, draft.hasDueTime);
      const workspace = draft.workspace || workspaces[currentWorkspace]?.key || 'Personal';
      const result = await createTodo({
        text: todoText,
        completed: false,
        details: draft.details,
        dueDate,
        hasDueTime,
        starred: draft.starred || false,
        workspace,
        type: workspace === 'Wishlist' ? 'basic' : (workspaceTodoTypes[workspace] || 'basic'),
        progress: 0,
        isAmazonUrlLoaded: false,
        amazonUrlLoadAttempts: 0,
      });
      handleReminderResult(result.reminderStatus);

      await refreshLocalTodos();

      const workspaceKey = workspace;
      let sectionToExpand: TodoSectionKey = 'today';

      if (workspace === 'Goals') {
        const normalizedDueDate = startOfDay(dueDate);
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn });
        const weekEnd = endOfDay(endOfWeek(now, { weekStartsOn }));
        const monthStart = startOfMonth(now);
        const monthEnd = endOfDay(endOfMonth(now));
        const yearEnd = endOfDay(endOfYear(now));

        if (normalizedDueDate >= weekStart && normalizedDueDate <= weekEnd) {
          sectionToExpand = 'thisWeek';
        } else if (normalizedDueDate >= monthStart && normalizedDueDate <= monthEnd) {
          sectionToExpand = 'thisMonth';
        } else if (normalizedDueDate > yearEnd) {
          sectionToExpand = 'longTerm';
        } else {
          sectionToExpand = 'thisYear';
        }
      } else if (isToday(dueDate)) {
        sectionToExpand = 'today';
      } else if (isPast(endOfDay(dueDate))) {
        sectionToExpand = 'past';
      } else {
        sectionToExpand = 'upcoming';
      }

      setExpandedSections(prev => ({
        ...prev,
        [workspaceKey]: {
          ...(prev[workspaceKey] || defaultExpanded),
          [sectionToExpand]: true
        }
      }));


      bottomSheetRef.current?.hide();
      Keyboard.dismiss();

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error saving todo:', error);
    }
  }, [currentWorkspace, fadeAnim, handleReminderResult, refreshLocalTodos, weekStartsOn, workspaceTodoTypes, workspaces]);

  const toggleTodo = async (id: string) => {
    setCompletingTodoId(id);

    const todoToToggle = localTodos.find(t => t.id === id);
    if (!todoToToggle) return;

    const isCompleting = !todoToToggle.completed;

    const newState = {
      isFaded: isCompleting,
      isTranslated: isCompleting,
    };

    Animated.parallel([
      Animated.timing(animationsRef.current.fadeAnims[id], {
        toValue: isCompleting ? 0.6 : 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(animationsRef.current.translateXAnims[id], {
        toValue: isCompleting ? 20 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    animationsRef.current.animationStates[id] = newState;


    // Wait for the animation to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    const isBeingUncompleted = todoToToggle.completed;
    const workspace = todoToToggle.workspace || workspaces[currentWorkspace]?.key;
    const currentWorkspaceType = workspaceTodoTypes[workspace] || 'basic';


    try {
      // Update local state immediately
      setLocalTodos(prevTodos =>
        prevTodos.map(todo => {
          if (todo.id === id) {
            const updatedTodo = { ...todo, completed: !todo.completed };
            if (isBeingUncompleted) {
              updatedTodo.progress = 0;
              updatedTodo.startedAt = undefined;
              updatedTodo.type = currentWorkspaceType;
            }
            return updatedTodo;
          }
          return todo;
        })
      );

      const result = await updateTodo(
        id,
        {
          completed: !todoToToggle.completed,
          progress: isBeingUncompleted ? 0 : undefined,
          startedAt: isBeingUncompleted ? null : undefined,
          type: isBeingUncompleted ? currentWorkspaceType : undefined,
        },
        {
          syncReminder: true,
        }
      );
      handleReminderResult(result.reminderStatus);

      const completedTodo = localTodos.find(todo => todo.id === id);
      if (completedTodo && !completedTodo.completed) {
        const wsKey = completedTodo.workspace || workspaces[currentWorkspace]?.key || 'Personal';
        setExpandedSections(prev => ({
          ...prev,
          [wsKey]: {
            ...(prev[wsKey] || defaultExpanded),
            completed: true
          }
        }));
      }

    } catch (error) {
      console.error('Error toggling todo:', error);
      // Revert local state if database update fails
      setLocalTodos(prevTodos =>
        prevTodos.map(todo =>
          todo.id === id ? todoToToggle : todo
        )
      );
    } finally {
      setCompletingTodoId(null);
    }
  };

  const activeTodos = localTodos.filter((todo) => !todo.completed);
  const completedTodos = localTodos.filter((todo) => todo.completed);

  const sortedActiveTodos = activeTodos.sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  const formatDueDate = (
    date?: Date,
    hasDueTime?: boolean,
    sectionKey?: TodoSectionKey
  ) => {
    if (!date) return '';
    const showTime = getTodoHasDueTime(date, hasDueTime);
    if (isToday(date)) {
      if (sectionKey === 'today') {
        return showTime ? format(date, 'h:mm a') : '';
      }
      return showTime ? format(date, 'h:mm a') : 'Today';
    }
    if (isTomorrow(date)) return showTime ? `Tomorrow ${format(date, 'h:mm a')}` : 'Tomorrow';
    if (isYesterday(date)) return showTime ? `Yesterday ${format(date, 'h:mm a')}` : 'Yesterday';
    return showTime ? format(date, 'MMM d, h:mm a') : format(date, 'MMM d');
  };

  const pagerViewRef = useRef<PagerView>(null);

  const handleDotPress = (index: number) => {
    if (pagerViewRef.current) {
      pagerViewRef.current.setPage(index);
    }
    animateWorkspaceChange(index);
  };

  // const handleAddAllToCart = async () => {
  //   const wishlistItems = localTodos.filter(todo => todo.workspace === 'Wishlist' && todo.amazonUrl);
  //   const itemLinks = wishlistItems.map(item => item.amazonUrl).filter(Boolean) as string[];

  //   if (itemLinks.length === 0) {
  //     Alert.alert('No items', 'There are no items with Amazon links in your wishlist.');
  //     return;
  //   }

  //   setIsAddingToCart(true);
  //   setAddToCartSuccess(false);

  //   try {
  //     const response = await axios.post('https://170.64.200.117.nip.io/start_session', {
  //       identifier: '6361765068',
  //       password: 'none',
  //       item_links: itemLinks
  //     });

  //     if (response.status === 200) {
  //       setAddToCartSuccess(true);
  //       setTimeout(() => {
  //         setAddToCartSuccess(false);
  //       }, 3000);
  //     } else {
  //       Alert.alert('Error', 'Failed to add items to your Amazon cart. Please try again.');
  //     }
  //   } catch (error) {
  //     console.error('Error adding items to cart:', error);
  //     Alert.alert('Error', 'An error occurred while adding items to your Amazon cart. Please try again.');
  //   } finally {
  //     setIsAddingToCart(false);
  //   }
  // };


  // const handleGoToCart = async () => {
  //   const amazonAppUrls = [
  //     `com.amazon.mobile.shopping://www.amazon.com.au/gp/aw/c?ref_=navm_hdr_cart`
  //   ];
  //   const amazonWebUrl = 'https://www.amazon.com.au/gp/cart/view.html';

  //   for (const appUrl of amazonAppUrls) {
  //     try {
  //       const supported = await Linking.canOpenURL(appUrl);
  //       console.log(`Can open Amazon app URL (${appUrl}):`, supported);

  //       if (supported) {
  //         console.log('Attempting to open app URL:', appUrl);
  //         await Linking.openURL(appUrl);
  //         return;
  //       }
  //     } catch (error) {
  //       console.error(`Error opening Amazon app URL (${appUrl}):`, error);
  //     }
  //   }

  //   try {
  //     console.log('Attempting to open web URL:', amazonWebUrl);
  //     await Linking.openURL(amazonWebUrl);
  //   } catch (webError) {
  //     console.error('Error opening web URL:', webError);
  //     Alert.alert('Error', 'Unable to open Amazon cart. Please try manually.');
  //   }
  // };


  const saveDetails = useCallback(async (todoId: string, details: string) => {
    try {
      await updateTodo(todoId, { details });
      updateTodoStateEverywhere(todoId, { details });
    } catch (error) {
      console.error('Error saving todo details:', error);
    }
  }, [updateTodoStateEverywhere]);


  const debouncedSaveDetails = useMemo(
    () => debounce(saveDetails, 1000),
    [saveDetails]
  );

  useEffect(() => {
    if (selectedTodoForDetails) {
      debouncedSaveDetails(selectedTodoForDetails.id, editedTodoDetails);
    }
    return () => {
      debouncedSaveDetails.cancel();
    };
  }, [selectedTodoForDetails, editedTodoDetails, debouncedSaveDetails]);

  const saveTodoTimeFromDetails = useCallback(async (nextDate: Date, nextHasDueTime: boolean) => {
    if (!selectedTodoForDetails) {
      return;
    }

    try {
      const result = await updateTodo(
        selectedTodoForDetails.id,
        {
          dueDate: nextDate,
          hasDueTime: nextHasDueTime,
        },
        {
          applyDefaultReminderWhenTimingAdded: true,
          syncReminder: true,
        }
      );

      updateTodoStateEverywhere(selectedTodoForDetails.id, {
        dueDate: result.todo.dueDate,
        hasDueTime: result.todo.hasDueTime,
        reminderEnabled: result.todo.reminderEnabled,
        reminderMode: result.todo.reminderMode || 'none',
        reminderMinutesBefore: result.todo.reminderMinutesBefore,
        notificationId: result.todo.notificationId ?? null,
      });
      handleReminderResult(result.reminderStatus);
    } catch (error) {
      console.error('Error saving todo time:', error);
    }
  }, [handleReminderResult, selectedTodoForDetails, updateTodoStateEverywhere]);

  const handleOpenDetailsTimePicker = useCallback(() => {
    if (!selectedTodoForDetails || isDetailsTimePickerVisible) {
      return;
    }

    const nextTime = getTodoHasDueTime(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime)
      ? new Date(selectedTodoForDetails.dueDate || new Date())
      : getNextHalfHourTime(selectedTodoForDetails.dueDate);

    pendingDetailsTimeRef.current = nextTime;
    setPendingDetailsTime(nextTime);
    setIsDetailsTimePickerVisible(true);
  }, [isDetailsTimePickerVisible, selectedTodoForDetails]);

  const confirmDetailsTimeRef = useRef<() => void>(() => {});

  const handleDetailsTimeChange = useCallback((
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (event.type === 'dismissed') {
      setIsDetailsTimePickerVisible(false);
      return;
    }

    if (selectedDate) {
      pendingDetailsTimeRef.current = selectedDate;
    }

    if (Platform.OS === 'android' && event.type === 'set') {
      confirmDetailsTimeRef.current();
    }
  }, []);

  const handleConfirmDetailsTime = useCallback(async () => {
    if (!selectedTodoForDetails) {
      return;
    }

    const picked = pendingDetailsTimeRef.current;
    const nextDate = selectedTodoForDetails.dueDate
      ? new Date(selectedTodoForDetails.dueDate)
      : startOfDay(new Date());
    nextDate.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setIsDetailsTimePickerVisible(false);
    await saveTodoTimeFromDetails(nextDate, true);
  }, [saveTodoTimeFromDetails, selectedTodoForDetails]);

  confirmDetailsTimeRef.current = handleConfirmDetailsTime;

  const handleDismissDetailsTimePicker = useCallback(() => {
    void handleConfirmDetailsTime();
  }, [handleConfirmDetailsTime]);

  const handleClearDetailsTime = useCallback(async () => {
    if (!selectedTodoForDetails) {
      return;
    }

    const nextDate = selectedTodoForDetails.dueDate
      ? new Date(selectedTodoForDetails.dueDate)
      : startOfDay(new Date());
    nextDate.setHours(0, 0, 0, 0);
    setIsDetailsTimePickerVisible(false);
    await saveTodoTimeFromDetails(nextDate, false);
  }, [saveTodoTimeFromDetails, selectedTodoForDetails]);

  const saveTodoReminderFromDetails = useCallback(async (
    reminderMode: TodoReminderMode,
    reminderMinutesBefore: number | null
  ) => {
    if (!selectedTodoForDetails) {
      return;
    }

    const normalized = normalizeTodoReminderState(
      {
        reminderEnabled: reminderMode !== 'none',
        reminderMode,
        reminderMinutesBefore,
      },
      selectedTodoForDetails.hasDueTime
    );

    try {
      const result = await updateTodo(
        selectedTodoForDetails.id,
        {
          reminderEnabled: normalized.reminderEnabled,
          reminderMode: normalized.reminderMode,
          reminderMinutesBefore: normalized.reminderMinutesBefore,
        },
        {
          syncReminder: true,
        }
      );

      updateTodoStateEverywhere(selectedTodoForDetails.id, {
        reminderEnabled: result.todo.reminderEnabled,
        reminderMode: result.todo.reminderMode || 'none',
        reminderMinutesBefore: result.todo.reminderMinutesBefore,
        notificationId: result.todo.notificationId ?? null,
      });
      handleReminderResult(result.reminderStatus);
    } catch (error) {
      console.error('Error saving todo reminder:', error);
    }
  }, [handleReminderResult, selectedTodoForDetails, updateTodoStateEverywhere]);

  const handleOpenCustomReminder = useCallback(() => {
    if (!selectedTodoForDetails) {
      return;
    }

    const seedMinutes = selectedTodoForDetails.reminderMode === 'custom'
      ? selectedTodoForDetails.reminderMinutesBefore
      : undefined;
    const parts = splitCustomReminderMinutes(seedMinutes);
    setCustomReminderDays(parts.days);
    setCustomReminderHours(parts.hours);
    setCustomReminderMinutes(parts.minutes);
    setIsCustomReminderModalVisible(true);
  }, [selectedTodoForDetails]);

  const handleSelectReminderOption = useCallback(async (
    option: typeof reminderOptions[number]
  ) => {
    setIsReminderModalVisible(false);
    if (option.key === 'custom') {
      handleOpenCustomReminder();
      return;
    }

    await saveTodoReminderFromDetails(option.mode, option.minutes);
  }, [handleOpenCustomReminder, saveTodoReminderFromDetails]);

  const handleSaveCustomReminder = useCallback(async () => {
    const totalMinutes = buildCustomReminderMinutes(
      customReminderDays,
      customReminderHours,
      customReminderMinutes
    );

    setIsCustomReminderModalVisible(false);

    if (totalMinutes === 0) {
      await saveTodoReminderFromDetails('on_time', 0);
      return;
    }

    await saveTodoReminderFromDetails('custom', totalMinutes);
  }, [customReminderDays, customReminderHours, customReminderMinutes, saveTodoReminderFromDetails]);

  const animateDetailsModal = useCallback((toValue: number, onComplete?: () => void) => {
    Animated.parallel([
      Animated.timing(detailsModalAnim, {
        toValue,
        duration: toValue === 1 ? 260 : 200,
        easing: toValue === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  }, [detailsModalAnim]);

  const handleTodoPress = useCallback((todo: TodoItem) => {
    setSelectedTodoForDetails(todo);
    setSelectedTodo(todo);
    setEditedTodoDetails(todo.details || '');
    setIsReminderModalVisible(false);
    setIsCustomReminderModalVisible(false);
    setIsDetailsTimePickerVisible(false);
    setIsDetailsModalVisible(true);
    detailsModalAnim.setValue(0);
    requestAnimationFrame(() => {
      animateDetailsModal(1);
    });
  }, [animateDetailsModal, detailsModalAnim]);

  const { preserveDetailsModal } = useGlobalSearchParams();

  const resetDetailsModalState = useCallback(() => {
    setIsDetailsModalVisible(false);
    setSelectedTodoForDetails(null);
    setSelectedTodo(null);
    setEditedTodoDetails('');
    setIsReminderModalVisible(false);
    setIsCustomReminderModalVisible(false);
    setIsDetailsTimePickerVisible(false);
    debouncedSaveDetails.flush();
  }, [debouncedSaveDetails]);

  const handleCloseDetailsModal = useCallback(() => {
    if (preserveDetailsModal === 'true') {
      return;
    }

    animateDetailsModal(0, resetDetailsModalState);
  }, [animateDetailsModal, preserveDetailsModal, resetDetailsModalState]);

  const handleToggleStarted = async (todoId: string) => {
    try {
      const todoToUpdate = localTodos.find(t => t.id === todoId);
      if (!todoToUpdate) return;

      const newStartedAt = todoToUpdate.startedAt ? undefined : new Date();

      setLocalTodos(prev => prev.map(t => t.id === todoId ? { ...t, startedAt: newStartedAt } : t));

      await updateTodo(todoId, { startedAt: newStartedAt ?? null });
    } catch (error) {
      console.error('Error toggling todo started state:', error);
    }
  };

  const handleFinishTodo = async (todoId: string) => {
    try {
      setLocalTodos(prev => prev.map(t =>
        t.id === todoId ? { ...t, completed: true } : t
      ));
      await updateTodo(todoId, { completed: true }, { syncReminder: true });
    } catch (error) {
      console.error('Error finishing todo:', error);
    }
  };

  const handleSliderChange = async (todoId: string, value: number) => {
    const todoToUpdate = localTodos.find(t => t.id === todoId);
    if (!todoToUpdate) return;

    const newStartedAt = value > 0 ? (todoToUpdate.startedAt || new Date()) : undefined;
    const wasCompleted = !!todoToUpdate.completed;
    const isNowCompleted = value >= 1;

    setLocalTodos(prevTodos =>
      prevTodos.map(t =>
        t.id === todoId ? { ...t, progress: value, startedAt: newStartedAt, completed: value >= 1 } : t
      )
    );
    try {
      const result = await updateTodo(
        todoId,
        {
          progress: value,
          startedAt: newStartedAt ?? null,
          completed: value >= 1,
        },
        {
          syncReminder: wasCompleted !== isNowCompleted,
        }
      );
      if (wasCompleted !== isNowCompleted) {
        handleReminderResult(result.reminderStatus);
      }
    } catch (error) {
      console.error('Error updating slider:', error);
    }
  };

  const renderTodoItem = useCallback((
    todo: TodoItem & { workspace: string },
    isInCompletedSection: boolean,
    sectionKey: TodoSectionKey,
    themeColor?: string
  ) => {
    const workspaceAppearance = getTodoWorkspaceAppearance(todo.workspace);
    const todoType = todo.workspace === 'Wishlist' ? 'basic' : (todo.type || workspaceTodoTypes[todo.workspace] || 'basic');
    const theme = getTheme(workspaceAppearance?.themeColor || themeColor);
    const dueDateLabel = formatDueDate(todo.dueDate, todo.hasDueTime, sectionKey);
    const isPastDueDate = !!todo.dueDate && isPast(todo.dueDate) && !isToday(todo.dueDate);

    if (todo.completed) {
      // Keep completed todos basic
    } else {
      switch (todoType) {
        case 'progress':
          return (
            <TouchableOpacity
              key={todo.id}
              onPress={() => handleTodoPress(todo)}
              onLongPress={() => handleLongPress(todo)}
              delayLongPress={500}
              activeOpacity={0.8}
            >
              <TodoCardSurface
                gradientColors={workspaceAppearance?.todoCardGradientColors || theme.todoCardGradientColors}
                strokeColor={workspaceAppearance?.todoCardStrokeColor || theme.todoCardStrokeColor}
              >
                <View className="flex-row items-center justify-between">
                  <TouchableOpacity
                    onPress={() => handleToggleStarted(todo.id)}
                    className="items-center -mt-2"
                  >
                    <Text className="text-[10px] text-[#A6A6A6] italic mb-1">Started</Text>
                    <View
                      className="w-5 h-5 rounded-full justify-center items-center"
                      style={{
                        backgroundColor: (todo.startedAt && !todo.completed) ? theme.progressStarted : theme.progressStartedInactive
                      }}
                    >
                    </View>
                  </TouchableOpacity>

                  <Text className="text-[15px] text-center flex-1 mx-4 mt-1" style={{ color: '#3A6860', fontWeight: '700' }}>{todo.text}</Text>

                  <TouchableOpacity
                    onPress={() => todo.startedAt && handleFinishTodo(todo.id)}
                    disabled={!todo.startedAt}
                    className="items-center -mt-2"
                  >
                    <Text className="text-[10px] text-[#A6A6A6] italic mb-1">Finished</Text>
                    <View
                      className="w-5 h-5 rounded-full"
                      style={{
                        backgroundColor: todo.completed ? theme.progressFinished : (theme.progressFinishedInactive || theme.progressStartedInactive)
                      }}
                    />
                  </TouchableOpacity>
                </View>
              </TodoCardSurface>
            </TouchableOpacity>
          );
        case 'slider':
          return (
            <SliderTodoItem
              key={todo.id}
              todo={todo}
              onSliderChange={handleSliderChange}
              handleTodoPress={handleTodoPress}
              handleLongPress={handleLongPress}
              themeColor={themeColor}
            />
          );
      }
    }

    // Basic Todo item
    const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [80, 0],
        extrapolate: 'clamp',
      });

      const opacity = progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
      });

      return (
        <View style={{ paddingHorizontal: 10 }}>
          <TouchableOpacity
            onPress={() => handleSwipeDelete(todo.id)}
            style={{ height: '100%' }}
          >
            <Animated.View
              style={[{
                backgroundColor: '#FF3B30',
                justifyContent: 'center',
                alignItems: 'center',
                width: 80,
                height: '85%',
                marginBottom: 10,
                borderRadius: 16,
                alignSelf: 'center',
                transform: [{ translateX }],
                opacity,
              }]}
            >
              <Ionicons name="trash-outline" size={20} color="white" />
              <Text style={styles.deleteText}>
                Delete
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      );
    };

    return (
      <Swipeable
        key={`swipeable-${todo.id}`}
        renderRightActions={(progress) => renderRightActions(progress)}
        rightThreshold={-120}
        friction={3}
        overshootFriction={20}
        useNativeAnimations
      >
        <TouchableOpacity
          key={todo.id}
          onPress={() => handleTodoPress(todo)}
          onLongPress={() => handleLongPress(todo)}
          delayLongPress={500}
          activeOpacity={0.8}
          className="overflow-hidden"
        >
          <Animated.View
            style={{
              opacity: animationsRef.current.fadeAnims[todo.id],
            }}
          >
            <TodoCardSurface
              gradientColors={workspaceAppearance?.todoCardGradientColors || theme.todoCardGradientColors}
              strokeColor={workspaceAppearance?.todoCardStrokeColor || theme.todoCardStrokeColor}
            >
              <View className={`flex-row items-center ${todo.completed && !isInCompletedSection ? 'opacity-60' : ''}`}>
                {todo.emailId && emailSenders[todo.emailId] && (
                  <Text className="text-xs text-gray-500 italic absolute top-1 left-4 bg-yellow-100 px-2 py-0.5 rounded">
                    Email - {emailSenders[todo.emailId]}
                  </Text>
                )}
                <TouchableOpacity onPress={() => toggleTodo(todo.id)} className="mr-2.5">
                  {todo.completed ? (
                    <Ionicons name="checkmark-circle" size={24} color="#4a4a4a" />
                  ) : (
                    <Image
                      source={require('../../../assets/images/todo-personal-button.png')}
                      style={{ width: 30, height: 30 }}
                    />
                  )}
                </TouchableOpacity>
                <View className="flex-1 justify-center">
                  <View className={`relative self-start ${todo.emailId && emailSenders[todo.emailId] ? 'pt-2' : ''}`}>
                    <Text
                      className={`text-[15px] text-justify ${todo.completed ? 'line-through text-gray-500' : ''}`}
                      style={!todo.completed ? { color: '#3A6860', fontWeight: '700' } : undefined}
                    >
                      {todo.text}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  {!!dueDateLabel && todo.workspace !== 'Wishlist' && (
                    <Text
                      className={`text-xs mr-2 ${isPastDueDate ? 'text-red-600 opacity-60' : ''}`}
                      style={!isPastDueDate ? { color: 'rgba(255,255,255,0.62)' } : undefined}
                    >
                      {dueDateLabel}
                    </Text>
                  )}
                  {todo.starred && <MaterialCommunityIcons name="hexagram" size={18} color="#FFD700" style={{ marginLeft: 8 }} />}
                  {todo.workspace === 'Wishlist' && todo.isAmazonUrlLoaded && (
                    <TouchableOpacity
                      onPress={() => handleBuyPress(todo as TodoModel)}
                      className="px-2.5 py-1 rounded ml-2.5 shadow"
                      style={{ backgroundColor: getTheme(themeColor).workspaceNameColor }}
                    >
                      <Text className="text-white text-xs font-bold">Buy</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TodoCardSurface>
          </Animated.View>
        </TouchableOpacity>
      </Swipeable>
    );
  }, [animationsRef, emailSenders, formatDueDate, handleBuyPress, handleLongPress, handleTodoPress, toggleTodo, workspaceTodoTypes]);


  const renderTodoSection = useCallback((title: string, todos: (TodoItem & { workspace: string })[], sectionKey: TodoSectionKey, workspace: string, themeColor?: string) => {
    const workspaceAppearance = getTodoWorkspaceAppearance(workspace);
    const expanded = getExpandedState(workspace);
    const workspaceTodos = todos.filter(todo => todo.workspace === workspace);
    const isGoalWorkspace = workspace === 'Goals';
    const goalSectionKey: GoalSectionKey | undefined = isGoalWorkspace
      && (sectionKey === 'thisWeek' || sectionKey === 'thisMonth' || sectionKey === 'thisYear' || sectionKey === 'longTerm')
      ? sectionKey
      : undefined;
    const canCreateFromEmptyState =
      isGoalWorkspace
        ? sectionKey === 'thisWeek' || sectionKey === 'thisMonth' || sectionKey === 'thisYear' || sectionKey === 'longTerm'
        : sectionKey !== 'completed' && sectionKey !== 'wishlist';
    const emptyStateText = isGoalWorkspace
      ? (sectionKey === 'completed' ? 'No completed goals' : 'Tap to add a new goal')
      : (sectionKey === 'completed' ? 'No completed tasks' : 'Tap to add a new to-do item');

    return (
      <View
        key={`section-${workspace}-${sectionKey}`}
        style={styles.section}
      >
        <LinearGradient
          colors={workspaceAppearance?.sectionGradientColors || getTheme(workspaceAppearance?.themeColor || themeColor || workspaceColors[currentWorkspace]).sectionGradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sectionInner}
        >
          <TouchableOpacity onPress={() => toggleSection(sectionKey, workspace)} style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.sectionHeaderRight}>
              <Ionicons name={expanded[sectionKey] ? "chevron-up" : "chevron-down"} size={24} color="rgba(0, 0, 0, 0.4)" />
            </View>
          </TouchableOpacity>
          {expanded[sectionKey] && (
            <View style={styles.sectionContent}>
              {workspaceTodos.length > 0 ? (
                workspaceTodos.map(todo =>
                  renderTodoItem(todo, sectionKey === 'completed', sectionKey, themeColor)
                )
              ) : (
                canCreateFromEmptyState ? (
                  <TouchableOpacity onPress={() => addTodo(workspace, goalSectionKey)}>
                    <Text style={styles.emptyStateText}>
                      {emptyStateText}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.emptyStateText}>
                    {emptyStateText}
                  </Text>
                )
              )}
            </View>
          )}
        </LinearGradient>
      </View>
    );
  }, [addTodo, currentWorkspace, getExpandedState, renderTodoItem, toggleSection, workspaceColors]);

  const animateWorkspaceChange = (newIndex: number) => {
    setCurrentWorkspace(newIndex);
    Animated.parallel([
      Animated.timing(workspaceNameAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(dotPositionAnim, {
        toValue: newIndex,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start(() => {
      workspaceNameAnim.setValue(0);
    });
  };
  const renderWorkspace = (workspace: string, index: number) => {
    const workspaceAppearance = getTodoWorkspaceAppearance(workspace);
    const themeColor = workspaceAppearance?.themeColor || workspaces[index]?.color;
    const theme = getTheme(themeColor);
    const currentYearTitle = String(new Date().getFullYear());

    return (
      <View key={`workspace-${workspace}`} style={styles.workspaceContainer}>
        <View
          style={[
            styles.workspaceShell,
            workspaceAppearance ? { backgroundColor: workspaceAppearance.workspaceShellColor } : null,
          ]}
        >
          <ScrollView
            style={styles.listContainer}
            showsVerticalScrollIndicator={false}
            bounces={true}
            overScrollMode="always"
            contentContainerStyle={styles.workspaceShellContent}
          >
            {workspace === 'Goals' && (
              <>
                {renderTodoSection("This Week", sortedTodos.thisWeek, "thisWeek", workspace, themeColor)}
                {renderTodoSection("This Month", sortedTodos.thisMonth, "thisMonth", workspace, themeColor)}
                {renderTodoSection(currentYearTitle, sortedTodos.thisYear, "thisYear", workspace, themeColor)}
                {renderTodoSection("Long Term", sortedTodos.longTerm, "longTerm", workspace, themeColor)}
              </>
            )}
            {workspace !== 'Goals' && workspace !== 'Wishlist' && (
              <>
                {renderTodoSection("Today", sortedTodos.today, "today", workspace, themeColor)}
                {renderTodoSection("Upcoming", sortedTodos.upcoming, "upcoming", workspace, themeColor)}
                {renderTodoSection("Past", sortedTodos.past, "past", workspace, themeColor)}
              </>
            )}
            {workspace === 'Wishlist' && (
              renderTodoSection("Wishlist", [...sortedTodos.today, ...sortedTodos.upcoming, ...sortedTodos.past], "wishlist", workspace, themeColor)
            )}
            {renderTodoSection("Completed", sortedTodos.completed, "completed", workspace, themeColor)}
          </ScrollView>
          <TouchableOpacity style={styles.createButton} onPress={() => addTodo(workspace)}>
            <Ionicons name="add" size={18} color={theme.workspaceNameColor} />
            <Text style={[styles.createButtonText, { color: theme.workspaceNameColor }]}>Create</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  };

  const currentWorkspaceKey = workspaces[currentWorkspace]?.key;
  const currentWorkspaceAppearance = getTodoWorkspaceAppearance(currentWorkspaceKey);
  const currentTheme = getTheme(currentWorkspaceAppearance?.themeColor || workspaceColors[currentWorkspace]);
  const screenTitle = currentWorkspaceAppearance?.screenTitle || 'To Do';
  const detailsWorkspaceAppearance = getTodoWorkspaceAppearance(selectedTodoForDetails?.workspace);
  const detailsScreenAppearance = detailsWorkspaceAppearance || currentWorkspaceAppearance;
  const detailsTheme = getTheme(
    detailsWorkspaceAppearance?.themeColor ||
    currentWorkspaceAppearance?.themeColor ||
    workspaceColors[currentWorkspace]
  );
  const detailsModalTranslateY = detailsModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });
  const detailsModalScale = detailsModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const detailsModalMaxHeight = Math.min(Dimensions.get('window').height * 0.62, 560);

  return (
    <GestureHandlerRootView className="flex-1">
      {isFocused && (
        <StatusBar
          style={currentTheme.isDark ? 'light' : 'dark'}
          backgroundColor="transparent"
          translucent
        />
      )}
      <LinearGradient
        className="flex-1 px-4"
        style={{ paddingTop: insets.top, paddingBottom: aiInputSpacer, minHeight: Dimensions.get('screen').height }}
        colors={currentWorkspaceAppearance?.overallGradientColors || currentTheme.gradientColors || [currentTheme.overallBg, currentTheme.overallBg]}
        start={currentWorkspaceAppearance?.overallGradientStart || currentTheme.gradientStart || { x: 0, y: 0 }}
        end={currentWorkspaceAppearance?.overallGradientEnd || currentTheme.gradientEnd || { x: 0, y: 1 }}
      >
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
            source={require('../../../assets/images/todo-water.png')}
            style={{
              width: '100%',
              height: '100%',
              opacity: 0.055,
            }}
            resizeMode="cover"
          />
        </View>
        {showUndo && <UndoNotification />}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, marginTop: 2, paddingTop: 4 }}>
          <Text
            className="text-2xl font-bold"
            style={{
              color: currentWorkspaceAppearance?.headerTitleColor || currentTheme.headerTitleColor,
              textShadowColor: 'rgba(0,0,0,0.25)',
              textShadowOffset: { width: 0, height: 3 },
              textShadowRadius: 8,
            }}
          >
            {screenTitle}
          </Text>
          {workspaces[currentWorkspace]?.key !== 'Wishlist' && (
            <TouchableOpacity
              onPress={() => setIsOptionsMenuVisible(true)}
              style={{ position: 'absolute', right: 0, top: 10, bottom: 0, justifyContent: 'center' }}
            >
              <Ionicons name="menu" size={26} color={currentWorkspaceAppearance?.headerMenuColor || currentTheme.headerMenuColor} />
            </TouchableOpacity>
          )}
        </View>
        {showSwipeHint && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: '95%', // Moved lower to be more visible
                left: '80%',
                transform: [
                  {
                    translateX: swipeAnimValue.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, -50], // Consistent left-to-right swipe
                    }),
                  },
                  {
                    translateY: -25,
                  },
                ],
                opacity: swipeAnimValue.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 1, 0],
                }),
                zIndex: 1000,
              },
            ]}
          >
            <View
              style={{
                backgroundColor: 'rgba(34, 171, 147, 0.8)',
                borderRadius: 20,
                padding: 15,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Ionicons name="arrow-back" size={24} color="white" />
            </View>
          </Animated.View>
        )}
        <View
          style={{
            position: 'absolute',
            top: 40,
            left: -30,
            right: 0,
            alignItems: 'center',
            zIndex: 0,
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
        <PagerView
          ref={pagerViewRef}
          className="flex-1 w-full"
          initialPage={0}
          offscreenPageLimit={1}
          onPageSelected={(e) => animateWorkspaceChange(e.nativeEvent.position)}
        >
          {workspaces.map((w, index) => renderWorkspace(w.key, index))}
        </PagerView>
        <View className="items-center mb-5 mt-3">
          {/* Workspace dots & quick actions */}
          <View className="flex-row items-center">
            <Animated.Text
              className="text-lg font-bold mb-1"
              style={{
                color: currentTheme.workspaceNameColor,
                opacity: workspaceNameAnim.interpolate({
                  inputRange: [0, 0.3, 0.7, 1],
                  outputRange: [1, 0, 0, 1],
                }),
                transform: [
                  {
                    translateY: workspaceNameAnim.interpolate({
                      inputRange: [0, 0.3, 0.7, 1],
                      outputRange: [0, -10, 10, 0],
                    }),
                  },
                ],
              }}
            >
              {workspaces[currentWorkspace]?.displayName}
            </Animated.Text>
            {/* <TouchableOpacity
              onPress={() => handleWorkspaceColorChange(currentWorkspace)}
              className="ml-2 mb-2.5"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil" size={16} style={{ color: currentTheme.workspaceNameColor }} />
            </TouchableOpacity> */}
          </View>

          <View className="flex-row justify-center items-center h-6 relative">
            {workspaces.map((_, index) => (
              <TouchableOpacity
                key={index}
                className="w-6 h-6 justify-center items-center"
                onPress={() => handleDotPress(index)}
              >
                <View
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: getTodoWorkspaceAppearance(workspaces[index]?.key)?.workspaceDotColor || getTheme(workspaceColors[index]).workspaceDotColor,
                    opacity: currentWorkspace === index ? 1 : 0.4,
                    borderWidth: currentWorkspace === index ? 0 : 1,
                    borderColor: '#F8F8F8'
                  }}
                />
              </TouchableOpacity>
            ))}
            {/* {workspaces.length < MAX_WORKSPACES && (
              <TouchableOpacity
                key="add-dot"
                className="w-6 h-6 justify-center items-center ml-0.5"
                onPress={createWorkspace}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View
                  className="w-4 h-4 rounded-full justify-center items-center"
                  style={{ borderWidth: 1, borderColor: currentTheme.workspaceDotColor }}
                >
                  <Ionicons name="add" size={10} color={currentTheme.workspaceDotColor} />
                </View>
              </TouchableOpacity>
            )} */}
            <Animated.View
              className="absolute left-0 top-0 w-6 h-6 justify-center items-center"
              style={{
                transform: [
                  {
                    translateX: dotPositionAnim.interpolate({
                      inputRange: [0, workspaces.length - 1],
                      outputRange: [0, (workspaces.length - 1) * 24],
                    }),
                  },
                ],
              }}
            >
              <View
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: currentWorkspaceAppearance?.workspaceDotColor || currentTheme.workspaceDotColor, borderWidth: 0 }}
              />
            </Animated.View>
          </View>
        </View>
        <ActionSheet
          ref={bottomSheetRef}
          keyboardHandlerEnabled={true}
          defaultOverlayOpacity={0.3}
          gestureEnabled={true}
          closeOnTouchBackdrop={true}
          snapPoints={[100]}
        >
          <TodoComposer
            key={composerKey}
            initialTodo={composerInitialTodo}
            themeColor={currentWorkspaceAppearance?.workspaceDotColor || currentTheme.workspaceDotColor}
            onSave={saveTodo}
          />
        </ActionSheet>
        <ActionSheet ref={longPressSheetRef} containerStyle={styles.actionSheet}>
          <View className="px-5">
            <TouchableOpacity
              className="flex-row items-center py-3"
              onPress={() => handleMoveToCalendar(selectedTodo || undefined)}
            >
              <Ionicons name="calendar" size={24} color="#22AB93" />
              <Text className="ml-4 text-base text-gray-800">Send to Calendar</Text>
            </TouchableOpacity>
            {/* <TouchableOpacity className="flex-row items-center py-3" onPress={handleEditTodo}>
              <Ionicons name="pencil" size={24} color="#22AB93" />
              <Text className="ml-4 text-base text-gray-800">Edit</Text>
            </TouchableOpacity> */}
            <TouchableOpacity className="flex-row items-center py-3" onPress={handleToggleStarred}>
              <MaterialCommunityIcons
                name={selectedTodo?.starred ? "hexagram" : "hexagram-outline"}
                size={22}
                color="#22AB93"
              />
              <Text className="ml-4 text-base text-gray-800">{selectedTodo?.starred ? "Unstar" : "Star"}</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-row items-center py-3" onPress={handleDeleteTodo}>
              <Ionicons name="trash" size={24} color="#FF3B30" />
              <Text className="ml-4 text-base text-red-600">Delete</Text>
            </TouchableOpacity>
          </View>
        </ActionSheet>
      </LinearGradient>
      <CompactAiBanner
        notice={aiNotice}
        surface="todo"
        top={insets.top + 12}
        onActionPress={() => {
          if (aiNotice?.kind === 'confirm') {
            void confirmPendingAction();
            return;
          }
          router.push({ pathname: '/(tabs)/chat', params: getHandoffChatParams() || {} });
        }}
        onDismissPress={dismissNotice}
        onCancelPress={cancelPending}
      />
      {isAiComposerActive && (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 10, 14, 0.48)' }} />
          </View>
        </TouchableWithoutFeedback>
      )}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: aiInputKeyboardBottom,
          transform: [{
            translateY: keyboardOffset.interpolate({
              inputRange: [0, 1000],
              outputRange: [0, -1000],
              extrapolate: 'clamp',
            }),
          }],
        }}
      >
        <AIInputBox
          textInput={inputValue}
          isListening={isListening}
          microphoneColor={microphoneColor}
          glowAnim={glowAnim}
          placeholder={aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? 'Reply here' : ''}
          isProcessing={isAiRunning}
          editable={!isAiRunning}
          showSendButton
          multiline
          minInputHeight={40}
          maxInputHeight={120}
          inputRef={inputRef}
          onChangeText={setInputValue}
          onSubmitEditing={submit}
          onSendPress={submit}
          returnKeyType="default"
          blurOnSubmit={false}
          onFocus={() => setIsAiInputFocused(true)}
          onBlur={() => setIsAiInputFocused(false)}
          onTextInputPress={() => {}}
          onMicrophonePress={handleMicrophonePress}
          surfaceVariant="todoAsset"
          containerStyle={{ backgroundColor: 'transparent' }}
        />
      </Animated.View>
      {selectedTodoForDetails && isDetailsModalVisible && (
          <View style={styles.detailsModalRoot}>
            <LinearGradient
              style={styles.detailsModalBackground}
              colors={
                detailsScreenAppearance?.overallGradientColors ||
                detailsTheme.gradientColors ||
                [detailsTheme.overallBg, detailsTheme.overallBg]
              }
              start={detailsScreenAppearance?.overallGradientStart || detailsTheme.gradientStart || { x: 0, y: 0 }}
              end={detailsScreenAppearance?.overallGradientEnd || detailsTheme.gradientEnd || { x: 0, y: 1 }}
            >
              <View pointerEvents="none" style={styles.detailsModalWatermarkLayer}>
                <Image
                  source={require('../../../assets/images/todo-water.png')}
                  style={styles.detailsModalWatermark}
                  resizeMode="cover"
                />
              </View>
              <View pointerEvents="none" style={styles.detailsModalLogoLayer}>
                <Image
                  source={require('../../../assets/images/eazee-bg-screen.png')}
                  style={styles.detailsModalLogo}
                  resizeMode="contain"
                />
              </View>
            </LinearGradient>
            <SafeAreaView style={styles.detailsModalSafeArea}>
              <Animated.View
                style={[
                  styles.detailsModalContent,
                  {
                    opacity: detailsModalAnim,
                    paddingBottom: floatingTabBarInset + 150,
                  },
                ]}
              >
                <View style={styles.detailsModalFrame}>
                  <View style={styles.detailsModalActionRow}>
                    <TouchableOpacity
                      onPress={handleCloseDetailsModal}
                      style={styles.detailsModalIconButton}
                      hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                    >
                      <Ionicons
                        name="arrow-back"
                        size={26}
                        color={detailsScreenAppearance?.headerMenuColor || detailsTheme.headerMenuColor}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => longPressSheetRef.current?.show()}
                      style={styles.detailsModalIconButton}
                      hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                    >
                      <Ionicons
                        name="ellipsis-vertical"
                        size={22}
                        color={detailsScreenAppearance?.headerMenuColor || detailsTheme.headerMenuColor}
                      />
                    </TouchableOpacity>
                  </View>

                  <Animated.View
                    style={[
                      styles.detailsModalShell,
                      {
                        backgroundColor: TODO_DETAILS_SHELL_COLOR,
                        maxHeight: detailsModalMaxHeight,
                        transform: [
                          { translateY: detailsModalTranslateY },
                          { scale: detailsModalScale },
                        ],
                      },
                    ]}
                  >
                    <ScrollView
                      bounces={false}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.detailsModalScrollContent}
                    >
                      <Text style={styles.detailsModalTitle}>{selectedTodoForDetails.text}</Text>

                      {selectedTodoForDetails.emailId && (
                        <TouchableOpacity
                          onPress={() => router.push({
                            pathname: '/(modals)/email/[id]',
                            params: {
                              id: selectedTodoForDetails.emailId!,
                              returnTo: '/(tabs)/todo',
                              preserveDetailsModal: 'false'
                            }
                          })}
                          style={styles.detailsModalEmailButton}
                          activeOpacity={0.86}
                        >
                          <View style={styles.detailsModalEmailButtonContent}>
                            <Ionicons name="mail-outline" size={20} color="#E8FFFA" />
                            <Text style={styles.detailsModalEmailButtonText}>View associated email</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color="#E8FFFA" />
                        </TouchableOpacity>
                      )}

                      <LinearGradient
                        colors={TODO_DETAILS_CARD_GRADIENT}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.detailsModalGradientCard}
                      >
                        <TextInput
                          style={styles.detailsModalDetailsInput}
                          multiline
                          value={editedTodoDetails}
                          onChangeText={setEditedTodoDetails}
                          placeholder="Add details..."
                          placeholderTextColor="#004D3F"
                        />
                      </LinearGradient>

                      <LinearGradient
                        colors={TODO_DETAILS_CARD_GRADIENT}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.detailsModalGradientCard}
                      >
                        <TouchableOpacity
                          style={styles.detailsModalMetaRow}
                          onPress={handleOpenDetailsTimePicker}
                          disabled={isDetailsTimePickerVisible}
                          activeOpacity={0.82}
                        >
                          <Text style={styles.detailsModalMetaLabel}>Time</Text>
                          <View style={styles.detailsModalMetaValueGroup}>
                            <Text style={styles.detailsModalMetaValue}>
                              {formatTodoTimeLabel(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime)}
                            </Text>
                            {getTodoHasDueTime(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime) && (
                              <TouchableOpacity
                                style={styles.detailsModalClearButton}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void handleClearDetailsTime();
                                }}
                                hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
                              >
                                <Ionicons name="close" size={16} color="#0E4D45" />
                              </TouchableOpacity>
                            )}
                            <Ionicons name="chevron-forward" size={22} color="#165C53" />
                          </View>
                        </TouchableOpacity>

                        <View style={styles.detailsModalMetaDivider} />

                        <TouchableOpacity
                          style={styles.detailsModalMetaRow}
                          onPress={() => setIsReminderModalVisible(true)}
                          activeOpacity={0.82}
                        >
                          <Text style={styles.detailsModalMetaLabel}>Reminder</Text>
                          <View style={styles.detailsModalMetaValueGroup}>
                            <Text style={styles.detailsModalMetaValue}>
                              {getTodoReminderLabel(selectedTodoForDetails, selectedTodoForDetails.hasDueTime)}
                            </Text>
                            <Ionicons name="chevron-forward" size={22} color="#165C53" />
                          </View>
                        </TouchableOpacity>
                      </LinearGradient>

                      {isDetailsTimePickerVisible && Platform.OS === 'android' && (
                        <View style={styles.todoDetailsAndroidPickerInline}>
                          <DateTimePicker
                            value={pendingDetailsTime}
                            mode="time"
                            display="spinner"
                            onChange={handleDetailsTimeChange}
                          />
                        </View>
                      )}
                    </ScrollView>
                  </Animated.View>
                </View>
              </Animated.View>
            </SafeAreaView>
            <View pointerEvents="box-none" style={styles.detailsModalBottomDock}>
              <Animated.View
                style={[
                  styles.detailsModalAiDock,
                  {
                    bottom: aiInputKeyboardBottom,
                    transform: [{
                      translateY: keyboardOffset.interpolate({
                        inputRange: [0, 1000],
                        outputRange: [0, -1000],
                        extrapolate: 'clamp',
                      }),
                    }],
                  },
                ]}
              >
                <AIInputBox
                  textInput={inputValue}
                  isListening={isListening}
                  microphoneColor={microphoneColor}
                  glowAnim={glowAnim}
                  placeholder={aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? 'Reply here' : ''}
                  isProcessing={isAiRunning}
                  editable={!isAiRunning}
                  showSendButton
                  multiline
                  minInputHeight={40}
                  maxInputHeight={120}
                  inputRef={inputRef}
                  onChangeText={setInputValue}
                  onSubmitEditing={submit}
                  onSendPress={submit}
                  returnKeyType="default"
                  blurOnSubmit={false}
                  onFocus={() => setIsAiInputFocused(true)}
                  onBlur={() => setIsAiInputFocused(false)}
                  onTextInputPress={() => {}}
                  onMicrophonePress={handleMicrophonePress}
                  surfaceVariant="todoAsset"
                  containerStyle={{ backgroundColor: 'transparent' }}
                />
              </Animated.View>

            </View>
          </View>
      )}
      {isDetailsTimePickerVisible && Platform.OS !== 'android' && (
        <Modal
          transparent
          visible={isDetailsTimePickerVisible}
          animationType="fade"
          onRequestClose={handleDismissDetailsTimePicker}
        >
          <View style={styles.todoComposerTimeModalOverlay}>
            <TouchableWithoutFeedback onPress={handleDismissDetailsTimePicker}>
              <View style={StyleSheet.absoluteFillObject} />
            </TouchableWithoutFeedback>
            <View style={styles.todoComposerTimeModalCard}>
              <DateTimePicker
                value={pendingDetailsTime}
                mode="time"
                display="spinner"
                onChange={handleDetailsTimeChange}
                accentColor={workspaceColors[currentWorkspace]}
                textColor="#111827"
                style={styles.todoComposerTimePicker}
              />
            </View>
          </View>
        </Modal>
      )}
      <Modal
        transparent
        visible={isReminderModalVisible}
        animationType="fade"
        onRequestClose={() => setIsReminderModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsReminderModalVisible(false)}>
          <View style={styles.reminderModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.reminderModalCard}>
                <Text style={styles.reminderModalTitle}>Reminder</Text>
                {selectedTodoForDetails && reminderOptions.map((option) => {
                  const isSelected = getReminderSelectionKey(selectedTodoForDetails) === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={styles.reminderOptionRow}
                      onPress={() => {
                        void handleSelectReminderOption(option);
                      }}
                    >
                      <Text style={styles.reminderOptionText}>{option.label}</Text>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={20} color="#F9FAFB" />
                      ) : (
                        <View style={styles.reminderOptionSpacer} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Modal
        transparent
        visible={isCustomReminderModalVisible}
        animationType="fade"
        onRequestClose={() => setIsCustomReminderModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsCustomReminderModalVisible(false)}>
          <View style={styles.reminderModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.customReminderCard}>
                <Text style={styles.reminderModalTitle}>Custom Reminder</Text>
                <View style={styles.reminderWheelRow}>
                  <ReminderWheelColumn
                    values={Array.from({ length: 31 }, (_, index) => index)}
                    selectedValue={customReminderDays}
                    onChange={setCustomReminderDays}
                    renderLabel={(value) => `${value}d`}
                  />
                  <ReminderWheelColumn
                    values={Array.from({ length: 24 }, (_, index) => index)}
                    selectedValue={customReminderHours}
                    onChange={setCustomReminderHours}
                    renderLabel={(value) => `${value}h`}
                  />
                  <ReminderWheelColumn
                    values={Array.from({ length: 60 }, (_, index) => index)}
                    selectedValue={customReminderMinutes}
                    onChange={setCustomReminderMinutes}
                    renderLabel={(value) => `${value}m`}
                  />
                </View>
                <TouchableOpacity
                  style={styles.customReminderSaveButton}
                  onPress={() => {
                    void handleSaveCustomReminder();
                  }}
                >
                  <Text style={styles.customReminderSaveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* {ColorPickerModal} */}
      {OptionsMenuModal}
      {showSpeechOverlay && !!speechOverlayText && (
        <View
          style={{
            position: 'absolute',
            top: 60,
            left: 16,
            right: 16,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
          }}
        >
          <Text
            style={{ color: '#FFFFFF', fontSize: 12 }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {speechOverlayText}
          </Text>
        </View>
      )}
      {isProcessing && <PulsatingRGB width={500} height={4} />}

    </GestureHandlerRootView>
  );
});



const styles = StyleSheet.create({
  // section
  section: {
    borderRadius: 20,
    marginBottom: 16,
    padding: 1.5,
    backgroundColor: '#43A5A4',
  },
  todoCardFrame: {
    borderRadius: 18,
    padding: 1.5,
    marginBottom: 10,
    opacity: 1,
  },
  todoCardGradient: {
    borderRadius: 16.5,
    paddingVertical: 13,
    paddingHorizontal: 16,
    opacity: 1,
    overflow: 'hidden',
  },
  sectionInner: {
    borderRadius: 18.5,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    //color: '#fff',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  sectionContent: {
    padding: 10,
  },
  sectionContentExpanded: {
    borderTopWidth: 1,
    borderTopColor: '#D0D0D0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 5,
    color: '#333',
  },
  listContainer: {
    flex: 1,
  },
  activeContainer: {
    backgroundColor: '#E3E3E2',
    borderRadius: 19,
    padding: 10,
    marginBottom: 20,
  },
  completedContainer: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 10,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFFCF9',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  checkbox: {
    marginRight: 10,
  },
  todoText: {
    fontSize: 16,
    color: '#333',
  },
  todoInput: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    padding: 0,
  },
  completedItem: {
    opacity: 0.6,
  },
  completedText: {
    textDecorationLine: 'line-through',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#22AB93',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  // bottom sheet
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  bottomSheetContent: {
    flex: 1,
    padding: 16,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  detailsModalGradientCard: {
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(193, 255, 244, 0.35)',
    shadowColor: '#0B3E37',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  detailsModalDetailsInput: {
    minHeight: 108,
    padding: 0,
    textAlignVertical: 'top',
    color: '#004D3F',
    fontSize: 15,
    lineHeight: 19,
  },
  detailsModalMetaRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  detailsModalMetaDivider: {
    height: 1,
    backgroundColor: 'rgba(24, 94, 82, 0.22)',
    marginVertical: 2,
  },
  detailsModalMetaLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#134D45',
  },
  detailsModalMetaValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  detailsModalMetaValue: {
    fontSize: 16,
    color: '#EFFFFB',
    fontWeight: '500',
  },
  detailsModalClearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(193, 255, 244, 0.35)',
  },
  bottomSheetFooter: {
    flexDirection: 'column',
    marginBottom: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  optionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    marginTop: 4,
    fontSize: 12,
    color: '#22AB93',
  },
  dateOptionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3E3E2',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dateText: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#22AB93',
  },
  saveButton: {
    backgroundColor: '#22AB93',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  starIcon: {
    marginLeft: 8,
  },
  // todo item
  todoTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  textWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  dueDateText: {
    fontSize: 10,
    color: '#888',
    marginRight: 8,

  },
  overdueDateText: {
    color: 'rgba(255, 0, 0, 0.6)',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyStateText: {
    textAlign: 'center',
    color: '#e0e0e0',
    fontStyle: 'italic',
    padding: 10,
  },
  // action sheet
  actionSheetContent: {
    paddingHorizontal: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionButtonText: {
    marginLeft: 16,
    fontSize: 16,
    color: '#333',
  },
  //input box
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#CBD0D2',
  },
  microphoneButton: {
    backgroundColor: '#22AB93',
    borderRadius: 8,
    width: 80,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 10,
    alignSelf: 'center',
  },
  microphoneButtonActive: {
    backgroundColor: '#22AB93',
  },
  microphoneButtonText: {
    color: '#fff',
  },
  textInputWrapper: {
    flex: 1,
    justifyContent: 'center',
    height: 35,
  },
  textInput: {
    color: '#000',
    flex: 1,
    height: 30,
    fontSize: 12,
    // borderColor: 'gray',
    // borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    marginRight: 10,
    backgroundColor: '#E3E3E2',
  },
  pagerView: {
    flex: 1,
    width: '100%',
  },
  workspaceContainer: {
    flex: 1,
    width: '100%',
  },
  workspaceShell: {
    flex: 1,
    borderRadius: 28,
    paddingTop: WORKSPACE_SHELL_TOP_PADDING,
    paddingBottom: WORKSPACE_SHELL_BOTTOM_PADDING,
    paddingHorizontal: WORKSPACE_SHELL_HORIZONTAL_PADDING,
    overflow: 'hidden',
  },
  workspaceShellContent: {
    flexGrow: 1,
    paddingBottom: 10,
  },
  // workspace
  workspaceIndicator: {
    alignItems: 'center',
    marginBottom: 20,
  },
  workspaceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#22AB93',
    marginBottom: 10,
  },
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 24,
    position: 'relative',
  },
  dotWrapper: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD0D2',
  },
  activeDotWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22AB93',
  },
  // amazon
  buyButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginRight: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.35,
    shadowRadius: 3.84,
    elevation: 5, // for Android
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // wishlist heading
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addAllToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 10,
  },
  addAllToCartText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  // wishlist
  loadingIndicator: {
    marginRight: 10,
  },
  goToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22AB93',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 10,
  },
  goToCartText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  detailsModalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: 'flex-start',
  },
  detailsModalBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  detailsModalFrame: {
    paddingHorizontal: 10,
  },
  detailsModalWatermarkLayer: {
    position: 'absolute',
    top: -24,
    left: -12,
    right: -12,
    bottom: -24,
  },
  detailsModalWatermark: {
    width: '100%',
    height: '100%',
    opacity: 0.055,
  },
  detailsModalLogoLayer: {
    position: 'absolute',
    top: 40,
    left: -30,
    right: 0,
    alignItems: 'center',
  },
  detailsModalLogo: {
    width: 662,
    height: 664,
    opacity: 1,
  },
  detailsModalSafeArea: {
    flex: 1,
  },
  detailsModalContent: {
    flex: 1,
    paddingTop: 34,
    paddingBottom: 132,
  },
  detailsModalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  detailsModalIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsModalShell: {
    borderRadius: 34,
    paddingHorizontal: 8,
    paddingTop: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(193, 255, 244, 0.08)',
    overflow: 'hidden',
    marginHorizontal: 0,
  },
  detailsModalScrollContent: {
    gap: 16,
  },
  detailsModalTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: TODO_DETAILS_TITLE_COLOR,
    marginBottom: 4,
    paddingLeft: 10,
  },
  detailsModalBottomDock: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  detailsModalAiDock: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  // TODO ANIMATION
  strikeThrough: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: '100%',
    height: 1,
    backgroundColor: '#000',
    transformOrigin: 'left',
  },
  todoItemContainer: {
    overflow: 'hidden',
  },

  // text input
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTextContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '80%',
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    maxHeight: 200,
    color: '#000',
  },
  todoComposerInputContainer: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  todoComposerClockButton: {
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
  },
  todoComposerInput: {
    minHeight: 40,
    flex: 1,
    paddingLeft: 0,
    paddingRight: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  todoComposerActions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  todoComposerDateTimeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
    minWidth: 0,
  },
  todoComposerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.1)',
    gap: 5,
    flexShrink: 1,
  },
  todoComposerChipText: {
    fontSize: 13,
    color: '#111827',
  },
  todoComposerChipCloseButton: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoComposerStarButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoComposerTimeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.32)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  todoComposerTimeModalCard: {
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 18,
    alignItems: 'center',
  },
  todoComposerTimePicker: {
    height: 180,
    alignSelf: 'stretch',
  },
  todoDetailsAndroidPickerInline: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  todoDetailsAndroidPickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  todoDetailsAndroidPickerSecondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  todoDetailsAndroidPickerSecondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  todoDetailsAndroidPickerPrimaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  todoDetailsAndroidPickerPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  todoComposerTimePrimaryButton: {
    alignSelf: 'stretch',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  todoComposerTimePrimaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  reminderModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  reminderModalCard: {
    borderRadius: 24,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  customReminderCard: {
    borderRadius: 24,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
  },
  reminderModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 10,
  },
  reminderOptionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  reminderOptionText: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '500',
  },
  reminderOptionSpacer: {
    width: 20,
    height: 20,
  },
  reminderWheelRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 18,
  },
  reminderWheelColumn: {
    flex: 1,
    height: REMINDER_WHEEL_ROW_HEIGHT * 5,
    borderRadius: 18,
    backgroundColor: '#1F2937',
    overflow: 'hidden',
  },
  reminderWheelSelection: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: REMINDER_WHEEL_ROW_HEIGHT * 2,
    height: REMINDER_WHEEL_ROW_HEIGHT,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  reminderWheelItem: {
    height: REMINDER_WHEEL_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderWheelItemText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  reminderWheelItemTextSelected: {
    color: '#F9FAFB',
    fontWeight: '700',
  },
  customReminderSaveButton: {
    borderRadius: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  customReminderSaveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    backgroundColor: '#22AB93',
    borderRadius: 5,
    padding: 10,
    width: '45%',
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#EB4335',
    borderRadius: 5,
    padding: 10,
    width: '45%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  // color
  colorPickerContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    alignItems: 'center',
  },
  colorPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  colorPickerButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  colorPickerButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 5,
  },
  colorPickerButton: {
    backgroundColor: '#22AB93',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    width: '45%',
    alignItems: 'center',
  },
  colorPickerButtonCancel: {
    backgroundColor: '#EB4335',
  },
  glowingButton: {
    shadowColor: '#22AB93',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  deleteActionContainer: {
    width: 100,
    height: '100%',
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAction: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    zIndex: 999,
  },
  deleteText: {
    color: 'white',
    fontWeight: 'bold',
    marginTop: 2,
    fontSize: 12
  },
  detailsModalEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(190, 255, 244, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(193, 255, 244, 0.2)',
  },
  detailsModalEmailButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailsModalEmailButtonText: {
    color: '#E8FFFA',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default withDatabase(TodoScreen);
