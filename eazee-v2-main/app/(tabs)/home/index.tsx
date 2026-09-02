import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, SafeAreaView, Image, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Blur, Canvas, Group, Paragraph, Paint, Skia, type SkParagraph } from '@shopify/react-native-skia';
import Reanimated, { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { endOfDay, format, startOfDay } from 'date-fns';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../database/database';
import EventModel from '../../../database/models/EventModel';
import TodoModel from '../../../database/models/TodoModel';
import AIInputBox from '@/components/AIInputBox';
import CompactAiBanner from '@/components/CompactAiBanner';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import { useTokens } from '../../context/TokenContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTodoHasDueTime } from '@/utils/todoDates';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { useCompactTabAI } from '@/lib/useCompactTabAI';
import { useCompactVoiceInput } from '@/lib/useCompactVoiceInput';

type GoogleEvent = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  isGoogleEvent: boolean;
  isAllDay?: boolean;
};

type ScheduleItem = {
  id: string;
  sourceId: string;
  label: string;
  type: 'event' | 'todo';
  time?: Date;
  endTime?: Date;
  hasTime: boolean;
  isStarred?: boolean;
  createdAt?: Date;
};

type NextStepState = {
  items: ScheduleItem[];
  helperText?: string;
};

const FREE_WINDOW_MINUTES = 3 * 60;
const ALIGN_ALL_DASHES = false;
const HOME_AI_INPUT_MIN_HEIGHT = 61;
const TODAY_CARD_BASE_HEIGHT = 192;
const TODAY_CARD_RADIUS = 22;
const TODAY_CARD_SURFACE = 'rgba(46,45,34,0.25)';
const TODAY_CARD_TEXT = '#C1BDB1';
const TODAY_CARD_LIST_LEFT = 16;
const TODAY_CARD_LIST_RIGHT = 16;

const getMinuteKey = (date: Date) => Math.floor(date.getTime() / 60000);

const formatScheduleTime = (date: Date) => format(date, 'h:mm a').toLowerCase();
const formatCompactScheduleTime = (date: Date) => format(date, 'h:mma').toLowerCase().replace(':00', '');

const formatScheduleLabel = (item: ScheduleItem) => {
  if (!item.hasTime || !item.time) {
    return 'Any time';
  }

  if (item.type === 'event' && item.endTime) {
    return `${formatScheduleTime(item.time)} - ${formatScheduleTime(item.endTime)}`;
  }

  return formatScheduleTime(item.time);
};

const sortTimedScheduleItems = (left: ScheduleItem, right: ScheduleItem) => {
  if (!left.time || !right.time) {
    return 0;
  }

  return left.time.getTime() - right.time.getTime();
};

export default function HomePage() {
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { getAccessToken, isLoading: isTokenLoading } = useTokens();
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const autoReplyMicNoticeRef = useRef<object | null>(null);
  const [aiInputHeight, setAiInputHeight] = useState(HOME_AI_INPUT_MIN_HEIGHT);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAiInputFocused, setIsAiInputFocused] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [todayHandledCanvasWidth, setTodayHandledCanvasWidth] = useState(0);
  const todayHandledScrollOffset = useSharedValue(0);
  const isAiComposerActive = isKeyboardVisible || isAiInputFocused;
  const aiInputKeyboardBottom = Platform.OS === 'android' && isAiComposerActive ? 0 : aiInputBottom;
  const todayCardHeaderHeight = 50;
  const homeContentBottomPadding = aiInputBottom + 16;
  const todayHandledRowHeight = 34;
  const todayHandledScrollHandler = useAnimatedScrollHandler((event) => {
    todayHandledScrollOffset.value = event.contentOffset.y;
  });
  const todayHandledParagraphTransform = useDerivedValue(() => [{ translateY: -todayHandledScrollOffset.value }]);

  const [upcomingEvents, setUpcomingEvents] = useState<(EventModel | GoogleEvent)[]>([]);
  const [upcomingTodos, setUpcomingTodos] = useState<TodoModel[]>([]);
  const compactMutationRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const {
    inputValue,
    setInputValue,
    submit,
    submitText,
    isRunning: isAiRunning,
    notice,
    dismissNotice,
    confirmPendingAction,
    cancelPending,
    getHandoffChatParams,
  } = useCompactTabAI('home', {
    onMutationSuccess: async () => {
      await compactMutationRefreshRef.current?.();
    },
  });

  const glowAnim = useRef(new Animated.Value(0)).current;
  const {
    isListening,
    handleMicrophonePress,
    cancelListening,
  } = useCompactVoiceInput({
    inputValue,
    setInputValue,
    glowAnim,
    onFinalTranscript: submitText,
  });

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const updateCurrentTime = () => setCurrentTime(new Date());
    const msUntilNextMinute = 60000 - (Date.now() % 60000);

    updateCurrentTime();

    const timeoutId = setTimeout(() => {
      updateCurrentTime();
      intervalId = setInterval(updateCurrentTime, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    const replyNotice =
      notice?.kind === 'clarify' || notice?.kind === 'confirm' ? notice : null;

    if (!replyNotice || isAiRunning) {
      const shouldCancelReplyMic = autoReplyMicNoticeRef.current !== null;
      autoReplyMicNoticeRef.current = null;
      if (shouldCancelReplyMic && isListening) {
        void cancelListening();
      }
      return;
    }

    if (autoReplyMicNoticeRef.current === replyNotice || isListening) {
      return;
    }

    autoReplyMicNoticeRef.current = replyNotice;
    handleMicrophonePress();
  }, [cancelListening, handleMicrophonePress, isAiRunning, isListening, notice]);

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

    parent.setOptions({
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
  }, [isAiComposerActive, navigation]);

  const fetchGoogleCalendarEvents = useCallback(async (start: Date, end: Date) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return [] as GoogleEvent[];
    }

    const timeMin = format(start, "yyyy-MM-dd'T'HH:mm:ssxxx");
    const timeMax = format(end, "yyyy-MM-dd'T'HH:mm:ssxxx");

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        return [] as GoogleEvent[];
      }

      const data = await response.json();
      return (data.items ?? []).map((item: any) => ({
        id: item.id,
        title: item.summary || 'Untitled event',
        startDate: parseCalendarDateValue(item.start.dateTime || item.start.date) || new Date(),
        endDate: parseCalendarDateValue(item.end.dateTime || item.end.date) || new Date(),
        isGoogleEvent: true,
        isAllDay: !!(item.start?.date && !item.start?.dateTime),
      }));
    } catch {
      return [] as GoogleEvent[];
    }
  }, [getAccessToken]);

  const fetchUpcomingEvents = useCallback(async () => {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());

    const [localEvents, googleEvents] = await Promise.all([
      database.collections
        .get<EventModel>('events')
        .query(Q.where('start_date', Q.between(start.getTime(), end.getTime())))
        .fetch(),
      fetchGoogleCalendarEvents(start, end),
    ]);

    const filteredLocalEvents = localEvents.filter(localEvent => {
      return !googleEvents.some((googleEvent: GoogleEvent) => googleEvent.id === localEvent.googleEventId);
    });

    const combined = [...filteredLocalEvents, ...googleEvents].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime()
    );

    setUpcomingEvents(combined);
  }, [fetchGoogleCalendarEvents]);

  const fetchUpcomingTodos = useCallback(async () => {
    const todos = await database
      .get<TodoModel>('todos')
      .query(
        Q.where('completed', false),
      )
      .fetch();

    const sortedTodos = todos.slice().sort((left, right) => {
      const leftDueTime = left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDueTime = right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftDueTime !== rightDueTime) {
        return leftDueTime - rightDueTime;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });

    setUpcomingTodos(sortedTodos);
  }, []);

  compactMutationRefreshRef.current = async () => {
    await Promise.all([fetchUpcomingEvents(), fetchUpcomingTodos()]);
  };

  useFocusEffect(
    useCallback(() => {
      if (isTokenLoading) {
        return;
      }

      const run = async () => {
        await Promise.all([fetchUpcomingEvents(), fetchUpcomingTodos()]);
      };

      run();
    }, [fetchUpcomingEvents, fetchUpcomingTodos, isTokenLoading])
  );

  const handleToggleTodo = useCallback(async (todoId: string) => {
    const todo = await database.get<TodoModel>('todos').find(todoId);
    await database.write(async () => {
      await todo.update(item => {
        item.completed = !item.completed;
      });
    });
    await fetchUpcomingTodos();
  }, [fetchUpcomingTodos]);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const todayStart = startOfDay(currentTime).getTime();
    const todayEnd = endOfDay(currentTime).getTime();
    const timedEventItems: ScheduleItem[] = [];
    const allDayEventItems: ScheduleItem[] = [];
    const timedTodoItems: ScheduleItem[] = [];
    const untimedTodayTodoItems: ScheduleItem[] = [];

    upcomingEvents.forEach(event => {
      const item: ScheduleItem = {
        id: `event-${String(event.id)}`,
        sourceId: String(event.id),
        time: event.startDate,
        endTime: event.endDate,
        label: event.title,
        type: 'event',
        hasTime: !(event as GoogleEvent).isAllDay,
      };

      if (item.hasTime) {
        timedEventItems.push(item);
      } else {
        allDayEventItems.push(item);
      }
    });

    upcomingTodos.forEach(todo => {
      const hasTime = getTodoHasDueTime(todo.dueDate, todo.hasDueTime);
      const item: ScheduleItem = {
        id: `todo-${todo.id}`,
        sourceId: todo.id,
        label: todo.text,
        type: 'todo',
        hasTime,
        isStarred: todo.starred,
        createdAt: todo.createdAt,
        ...(hasTime && todo.dueDate ? { time: todo.dueDate } : {}),
      };

      if (!todo.dueDate) {
        return;
      }

      const dueTime = todo.dueDate.getTime();
      if (dueTime < todayStart || dueTime > todayEnd) {
        return;
      }

      if (hasTime) {
        timedTodoItems.push(item);
        return;
      }

      untimedTodayTodoItems.push(item);
    });

    return [...timedEventItems, ...timedTodoItems]
      .sort(sortTimedScheduleItems)
      .concat(allDayEventItems, untimedTodayTodoItems);
  }, [currentTime, upcomingEvents, upcomingTodos]);

  const untimedTodoCandidates = useMemo<ScheduleItem[]>(() => {
    const todayStart = startOfDay(currentTime).getTime();
    const todayEnd = endOfDay(currentTime).getTime();

    return upcomingTodos
      .filter(todo => {
        const hasTime = getTodoHasDueTime(todo.dueDate, todo.hasDueTime);
        if (hasTime) {
          return false;
        }

        if (!todo.dueDate) {
          return true;
        }

        const dueTime = todo.dueDate.getTime();
        return dueTime >= todayStart && dueTime <= todayEnd;
      })
      .sort((left, right) => {
        const leftDueToday = !!left.dueDate && left.dueDate.getTime() >= todayStart && left.dueDate.getTime() <= todayEnd;
        const rightDueToday = !!right.dueDate && right.dueDate.getTime() >= todayStart && right.dueDate.getTime() <= todayEnd;

        if (leftDueToday !== rightDueToday) {
          return leftDueToday ? -1 : 1;
        }

        if (left.starred !== right.starred) {
          return left.starred ? -1 : 1;
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      })
      .map(todo => ({
        id: `todo-${todo.id}`,
        sourceId: todo.id,
        label: todo.text,
        type: 'todo',
        hasTime: false,
        isStarred: todo.starred,
        createdAt: todo.createdAt,
      }));
  }, [currentTime, upcomingTodos]);

  const nextStep = useMemo<NextStepState>(() => {
    const timedScheduleItems = scheduleItems.filter(
      (item): item is ScheduleItem & { time: Date } => item.hasTime && !!item.time
    );

    const currentEvents = timedScheduleItems.filter(item => (
      item.type === 'event' &&
      !!item.endTime &&
      item.time.getTime() <= currentTime.getTime() &&
      item.endTime.getTime() > currentTime.getTime()
    ));

    if (currentEvents.length > 0) {
      return {
        items: currentEvents,
        helperText: 'Happening now',
      };
    }

    const upcomingTimedItems = timedScheduleItems.filter(item => item.time.getTime() >= currentTime.getTime());

    if (upcomingTimedItems.length > 0) {
      const nextSlotKey = getMinuteKey(upcomingTimedItems[0].time);
      const nextSlotItems = upcomingTimedItems.filter(item => getMinuteKey(item.time) === nextSlotKey);
      const gapMinutes = Math.max(0, nextSlotItems[0].time.getTime() - currentTime.getTime()) / 60000;

      if (gapMinutes >= FREE_WINDOW_MINUTES && untimedTodoCandidates.length > 0) {
        return {
          items: [untimedTodoCandidates[0]],
          helperText: `Free until ${formatScheduleTime(nextSlotItems[0].time)}`,
        };
      }

      return {
        items: nextSlotItems,
        helperText: `Up next at ${formatScheduleTime(nextSlotItems[0].time)}`,
      };
    }

    if (untimedTodoCandidates.length > 0) {
      return {
        items: [untimedTodoCandidates[0]],
        helperText: 'No more timed items today',
      };
    }

    return { items: [] };
  }, [currentTime, scheduleItems, untimedTodoCandidates]);

  const widestTimeStr = useMemo(() => {
    let widest = '';
    for (const item of scheduleItems) {
      if (item.hasTime && item.time) {
        const str = formatCompactScheduleTime(item.time);
        if (str.length > widest.length) widest = str;
      }
    }
    return widest;
  }, [scheduleItems]);

  const todayCardMaxHeight = Math.min(
    Math.max(Math.round(TODAY_CARD_BASE_HEIGHT * 1.4), TODAY_CARD_BASE_HEIGHT + aiInputHeight),
    240
  );
  const todayCardTargetHeight =
    todayCardHeaderHeight + Math.max(scheduleItems.length, 3) * todayHandledRowHeight + 8;
  const todayCardHeight = Math.min(
    Math.max(todayCardTargetHeight, TODAY_CARD_BASE_HEIGHT),
    todayCardMaxHeight
  );
  const todayCardListHeight = Math.max(todayCardHeight - todayCardHeaderHeight, 132);
  const todayCardBlurHeight = todayCardHeight >= todayCardMaxHeight
    ? Math.min(Math.round(todayCardMaxHeight * 0.25), todayCardListHeight)
    : 0;
  const todayCardBlurOverlap = 0;
  const todayHandledCanvasPaddingBottom = Math.max(
    todayCardBlurHeight + 10,
    todayHandledRowHeight + 10
  );

  const todayHandledParagraphWidth = Math.max(
    todayHandledCanvasWidth - TODAY_CARD_LIST_LEFT - TODAY_CARD_LIST_RIGHT,
    0
  );

  const todayHandledParagraphs = useMemo(() => {
    if (todayHandledParagraphWidth <= 0) {
      return [] as {
        id: string;
        sharpParagraph: SkParagraph;
        blurredParagraph: SkParagraph;
        y: number;
      }[];
    }

    return scheduleItems.map((item, index) => {
      const labelTextStyle = {
        color: Skia.Color(TODAY_CARD_TEXT),
        fontSize: 16,
        fontFamilies: Platform.OS === 'android' ? ['sans-serif'] : ['System'],
        fontStyle: { weight: 400 as const },
        heightMultiplier: 1,
      };
      const timeTextStyle = {
        ...labelTextStyle,
        fontStyle: { weight: 400 as const },
      };

      const buildParagraph = () => {
        const builder = Skia.ParagraphBuilder.Make({
          maxLines: 1,
          ellipsis: '...',
        });

        if (item.hasTime && item.time) {
          if (ALIGN_ALL_DASHES && widestTimeStr) {
            builder.pushStyle(timeTextStyle);
            builder.addText(widestTimeStr.padEnd(Math.max(widestTimeStr.length, formatCompactScheduleTime(item.time).length), ' '));
            builder.pop();
            builder.pushStyle(labelTextStyle);
            builder.addText(' ');
            builder.pop();
          } else {
            builder.pushStyle(timeTextStyle);
            builder.addText(formatCompactScheduleTime(item.time));
            builder.pop();
          }

          builder.pushStyle(labelTextStyle);
          builder.addText(` - ${item.label}`);
          builder.pop();
        } else {
          builder.pushStyle(labelTextStyle);
          builder.addText(item.label);
          builder.pop();
        }

        const paragraph = builder.build();
        paragraph.layout(todayHandledParagraphWidth);
        return paragraph;
      };

      return {
        id: item.id,
        sharpParagraph: buildParagraph(),
        blurredParagraph: buildParagraph(),
        y: index * todayHandledRowHeight,
      };
    });
  }, [scheduleItems, todayHandledParagraphWidth, widestTimeStr]);

  const todayHandledContentHeight =
    todayHandledParagraphs.length * todayHandledRowHeight + todayHandledCanvasPaddingBottom;

  useEffect(() => {
    todayHandledScrollOffset.value = 0;
  }, [scheduleItems.length, todayHandledScrollOffset]);

  const statusText = useMemo(() => {
    const count = scheduleItems.length;
    const dateLabel = format(new Date(), 'MMM do');

    if (count === 0) {
      return `Today is free - ${dateLabel}`;
    }
    if (count <= 3) {
      return `Today is light - ${dateLabel}`;
    }
    if (count <= 6) {
      return `Today is manageable - ${dateLabel}`;
    }
    return `Today is packed - ${dateLabel}`;
  }, [scheduleItems.length]);

  const handleOpenSettings = useCallback(() => {
    router.push('/(tabs)/home/settings');
  }, []);

  return (
    <View style={{ flex: 1 }}>
    <CompactAiBanner
      notice={notice}
      surface="home"
      top={insets.top + 12}
      onActionPress={() => {
        if (notice?.kind === 'confirm') {
          void confirmPendingAction();
          return;
        }
        router.push({ pathname: '/(tabs)/chat', params: getHandoffChatParams() || {} });
      }}
      onDismissPress={dismissNotice}
      onCancelPress={cancelPending}
    />
    <LinearGradient
      colors={['#F1ECCE', '#8C8268']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1, paddingTop: 32 }}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: -24, left: -12, right: -12, bottom: -24, opacity: 0.10, zIndex: 11 }}
      >
        <Image
          source={require('../../../assets/images/wave-bg.png')}
          style={{ width: undefined, height: undefined, flex: 1 }}
          resizeMode="cover"
        />
      </View>
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 }}
      />
      <SafeAreaView className="flex-1 pt-2">
        {isFocused && <StatusBar style="dark" backgroundColor="transparent" translucent />}

        <View className="flex-1 px-5" style={{ paddingBottom: homeContentBottomPadding }}>
            <View pointerEvents="box-none" className="relative mt-2 mb-2 min-h-11 justify-center">
              <TouchableOpacity
                accessibilityLabel="Open settings"
                activeOpacity={0.85}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                className="absolute right-0 top-0 h-11 w-11 items-center justify-center"
                style={{ zIndex: 20, elevation: 20 }}
                onPress={handleOpenSettings}
              >
                <Ionicons name="settings-outline" size={22} color="#F6F1E5" />
              </TouchableOpacity>
              <Text pointerEvents="none" className="text-[24px] font-bold text-[#FFFFFF] text-center" style={{ textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8 }}>Home</Text>
            </View>
            <View className="h-[200px]">
            {/* <HomeBlob /> */}
            </View>

            <Text className="text-[18px] font-bold text-[#FFFFFF] mb-4">{statusText}</Text>

            {/* next step card */}
            <View className="rounded-[22px] pt-[14px] px-[6px] mb-4 bg-[#2E2D22]/25 pb-8">
              <Text className="text-[18px] font-bold text-[#ffffff] ml-4 mb-3">Next step</Text>
              {nextStep.items.length > 0 ? (
                <View className="gap-2">
                  {nextStep.items.map(item => (
                    <View
                      key={item.id}
                      className="rounded-[18px]"
                      style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 14 }}
                    >
                      <LinearGradient
                        colors={['#9D997C', '#4D4A3B']}
                        locations={[0, 0.85]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        className="h-12 flex-row items-center px-3.5 rounded-[18px] overflow-hidden border border-white/20"
                      >
                        {item.type === 'todo' ? (
                          <TouchableOpacity onPress={() => handleToggleTodo(item.sourceId)}>
                            <Image source={require('../../../assets/images/button-gold.png')} style={{ width: 30, height: 30 }} />
                          </TouchableOpacity>
                        ) : (
                          <View className="h-[30px] w-[30px] items-center justify-center">
                            <Ionicons name="calendar-clear-outline" size={22} color="#F7F1D8" />
                          </View>
                        )}
                        <Text className="flex-1 text-[16px] font-semibold text-[#ffffff] ml-2" numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text className="text-[12px] font-semibold text-[#E8E0C7]" numberOfLines={1}>
                          {formatScheduleLabel(item)}
                        </Text>
                      </LinearGradient>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-[14px] leading-[20px] mb-1 text-[#C1BDB1] font-medium ml-4">You&apos;re all caught up for now</Text>
              )}
            </View>
            {/* today handled card */}
            <View
              className="pt-[14px] px-[6px]"
              style={{
                height: todayCardHeight,
                borderRadius: TODAY_CARD_RADIUS,
                overflow: 'hidden',
                backgroundColor: TODAY_CARD_SURFACE,
              }}
            >
              <Text className="text-[18px] font-bold text-[#ffffff] mb-2.5 ml-4">I&apos;ve got today handled</Text>
              {scheduleItems.length > 0 ? (
                <View
                  className="relative"
                  style={{ height: todayCardListHeight }}
                  onLayout={(event) => setTodayHandledCanvasWidth(event.nativeEvent.layout.width)}
                >
                  {todayHandledCanvasWidth > 0 ? (
                    <Canvas
                      pointerEvents="none"
                      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                    >
                      <Group
                        clip={Skia.XYWHRect(0, 0, todayHandledCanvasWidth, todayCardListHeight - todayCardBlurHeight)}
                      >
                        <Group transform={todayHandledParagraphTransform}>
                          {todayHandledParagraphs.map(item => (
                            <Paragraph
                              key={`${item.id}-sharp`}
                              paragraph={item.sharpParagraph}
                              x={TODAY_CARD_LIST_LEFT}
                              y={item.y}
                              width={todayHandledParagraphWidth}
                            />
                          ))}
                        </Group>
                      </Group>
                      <Group
                        clip={Skia.XYWHRect(
                          0,
                          Math.max(todayCardListHeight - todayCardBlurHeight, 0),
                          todayHandledCanvasWidth,
                          todayCardBlurHeight + todayCardBlurOverlap
                        )}
                      >
                        <Group
                          layer={
                            <Paint>
                              <Blur blur={1.4} mode="clamp" />
                            </Paint>
                          }
                          transform={todayHandledParagraphTransform}
                        >
                          {todayHandledParagraphs.map(item => (
                            <Paragraph
                              key={`${item.id}-blurred`}
                              paragraph={item.blurredParagraph}
                              x={TODAY_CARD_LIST_LEFT}
                              y={item.y}
                              width={todayHandledParagraphWidth}
                            />
                          ))}
                        </Group>
                      </Group>
                    </Canvas>
                  ) : null}
                  <Reanimated.ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    style={{ maxHeight: todayCardListHeight }}
                    onScroll={todayHandledScrollHandler}
                    scrollEventThrottle={16}
                  >
                    <View style={{ height: todayHandledContentHeight }} />
                  </Reanimated.ScrollView>
                  {todayCardBlurHeight > 0 && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: todayCardBlurHeight,
                        borderBottomLeftRadius: TODAY_CARD_RADIUS,
                        borderBottomRightRadius: TODAY_CARD_RADIUS,
                        overflow: 'hidden',
                      }}
                    >
                      <LinearGradient
                        colors={['rgba(46,45,34,0)', 'rgba(46,45,34,0.012)', 'rgba(46,45,34,0.032)']}
                        locations={[0, 0.78, 1]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                      />
                    </View>
                  )}
                </View>
              ) : (
                <Text className="text-[14px] leading-[20px] mb-1 text-[#C1BDB1] font-medium ml-4">No events or todos for today</Text>
              )}
            </View>
        </View>

      </SafeAreaView>
    </LinearGradient>
    {isAiComposerActive && (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12, 11, 8, 0.52)' }} />
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
        microphoneColor="#E6E0BD"
        glowAnim={glowAnim}
        placeholder={notice?.kind === 'clarify' || notice?.kind === 'confirm' ? 'Reply here' : ''}
        isProcessing={isAiRunning}
        editable={!isAiRunning}
        showSendButton
        multiline
        minInputHeight={40}
        maxInputHeight={120}
        surfaceVariant="allinity3d"
        inputRef={inputRef}
        onChangeText={setInputValue}
        onSubmitEditing={submit}
        onSendPress={submit}
        returnKeyType="default"
        blurOnSubmit={false}
        onHeightChange={(height) => setAiInputHeight(Math.max(height, HOME_AI_INPUT_MIN_HEIGHT))}
        onFocus={() => setIsAiInputFocused(true)}
        onBlur={() => setIsAiInputFocused(false)}
        onTextInputPress={() => {}}
        onMicrophonePress={handleMicrophonePress}
        containerStyle={{ backgroundColor: 'transparent' }}
      />
    </Animated.View>
    </View>
  );
}
