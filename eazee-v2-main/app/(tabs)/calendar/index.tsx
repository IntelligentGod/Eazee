import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, TextInput, Modal, TouchableWithoutFeedback, Platform, Image, Keyboard } from 'react-native';
import { PinchGestureHandler, PanGestureHandler, State } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { database } from '../../../database/database';
import EventModel from '../../../database/models/EventModel';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { Linking } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';
import { startOfWeek, addDays, getWeek } from 'date-fns';
import { differenceInCalendarDays } from 'date-fns';
import { Alert } from 'react-native';
import { runOnJS } from 'react-native-reanimated';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import PulsatingLine from '../todo/PulsatingRGB';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTokens } from '../../../app/context/TokenContext';
import * as NavigationBar from 'expo-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AIInputBox from '../../../components/AIInputBox';
import CompactAiBanner from '@/components/CompactAiBanner';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { useCompactTabAI } from '@/lib/useCompactTabAI';
import { useCompactVoiceInput } from '@/lib/useCompactVoiceInput';

const HOUR_HEIGHT = 60;
const INITIAL_SCALE = 1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_LABEL_WIDTH = 50;
const CALENDAR_GRID_INSET = 18;
const TIME_LABEL_COLOR = '#96CDD6';
const CALENDAR_GRID_LINE_COLOR = '#96CDD6';
const INACTIVE_QUARTER_COLOR = '#888';
const EAZEE_EVENT_COLOR = '#034A52';
const ACTIVE_DRAG_COLOR = EAZEE_EVENT_COLOR;


const GuestChip: React.FC<{ email: string; onRemove: () => void }> = ({ email, onRemove }) => (
  <View style={styles.guestChip}>
    <Text style={styles.guestChipText}>{email}</Text>
    <TouchableOpacity onPress={onRemove}>
      <Icon name="close" size={16} color="#666" />
    </TouchableOpacity>
  </View>
);

const CalendarScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const contentBottomPadding = floatingTabBarInset + 74;
  const tabBarBottomOffset = Platform.OS === 'android' ? 10 : 8;
  const tabBarHeight = 56;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAiInputFocused, setIsAiInputFocused] = useState(false);
  const isAiComposerActive = isKeyboardVisible || isAiInputFocused;
  const aiInputKeyboardBottom = Platform.OS === 'android' && isAiComposerActive ? 0 : aiInputBottom;

  const [isLoading, setIsLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(1)).current;


  const router = useRouter();
  const { openEventId, openEventSource, openNonce } = useGlobalSearchParams<{ openEventId?: string; openEventSource?: string; openNonce?: string }>();
  const openedFromParamsRef = useRef<string | null>(null);
  const isOpeningFromParamsRef = useRef(false);
  const autoReplyMicNoticeRef = useRef<object | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{ id: string; source: 'google' | 'local' } | null>(null);

  const { getAccessToken, isLoading: isTokenLoading, hasTokens } = useTokens();


  //location google maps places
  const [location, setLocation] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);

  // edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventModel | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editGuests, setEditGuests] = useState<string[]>([]);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showEditStartPicker, setShowEditStartPicker] = useState(false);
  const [showEditEndPicker, setShowEditEndPicker] = useState(false);

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  type SearchItem = { id: string; title: string; startDate: Date; endDate?: Date; isGoogleEvent?: boolean; isAllDay?: boolean; source: 'local' | 'google' };
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<any>(null);

  const glowAnim = useRef(new Animated.Value(0)).current;
  const compactMutationRefreshRef = useRef<((info: { name: string; result: any }) => Promise<void>) | null>(null);
  const compactResyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  } = useCompactTabAI('calendar', {
    onMutationSuccess: async (info) => {
      await compactMutationRefreshRef.current?.(info);
    },
  });
  const {
    isListening,
    microphoneColor,
    handleMicrophonePress,
    cancelListening,
  } = useCompactVoiceInput({
    inputValue,
    setInputValue,
    glowAnim,
    onFinalTranscript: submitText,
  });

  useEffect(() => {
    const replyNotice =
      aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? aiNotice : null;

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
  }, [aiNotice, cancelListening, handleMicrophonePress, isAiRunning, isListening]);

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

  // Group search results by date (YYYY-MM-DD)
  const groupedSearchResults = useMemo(() => {
    if (!searchResults || searchResults.length === 0) return [] as { dateKey: string; date: Date; items: SearchItem[] }[];
    const groups = new Map<string, { dateKey: string; date: Date; items: SearchItem[] }>();
    for (const item of searchResults) {
      const d = new Date(item.startDate);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups.has(dateKey)) {
        const dateOnly = new Date(d);
        dateOnly.setHours(0, 0, 0, 0);
        groups.set(dateKey, { dateKey, date: dateOnly, items: [] });
      }
      groups.get(dateKey)!.items.push(item);
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
    // within each date, sort by start time
    arr.forEach(g => g.items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()));
    return arr;
  }, [searchResults]);

  // time slot
  const timelineScrollViewRef = useRef<ScrollView>(null);

  const fetchInProgress = useRef(false);

  const handleLocationSelect = (data: any, details: any = null) => {
    setLocation(data.description);
    if (details && details.geometry && details.geometry.location) {
      setSelectedLocation({
        lat: details.geometry.location.lat,
        lng: details.geometry.location.lng,
      });
    }
  };
  const renderMiniMap = (latitude: number, longitude: number) => (
    <MapView
      style={styles.miniMap}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.007,
        longitudeDelta: 0.007,
      }}
      scrollEnabled={false}
      zoomEnabled={false}
    >
      <Marker coordinate={{ latitude, longitude }} />
    </MapView>
  );

  // const [request, response, promptAsync] = Google.useAuthRequest({
  //   clientId: '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com',
  //   scopes: ['https://www.googleapis.com/auth/calendar'],
  //   redirectUri: makeRedirectUri({
  //     scheme: 'com.wave.app',
  //     path: '/(tabs)/calendar',
  //   }),
  // });

  // useEffect(() => {
  //   WebBrowser.maybeCompleteAuthSession();
  //   GoogleSignin.configure({
  //     scopes: ['https://www.googleapis.com/auth/calendar'],
  //     webClientId: '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com',
  //     offlineAccess: true,
  //   });
  // }, []);

  // event details
  const [selectedEvent, setSelectedEvent] = useState<EventModel | null>(null);
  const [eventDetails, setEventDetails] = useState<any>(null);
  const eventDetailsBottomSheetRef = useRef<BottomSheet>(null);
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false);
  const [pendingEventScrollDate, setPendingEventScrollDate] = useState<Date | null>(null);
  const [timelineLayoutReady, setTimelineLayoutReady] = useState(0);

  //events
  const [events, setEvents] = useState<EventModel[]>([]);
  const [refreshKey, setRefreshKey] = useState(0)

  // optimistic overrides for transient UI updates (by id)
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, { startDate: Date; endDate: Date }>>({});
  const pendingOptimisticEventIdsRef = useRef<Set<string>>(new Set());
  const dropInProgressRef = useRef(false);

  // bottom toast/snackbar state
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; undo?: (() => void) | null }>({ visible: false, message: '', undo: null });
  const snackbarTimeoutRef = useRef<any>(null);

  const hideSnackbar = useCallback(() => {
    if (snackbarTimeoutRef.current) {
      clearTimeout(snackbarTimeoutRef.current);
      snackbarTimeoutRef.current = null;
    }
    setSnackbar((s) => ({ ...s, visible: false }));
  }, []);

  const showSnackbar = useCallback((message: string, undo?: () => void) => {
    if (snackbarTimeoutRef.current) {
      clearTimeout(snackbarTimeoutRef.current);
      snackbarTimeoutRef.current = null;
    }
    setSnackbar({ visible: true, message, undo: undo || null });
    snackbarTimeoutRef.current = setTimeout(() => {
      hideSnackbar();
    }, 3500);
  }, [hideSnackbar]);

  const formatRelativeTarget = useCallback((date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffDays = differenceInCalendarDays(d, today);
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    return format(date, 'EEE, MMM d');
  }, []);

  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  // time slot scale
  const [scale, setScale] = useState(INITIAL_SCALE);
  const scaleRef = useRef(INITIAL_SCALE); // callback latest value
  const pinchStartScaleRef = useRef(INITIAL_SCALE); 
  const [isPinching, setIsPinching] = useState(false); // disable normal scroll to not mess with zoom in or out

  // drag-to-move state
  const [draggingEvent, setDraggingEvent] = useState<EventModel | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const snappedDragX = useRef(new Animated.Value(0)).current;
  const snappedDragY = useRef(new Animated.Value(0)).current;
  const [dragReadyEventId, setDragReadyEventId] = useState<string | null>(null);
  const dragHoldTimeoutRef = useRef<any>(null);

  // Active quarter highlight during drag: updates only when snapped quarter changes
  const dragHighlightRef = useRef<{ hour: number; minute: number } | null>(null);
  // Native refs for label nodes to avoid re-renders on drag
  const quarterRefs = useRef<Record<string, any>>({});
  const hourRefs = useRef<Record<string, any>>({});

  const dayColumnWidth = (Dimensions.get('window').width - CALENDAR_GRID_INSET * 2 - TIME_LABEL_WIDTH) / DAYS_OF_WEEK.length;

  // Auto-scroll while dragging
  const scrollYRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const scrollViewTopInWindowRef = useRef(0);
  const autoScrollIntervalRef = useRef<any>(null);
  const autoScrollAccumYRef = useRef(0);
  const autoScrollOffsetY = useRef(new Animated.Value(0)).current;

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback((direction: 1 | -1) => {
    if (autoScrollIntervalRef.current) return;
    autoScrollIntervalRef.current = setInterval(() => {
      const scrollView = timelineScrollViewRef.current;
      if (!scrollView) return;

      const currentScale = scaleRef.current;
      const step = Math.max(4, Math.floor(6 * currentScale));
      const totalContentHeight = 24 * HOUR_HEIGHT * currentScale;
      const viewH = scrollViewHeightRef.current || 0;
      const maxY = Math.max(0, totalContentHeight - viewH);
      const currentY = scrollYRef.current || 0;

      const nextY = Math.min(maxY, Math.max(0, currentY + direction * step));
      if (nextY !== currentY) {
        scrollYRef.current = nextY;
        (scrollView as any).scrollTo({ y: nextY, animated: false });
        // keep the dragged card under the finger by offsetting translateY
        autoScrollAccumYRef.current += direction * step;
        autoScrollOffsetY.setValue(autoScrollAccumYRef.current);
      } else {
        // hit bounds, stop
        stopAutoScroll();
      }
    }, 16);
  }, [autoScrollOffsetY, stopAutoScroll]);

  const resetDrag = () => {
    snappedDragX.setValue(0);
    snappedDragY.setValue(0);
    lastDragSnapRef.current = null;
    setDraggingEvent(null);
    setDragReadyEventId(null);
    dragHighlightRef.current = null;
    autoScrollAccumYRef.current = 0;
    autoScrollOffsetY.setValue(0);
    stopAutoScroll();
    // Clear any residual highlight (best-effort)
    try {
      Object.keys(quarterRefs.current).forEach((k) => {
        const node = quarterRefs.current[k];
        if (node && node.setNativeProps) node.setNativeProps({ style: { color: INACTIVE_QUARTER_COLOR, opacity: 0 } });
      });
      Object.keys(hourRefs.current).forEach((k) => {
        const node = hourRefs.current[k];
        if (node && node.setNativeProps) node.setNativeProps({ style: { color: TIME_LABEL_COLOR } });
      });
    } catch {}
  };

  const lastDragSnapRef = useRef<string | null>(null);
  const getBoundedDrag = (event: EventModel, tx: number, ty: number, extraY = 0) => {
    const override = optimisticOverrides[event.id as unknown as string];
    const baseStart = new Date(override ? override.startDate : event.startDate);
    const baseEnd = new Date(override ? override.endDate : event.endDate);
    const visibleStart = baseStart < weekStart ? new Date(weekStart) : new Date(baseStart);
    const startMinutes = visibleStart.getHours() * 60 + visibleStart.getMinutes();
    const durationMinutes = Math.max(15, Math.round((baseEnd.getTime() - baseStart.getTime()) / 60000));
    const maxStartMinutes = Math.max(0, 24 * 60 - Math.min(durationMinutes, 24 * 60));
    const pxPerMinute = (HOUR_HEIGHT * scaleRef.current) / 60;
    const rawMinutesDelta = Math.round(((ty + extraY) / pxPerMinute) / 15) * 15;
    const nextStartMinutes = Math.min(maxStartMinutes, Math.max(0, startMinutes + rawMinutesDelta));
    const minutesDelta = nextStartMinutes - startMinutes;
    const visibleDayIndex = Math.min(
      DAYS_OF_WEEK.length - 1,
      Math.max(0, differenceInCalendarDays(visibleStart, weekStart))
    );
    const rawDaysDelta = Math.round(tx / dayColumnWidth);
    const daysDelta = Math.min(
      DAYS_OF_WEEK.length - 1 - visibleDayIndex,
      Math.max(-visibleDayIndex, rawDaysDelta)
    );

    return {
      daysDelta,
      minutesDelta,
      snappedX: daysDelta * dayColumnWidth,
      snappedY: minutesDelta * pxPerMinute,
    };
  };

  const onEventDrag = Animated.event(
    [{ nativeEvent: { translationX: dragX, translationY: dragY } }],
    {
      useNativeDriver: false,
      listener: (evt: any) => {
        if (!draggingEvent) return;

        const tx = evt && evt.nativeEvent ? evt.nativeEvent.translationX || 0 : 0;
        const ty = evt && evt.nativeEvent ? evt.nativeEvent.translationY || 0 : 0;
        const { daysDelta, minutesDelta, snappedX, snappedY } = getBoundedDrag(
          draggingEvent,
          tx,
          ty,
          autoScrollAccumYRef.current || 0
        );
        const snapKey = `${daysDelta}:${minutesDelta}`;

        if (lastDragSnapRef.current !== snapKey) {
          lastDragSnapRef.current = snapKey;
          // store snapped deltas; compose auto-scroll only in transform
          snappedDragX.setValue(snappedX);
          snappedDragY.setValue(snappedY);
        }

        // Auto-scroll near edges during drag
        const absY = evt?.nativeEvent?.absoluteY || 0;
        const top = scrollViewTopInWindowRef.current || 0;
        const viewH = scrollViewHeightRef.current || 0;
        const edge = 40; // px threshold
        const topEdge = top + edge;
        const bottomEdge = top + viewH - edge;

        if (absY > 0 && viewH > 0) {
          if (absY < topEdge) {
            startAutoScroll(-1);
          } else if (absY > bottomEdge) {
            startAutoScroll(1);
          } else {
            stopAutoScroll();
          }
        }

        const override = optimisticOverrides[draggingEvent.id as unknown as string];
        const base = new Date(override ? override.startDate : draggingEvent.startDate);
        const newDate = new Date(base);
        newDate.setDate(newDate.getDate() + daysDelta);
        newDate.setMinutes(newDate.getMinutes() + minutesDelta);
        const next = { hour: newDate.getHours(), minute: newDate.getMinutes() };
        const prev = dragHighlightRef.current;
        if (!prev || prev.hour !== next.hour || prev.minute !== next.minute) {
          // update highlight purely via native props
          try {
            // reset previous quarter to hidden
            if (prev) {
              const prevKey = `${prev.hour}-${prev.minute}`;
              const prevNode = quarterRefs.current[prevKey];
              if (prevNode && prevNode.setNativeProps) prevNode.setNativeProps({ style: { color: INACTIVE_QUARTER_COLOR, opacity: 0 } });
            }
            // set current quarter visible
            const nextKey = `${next.hour}-${next.minute}`;
            const nextNode = quarterRefs.current[nextKey];
            if (nextNode && nextNode.setNativeProps) nextNode.setNativeProps({ style: { color: ACTIVE_DRAG_COLOR, opacity: 1 } });

            // hour label highlighting: only highlight at minute 0
            const prevHour = prev ? `${prev.hour}` : null;
            if (prevHour) {
              const prevHourNode = hourRefs.current[prevHour];
              if (prevHourNode && prevHourNode.setNativeProps) prevHourNode.setNativeProps({ style: { color: TIME_LABEL_COLOR } });
            }
            const hourNode = hourRefs.current[`${next.hour}`];
            if (hourNode && hourNode.setNativeProps) {
              if (next.minute === 0) {
                hourNode.setNativeProps({ style: { color: ACTIVE_DRAG_COLOR } });
              } else {
                hourNode.setNativeProps({ style: { color: TIME_LABEL_COLOR } });
              }
            }
          } catch {}
          dragHighlightRef.current = next;
        }

        // Remove per-move logging to avoid lag
      }
    }
  );

  

  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    return startOfWeek(today, { weekStartsOn: 0 }); // 0 for Sunday, 1 for Monday
  });
  const allDayEventsByDay = useMemo(() => {
    return DAYS_OF_WEEK.map((_, dayIndex) => {
      const dayStart = addDays(weekStart, dayIndex);
      dayStart.setHours(0, 0, 0, 0);
      const nextDay = addDays(dayStart, 1);

      return events.filter((event) => {
        if (!(event as any).isAllDay) return false;
        const override = optimisticOverrides[event.id as unknown as string];
        const start = new Date(override ? override.startDate : event.startDate);
        const end = new Date(override ? override.endDate : event.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
        return start < nextDay && end > dayStart;
      });
    });
  }, [events, optimisticOverrides, weekStart]);
  const [selectedSlot, setSelectedSlot] = useState<{ date: Date; hour: number } | null>(null);
  const [eventTitle, setEventTitle] = useState('');

  //bottom sheet
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  const [guests, setGuests] = useState<string[]>([]);
  const [newGuest, setNewGuest] = useState('');

  const [isAnyBottomSheetOpen, setIsAnyBottomSheetOpen] = useState(false);
  const overlayVisible = isAnyBottomSheetOpen || isEventDetailsOpen || isSearchOpen;
  const shouldRenderAiComposer = !overlayVisible && !selectedSlot && !selectedSlotKey;
  const hasCleanupWorkRef = useRef(false);
  hasCleanupWorkRef.current =
    overlayVisible ||
    snackbar.visible ||
    isBottomSheetExpanded ||
    selectedSlot !== null ||
    selectedSlotKey !== null ||
    eventTitle !== '' ||
    guests.length > 0 ||
    newGuest !== '' ||
    location !== '' ||
    selectedLocation !== null ||
    isEditMode ||
    editingEvent !== null ||
    selectedEvent !== null ||
    eventDetails !== null ||
    pendingEventScrollDate !== null ||
    pendingOpen !== null;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: overlayVisible ? 0 : 1,
      duration: overlayVisible ? 0 : 100,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, overlayVisible]);

  useEffect(() => {
    if (!overlayVisible) return;
    setIsAiInputFocused(false);
    inputRef.current?.blur();
  }, [overlayVisible]);

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;

    parent.setOptions({
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
        display: overlayVisible || isAiComposerActive ? 'none' : 'flex',
      },
    });

    return () => {
      parent.setOptions({
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
          display: 'flex',
        },
      });
    };
  }, [isAiComposerActive, navigation, overlayVisible, tabBarBottomOffset, tabBarHeight]);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync('hidden');
        NavigationBar.setBehaviorAsync('overlay-swipe');
      } catch {}
    }
  }, []);
  const resetEditState = useCallback(() => {
    setIsEditMode(false);
    setEditingEvent(null);
    setEditTitle('');
    setEditGuests([]);
    setEditStart(null);
    setEditEnd(null);
    setShowEditDatePicker(false);
    setShowEditStartPicker(false);
    setShowEditEndPicker(false);
  }, []);
  const closeCalendarOverlays = useCallback(() => {
    if (!hasCleanupWorkRef.current) return;
    Keyboard.dismiss();
    closeSearch();
    hideSnackbar();
    bottomSheetRef.current?.close();
    eventDetailsBottomSheetRef.current?.close();
    setSelectedSlot(null);
    setSelectedSlotKey(null);
    setEventTitle('');
    setGuests([]);
    setNewGuest('');
    setLocation('');
    setSelectedLocation(null);
    resetEditState();
    setSelectedEvent(null);
    setEventDetails(null);
    setPendingEventScrollDate(null);
    setPendingOpen(null);
    setIsBottomSheetExpanded(false);
    setIsEventDetailsOpen(false);
    isOpeningFromParamsRef.current = false;
  }, [closeSearch, hideSnackbar, resetEditState]);
  const renderBottomSheetBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    []
  );

  const onPinchGestureEvent = useCallback((event: any) => {
    const nextScale = Math.min(
      Math.max(pinchStartScaleRef.current * (event.nativeEvent.scale || 1), MIN_SCALE),
      MAX_SCALE
    );
    if (Math.abs(nextScale - scaleRef.current) > 0.001) {
      scaleRef.current = nextScale;
      setScale(nextScale);
    }

    const scrollView = timelineScrollViewRef.current as any;
    if (!scrollView) return;

    const viewH = scrollViewHeightRef.current || 0;
    const maxY = Math.max(0, 24 * HOUR_HEIGHT * nextScale - viewH);
    if (scrollYRef.current > maxY) {
      scrollYRef.current = maxY;
      scrollView.scrollTo({ y: maxY, animated: false });
    }
  }, []);

  const onPinchHandlerStateChange = useCallback((event: any) => {
    const { state, oldState, scale: gestureScale } = event.nativeEvent;

    if (state === State.BEGAN) {
      pinchStartScaleRef.current = scaleRef.current;
      return;
    }

    if (state === State.ACTIVE) {
      setIsPinching(true);
      return;
    }

    if (
      oldState === State.ACTIVE ||
      state === State.END ||
      state === State.CANCELLED ||
      state === State.FAILED
    ) {
      setIsPinching(false);

      if (oldState !== State.ACTIVE) return;

      const nextScale = Math.min(
        Math.max(pinchStartScaleRef.current * (gestureScale || 1), MIN_SCALE),
        MAX_SCALE
      );
      if (Math.abs(nextScale - scaleRef.current) > 0.001) {
        scaleRef.current = nextScale;
        setScale(nextScale);
      }
    }
  }, []);

  useEffect(() => {
    const scrollView = timelineScrollViewRef.current as any;
    if (!scrollView) return;

    const viewH = scrollViewHeightRef.current || 0;
    const maxY = Math.max(0, 24 * HOUR_HEIGHT * scale - viewH);

    if (scrollYRef.current > maxY) {
      scrollYRef.current = maxY;
      scrollView.scrollTo({ y: maxY, animated: false });
    }
  }, [scale]);

  const handleTimeSlotPress = (hour: number, dayIndex: number) => {
    setIsAiInputFocused(false);
    inputRef.current?.blur();
    Keyboard.dismiss();
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    date.setHours(hour);
    setSelectedSlot({ date, hour });
    setSelectedSlotKey(`${dayIndex}-${hour}`);
    eventDetailsBottomSheetRef.current?.close();
    bottomSheetRef.current?.snapToIndex(0);

    // Scroll to make the selected time slot visible
    setTimeout(() => {
      const scrollView = timelineScrollViewRef.current;
      if (scrollView) {
        const screenHeight = Dimensions.get('window').height;
        const bottomSheetHeight = screenHeight * 0.25; // Assuming 25% height for the bottom sheet
        const visibleHeight = screenHeight - bottomSheetHeight;
        const totalContentHeight = 24 * HOUR_HEIGHT * scale; // Total height of all time slots
        const yOffset = hour * HOUR_HEIGHT * scale;

        let scrollToY;
        if (totalContentHeight - yOffset < visibleHeight) {
          // If the selected slot is near the bottom, scroll to show the last visible portion
          scrollToY = totalContentHeight - visibleHeight;
        } else {
          // Otherwise, center the selected slot
          scrollToY = Math.max(0, yOffset - (visibleHeight / 2));
        }

        scrollView.scrollTo({ y: scrollToY, animated: true });
      }
    }, 100);
  };

  const scrollToEventTime = useCallback((date: Date, animated: boolean) => {
    const scrollView = timelineScrollViewRef.current as any;
    if (!scrollView) return false;

    const viewH = scrollViewHeightRef.current || 0;
    const totalContentHeight = 24 * HOUR_HEIGHT * scale;
    const minutesFromStartOfDay = (date.getHours() * 60) + date.getMinutes();
    const yOffset = (minutesFromStartOfDay / 60) * HOUR_HEIGHT * scale;
    const maxY = Math.max(0, totalContentHeight - viewH);
    const targetY = Math.max(0, Math.min(maxY, yOffset - (viewH * 0.35)));

    scrollYRef.current = targetY;
    scrollView.scrollTo({ y: targetY, animated });
    return true;
  }, [scale]);

  const renderWeekHeader = () => {
    const today = new Date();
    const weekNumber = getWeek(weekStart);

    return (
      <View style={styles.weekHeader}>
        <View style={styles.weekNumberContainer}>
          <Text style={styles.weekNumberText}>W{weekNumber}</Text>
        </View>
        {DAYS_OF_WEEK.map((day, index) => {
          const date = new Date(weekStart);
          date.setDate(weekStart.getDate() + index);
          const isToday = date.toDateString() === today.toDateString();
          return (
            <View key={index} style={styles.dayHeader}>
              <Text style={styles.dayText} numberOfLines={1}>
                {day}
              </Text>
              <View style={[styles.dateCircle, isToday && styles.todayCircle]}>
                <Text style={[styles.dateText, isToday && styles.todayText]}>{date.getDate()}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderAllDayEvents = () => {
    const maxEvents = allDayEventsByDay.reduce((highest, items) => Math.max(highest, items.length), 0);
    if (maxEvents === 0) {
      return <View style={styles.allDayDividerOnly} />;
    }

    return (
      <View style={styles.allDayRow}>
        <View style={styles.allDayLabelColumn}>
          <Text style={styles.allDayLabel}>All day</Text>
        </View>
        {allDayEventsByDay.map((dayEvents, dayIndex) => (
          <View key={`all-day-${dayIndex}`} style={styles.allDayDayColumn}>
            {dayEvents.map((event) => (
              <TouchableOpacity
                key={`all-day-chip-${dayIndex}-${event.id}`}
                activeOpacity={0.8}
                onPress={() => handleEventPress(event)}
                style={[
                  styles.allDayChip,
                  { backgroundColor: event.isGoogleEvent ? '#4285F4' : EAZEE_EVENT_COLOR },
                ]}
              >
                <Text style={styles.allDayChipText} numberOfLines={1}>
                  {event.title || '(No title)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderTimeSlots = () => {
    const slots = [];
    const coveredSlots = new Set<string>();
    const renderedEventsBySlot = new Map<string, {
      key: string;
      top: number;
      height: number;
      left: number;
      width: number;
      event: EventModel;
      showTitle?: boolean;
    }[]>();
    const segmentsByDay = DAYS_OF_WEEK.map(() => [] as {
      key: string;
      dayIndex: number;
      startMinutes: number;
      endMinutes: number;
      top: number;
      height: number;
      event: EventModel;
      showTitle?: boolean;
    }[]);

    events.forEach(event => {
      if ((event as any).isAllDay) return;
      const override = optimisticOverrides[event.id as unknown as string];
      const evStart = new Date(override ? override.startDate : event.startDate);
      const evEnd = new Date(override ? override.endDate : event.endDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const start = evStart < weekStart ? new Date(weekStart) : new Date(evStart);
      const end = evEnd > weekEnd ? new Date(weekEnd) : new Date(evEnd);
      if (end <= start) return;

      // Iterate by day and create one rendered block per day segment, but mark hourly coverage
      let dayCursor = new Date(start);
      dayCursor.setHours(0, 0, 0, 0);
      // Ensure first dayCursor is not before weekStart day
      if (dayCursor < weekStart) {
        dayCursor = new Date(weekStart);
        dayCursor.setHours(0, 0, 0, 0);
      }
      while (dayCursor < end) {
        const nextDay = new Date(dayCursor);
        nextDay.setDate(nextDay.getDate() + 1);

        const segmentStart = new Date(Math.max(dayCursor.getTime(), start.getTime()));
        const segmentEnd = new Date(Math.min(nextDay.getTime(), end.getTime()));

        if (segmentEnd > segmentStart) {
          const dayIndex = differenceInCalendarDays(segmentStart, weekStart);
          const startMinutes = segmentStart.getHours() * 60 + segmentStart.getMinutes();
          const durationMinutes = (segmentEnd.getTime() - segmentStart.getTime()) / 60000;
          const endMinutes = startMinutes + durationMinutes;

          for (let hour = Math.floor(startMinutes / 60); hour * 60 < endMinutes; hour += 1) {
            coveredSlots.add(`${dayIndex}-${hour}`);
          }

          const minutesIntoHour = startMinutes % 60;
          const durationHours = durationMinutes / 60;
          const top = (minutesIntoHour / 60) * HOUR_HEIGHT * scale;
          const height = Math.max(1, durationHours * HOUR_HEIGHT * scale - 1);
          const isFirstOverallSegment = segmentStart.getTime() === start.getTime();
          const showTitle = isFirstOverallSegment || segmentStart.getHours() === 0; // repeat title at midnight

          segmentsByDay[dayIndex].push({
            key: `${event.id}-${dayIndex}-${startMinutes}`,
            dayIndex,
            startMinutes,
            endMinutes,
            top,
            height,
            event,
            showTitle,
          });
        }

        dayCursor = nextDay;
      }
    });

    segmentsByDay.forEach((daySegments) => {
      if (daySegments.length === 0) return;

      daySegments.sort((a, b) =>
        a.startMinutes - b.startMinutes ||
        b.endMinutes - a.endMinutes ||
        String(a.event.id).localeCompare(String(b.event.id))
      );

      const cluster: { segment: typeof daySegments[number]; column: number }[] = [];
      const active: { endMinutes: number; column: number }[] = [];
      let clusterColumnCount = 0;

      const flushCluster = () => {
        if (cluster.length === 0) return;

        const columnWidth = dayColumnWidth / Math.max(1, clusterColumnCount);
        cluster.forEach(({ segment, column }) => {
          const slotKey = `${segment.dayIndex}-${Math.floor(segment.startMinutes / 60)}`;
          const itemsForSlot = renderedEventsBySlot.get(slotKey) ?? [];
          itemsForSlot.push({
            key: segment.key,
            top: segment.top,
            height: segment.height,
            left: column * columnWidth + 1,
            width: Math.max(8, columnWidth - 2),
            event: segment.event,
            showTitle: segment.showTitle,
          });
          renderedEventsBySlot.set(slotKey, itemsForSlot);
        });

        cluster.length = 0;
        clusterColumnCount = 0;
      };

      daySegments.forEach((segment) => {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (active[index].endMinutes <= segment.startMinutes) {
            active.splice(index, 1);
          }
        }

        if (active.length === 0) {
          flushCluster();
        }

        let column = 0;
        while (active.some((item) => item.column === column)) {
          column += 1;
        }

        active.push({ endMinutes: segment.endMinutes, column });
        cluster.push({ segment, column });
        clusterColumnCount = Math.max(clusterColumnCount, active.length);
      });

      flushCluster();
    });

    for (let i = 0; i < 24; i++) {
      slots.push(
        <Animated.View key={i} style={[
          styles.timeSlotRow,
          {
            height: HOUR_HEIGHT * scale
          }
        ]}>
          <View style={styles.timeLabel}>
            <Text
              ref={(r) => { hourRefs.current[`${i}`] = r; }}
              style={styles.timeText}
            >{`${i.toString().padStart(2, '0')}:00`}</Text>
            {(draggingEvent || dragReadyEventId) && (
              <View style={styles.quarterOverlay} pointerEvents="none">
                <View style={[styles.quarterItem, { top: '25%' }]}>
                  <Text
                    ref={(r) => { quarterRefs.current[`${i}-15`] = r; }}
                    style={styles.quarterText}
                  >{`${i.toString().padStart(2, '0')}:15`}</Text>
                </View>
                <View style={[styles.quarterItem, { top: '50%' }]}>
                  <Text
                    ref={(r) => { quarterRefs.current[`${i}-30`] = r; }}
                    style={styles.quarterText}
                  >{`${i.toString().padStart(2, '0')}:30`}</Text>
                </View>
                <View style={[styles.quarterItem, { top: '75%' }]}>
                  <Text
                    ref={(r) => { quarterRefs.current[`${i}-45`] = r; }}
                    style={styles.quarterText}
                  >{`${i.toString().padStart(2, '0')}:45`}</Text>
                </View>
              </View>
            )}
          </View>
          {DAYS_OF_WEEK.map((_, dayIndex) => {
            const currentDate = addDays(weekStart, dayIndex);
            currentDate.setHours(i, 0, 0, 0);

            const isSelected = selectedSlotKey === `${dayIndex}-${i}`;
            const layoutKey = `${dayIndex}-${i}`;
            const eventsForSlot = renderedEventsBySlot.get(layoutKey) ?? [];

            return (
              <TouchableOpacity
                key={dayIndex}
                style={[
                  styles.timeSlotCell,
                  isSelected && styles.selectedTimeSlot
                ]}
                onPress={() => {
                  // prevent accidental time slot selection when tapping on events
                  if (coveredSlots.has(layoutKey)) return;
                  handleTimeSlotPress(i, dayIndex);
                }}
              >
                {eventsForSlot.map((eventForSlot) => (
                  <PanGestureHandler
                    key={eventForSlot.key}
                    onGestureEvent={onEventDrag}
                    onHandlerStateChange={createOnEventDragStateChange(eventForSlot.event)}
                    minDist={8}
                    simultaneousHandlers={timelineScrollViewRef}
                    enabled={
                      !eventForSlot.event.isGoogleEvent ||
                      (eventForSlot.event as any).editable !== false
                    }
                    onBegan={async () => {
                      if (dragHoldTimeoutRef.current) clearTimeout(dragHoldTimeoutRef.current);
                      setDragReadyEventId(null);
                      dragHoldTimeoutRef.current = setTimeout(async () => {
                        setDragReadyEventId(eventForSlot.event.id);
                        setDraggingEvent(eventForSlot.event);
                        try {
                          // Prefer strongest haptic available
                          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                        } catch {}
                      }, 300);
                    }}
                    onEnded={() => {
                      if (dragHoldTimeoutRef.current) clearTimeout(dragHoldTimeoutRef.current);
                    }}
                    onCancelled={() => {
                      if (dragHoldTimeoutRef.current) clearTimeout(dragHoldTimeoutRef.current);
                    }}
                    onFailed={() => {
                      if (dragHoldTimeoutRef.current) clearTimeout(dragHoldTimeoutRef.current);
                    }}
                  >
                    <Animated.View
                      style={[
                        styles.eventItem,
                        eventForSlot.event.isGoogleEvent && styles.googleEventItem,
                        {
                          position: 'absolute',
                          top: eventForSlot.top,
                          height: Math.max(1, eventForSlot.height - 4),
                          left: eventForSlot.left,
                          width: eventForSlot.width,
                          transform: draggingEvent?.id === eventForSlot.event.id
                            ? [
                                { translateX: snappedDragX },
                                { translateY: Animated.add(snappedDragY, autoScrollOffsetY) as any }
                              ]
                            : [{ translateX: 0 }, { translateY: 0 }],
                          zIndex: draggingEvent?.id === eventForSlot.event.id ? 4 : 3,
                          elevation: draggingEvent?.id === eventForSlot.event.id ? 4 : 2,
                        }
                      ]}
                    >
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => {
                          if (draggingEvent) return; // ignore presses during drag
                          handleEventPress(eventForSlot.event);
                        }}
                        // remove update-on-long-press; long-press now only arms drag
                        style={{ flex: 1 }}
                      >
                        <View>
                          {eventForSlot.event.isTodo && (
                            <Icon name="checkbox-marked-circle-outline" size={12} color="white" />
                          )}
                          {eventForSlot.showTitle && (
                            <Text style={styles.eventTitle} numberOfLines={2}>
                              {eventForSlot.event.title}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  </PanGestureHandler>
                ))}
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      );
    }

    // background grid layer (behind rows and events)
    const gridHorizontal = [] as React.ReactNode[];
    for (let i = 0; i < 24; i++) {
      gridHorizontal.push(
        <Animated.View
          key={`h-${i}`}
          style={[
            {
              marginLeft: TIME_LABEL_WIDTH,
              borderBottomWidth: 1,
              borderBottomColor: CALENDAR_GRID_LINE_COLOR,
            },
            { height: HOUR_HEIGHT * scale }
          ]}
        />
      );
    }
    const gridVertical = DAYS_OF_WEEK.map((_, dayIndex) => (
      <View
        key={`v-${dayIndex}`}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: CALENDAR_GRID_LINE_COLOR,
          left: TIME_LABEL_WIDTH + dayIndex * dayColumnWidth,
        }}
        pointerEvents="none"
      />
    ));

    return (
      <View style={{ position: 'relative' }}>
        <View style={styles.gridLayer} pointerEvents="none">
          {gridHorizontal}
          {gridVertical}
        </View>
        {slots}
      </View>
    );
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  const fetchGoogleCalendarEvents = useCallback(async (start: Date, end: Date) => {
    let currentAccessToken = await getAccessToken();

    if (!currentAccessToken) {
      console.error('No access token available, attempting to refresh');
    }

    const timeMin = format(start, "yyyy-MM-dd'T'HH:mm:ssxxx");
    const timeMax = format(end, "yyyy-MM-dd'T'HH:mm:ssxxx");

    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${currentAccessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Google Calendar API response not OK:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const items = (data.items || []);

      return items.map((item: any) => ({
        id: item.id,
        title: item.summary,
        startDate: parseCalendarDateValue(item.start.dateTime || item.start.date) || new Date(),
        endDate: parseCalendarDateValue(item.end.dateTime || item.end.date) || new Date(),
        isGoogleEvent: true,
        description: item.description,
        location: item.location,
        hangoutLink: item.hangoutLink,
        attendees: item.attendees?.map((attendee: any) => ({
          email: attendee.email,
          responseStatus: attendee.responseStatus,
        })) || [],
        // flags for UI/logic
        isAllDay: !!(item.start?.date && !item.start?.dateTime),
        editable: !!(item?.organizer?.self || item?.guestsCanModify) && item?.status !== 'cancelled' && item?.eventType !== 'outOfOffice'
      }));
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
      return [];
    }
  }, [getAccessToken]);

  const fetchGoogleCalendarSearch = useCallback(async (q: string, from: Date) => {
    try {
      if (!q.trim()) return [];
      const accessToken = await getAccessToken();
      if (!accessToken) return [];
  
      const timeMin = format(from, "yyyy-MM-dd'T'HH:mm:ssxxx");
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&maxResults=50&q=${encodeURIComponent(q)}`;
  
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) return [];
  
      const data = await res.json();
      const items = (data.items || []).filter((item: any) => item.description !== "Event created from wave");
      return items.map((item: any) => ({
        id: item.id,
        title: item.summary,
        startDate: parseCalendarDateValue(item.start.dateTime || item.start.date) || new Date(),
        endDate: parseCalendarDateValue(item.end.dateTime || item.end.date) || new Date(),
        isGoogleEvent: true,
        isAllDay: !!(item.start?.date && !item.start?.dateTime),
        source: 'google' as const,
      })) as SearchItem[];
    } catch {
      return [];
    }
  }, [getAccessToken]);

  const searchEvents = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    const now = new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - 6);
  
    // escape special LIKE chars for SQLite
    const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
  
    let local: SearchItem[] = [];
    try {
      const rows = await database.collections
        .get<EventModel>('events')
        .query(
          Q.where('start_date', Q.gte(from.getTime())),
          Q.or(
            Q.where('title', Q.like(like)),
            Q.where('location', Q.like(like))
          ),
          Q.sortBy('start_date', Q.asc)
        )
        .fetch() as EventModel[];
  
      local = rows.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        source: 'local' as const,
      }));
    } catch {}
  
    const google: SearchItem[] = (hasTokens ? await fetchGoogleCalendarSearch(q, from) : []) as SearchItem[];
  
    const combined = [...local, ...google].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    setSearchResults(combined);
    setIsSearching(false);
  }, [hasTokens, fetchGoogleCalendarSearch]);

  
  
  useEffect(() => {
    if (!isSearchOpen) {
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setVisibilityAsync('hidden');
          NavigationBar.setBehaviorAsync('overlay-swipe');
        } catch {}
      }
      return;
    }
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setBackgroundColorAsync('#219BAE');
        NavigationBar.setButtonStyleAsync('light');
        NavigationBar.setBehaviorAsync('overlay-swipe');
        NavigationBar.setVisibilityAsync('visible');
      } catch {}
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchEvents(searchQuery);
    }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setVisibilityAsync('hidden');
          NavigationBar.setBehaviorAsync('overlay-swipe');
        } catch {}
      }
    };
  }, [searchQuery, isSearchOpen, searchEvents]);

  const fetchEventsForWeek = useCallback(async (start: Date, opts?: { silent?: boolean }) => {
    // Always load local events; fetch Google only if tokens are ready
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;

    if (!opts?.silent) setIsLoading(true);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    try {
      const localPromise = database.collections
        .get('events')
        .query(Q.where('start_date', Q.between(start.getTime(), end.getTime())))
        .fetch() as Promise<EventModel[]>;

      const [localEvents, googleEvents] = await Promise.all([
        localPromise,
        (!isTokenLoading && hasTokens) ? fetchGoogleCalendarEvents(start, end) : Promise.resolve([] as any[])
      ]);

      // Compose UI events:
      // 1) For local Eazee events with a matching Google event, overlay Google timing/title
      //    while keeping isGoogleEvent=false (remain green).
      // 2) Include only Google-only events (those without a matching local googleEventId).
      const byGoogleId: Record<string, any> = Object.create(null);
      for (const ge of (googleEvents as any[])) byGoogleId[ge.id] = ge;

      // Best-effort: link local events missing googleEventId to Google events by exact time match (±60s) and similar title
      try {
        const usedGoogleIds = new Set<string>();
        for (const le of (localEvents as any[])) {
          if (le.googleEventId) usedGoogleIds.add(String(le.googleEventId));
        }
        const normalizeTitle = (s: any) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        for (const le of (localEvents as any[])) {
          if (le.googleEventId) continue;
          const ls = new Date(le.startDate).getTime();
          const lems = new Date(le.endDate).getTime();
          const lt = normalizeTitle(le.title);
          let matched: any = null;
          for (const ge of (googleEvents as any[])) {
            const gid = String(ge.id);
            if (usedGoogleIds.has(gid)) continue;
            const gs = new Date(ge.startDate).getTime();
            const gems = new Date(ge.endDate).getTime();
            const timeClose = Math.abs(gs - ls) <= 60000 && Math.abs(gems - lems) <= 60000;
            if (!timeClose) continue;
            const gt = normalizeTitle(ge.title);
            const titleOk = lt && gt ? lt === gt : true;
            if (titleOk) { matched = ge; break; }
          }
          if (matched) {
            // Link in-memory immediately so downstream merging treats it as linked
            (le as any).googleEventId = matched.id;
            usedGoogleIds.add(String(matched.id));
            try {
              // Persist link to DB (best-effort)
              await database.write(async () => {
                try {
                  const rec = await database.get<EventModel>('events').find(le.id);
                  await rec.update((r: any) => { r.googleEventId = String(matched.id); });
                } catch {}
              });
            } catch {}
          }
        }
      } catch {}

      // Build new overrides from Google timing for linked local events
      const newOverrides: Record<string, { startDate: Date; endDate: Date }> = Object.create(null);
      for (const le of (localEvents as any[])) {
        const ge = le.googleEventId ? byGoogleId[le.googleEventId] : undefined;
        if (ge && ge.startDate && ge.endDate) {
          newOverrides[String(le.id)] = {
            startDate: new Date(ge.startDate),
            endDate: new Date(ge.endDate),
          };
        }
      }
      // Preserve in-flight drag/drop overrides so background refreshes do not snap cards back.
      setOptimisticOverrides((prev) => {
        const merged = { ...newOverrides };
        pendingOptimisticEventIdsRef.current.forEach((id) => {
          if (prev[id]) {
            merged[id] = prev[id];
          }
        });
        return merged;
      });

      // Overlay Google titles for linked local events (UI) and persist if changed
      const localWithOverlays = (localEvents as any[]).map((le: any) => {
        const ge = le.googleEventId ? byGoogleId[le.googleEventId] : undefined;
        if (ge) {
          return {
            id: le.id,
            title: typeof ge.title === 'string' && ge.title ? ge.title : le.title,
            startDate: le.startDate,
            startTime: le.startTime,
            endDate: le.endDate,
            endTime: le.endTime,
            createdAt: le.createdAt,
            updatedAt: le.updatedAt,
            googleEventId: le.googleEventId,
            isGoogleEvent: le.isGoogleEvent,
            isTodo: le.isTodo,
            location: le.location,
            latitude: le.latitude,
            longitude: le.longitude,
            isAllDay: ge.isAllDay === true,
            editable: ge.editable,
          };
        }
        return le;
      });

      // Persist Google-renamed titles to local DB
      try {
        const toPersist = (localEvents as any[]).filter((le: any) => {
          const ge = le.googleEventId ? byGoogleId[le.googleEventId] : undefined;
          return ge && typeof ge.title === 'string' && ge.title && ge.title !== le.title;
        });

        if (toPersist.length) {
          await database.write(async () => {
            for (const le of toPersist) {
              try {
                const rec = await database.get<EventModel>('events').find(le.id);
                await rec.update((r) => {
                  // @ts-ignore
                  r.title = byGoogleId[le.googleEventId].title;
                });
              } catch {}
            }
          });
        }
      } catch {}

      const googleOnly = (googleEvents as any[]).filter((ge: any) =>
        !(localEvents as any[]).some((le: any) => le.googleEventId === ge.id)
      );

      const makeKey = (e: any) => (e.isGoogleEvent ? e.id : e.googleEventId || e.id);
      const mergedPreferred = [...localWithOverlays, ...googleOnly];
      const seen = new Set<string>();
      const deduped = mergedPreferred.filter((e: any) => {
        const key = String(makeKey(e));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setEvents(deduped as any);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      if (!opts?.silent) setIsLoading(false);
      fetchInProgress.current = false;
    }
  }, [fetchGoogleCalendarEvents]);

  compactMutationRefreshRef.current = async ({ name, result }) => {
    const visibleRangeStart = new Date(weekStart);
    visibleRangeStart.setHours(0, 0, 0, 0);
    const visibleRangeEnd = addDays(visibleRangeStart, 7);
    const inVisibleWeek = (value?: string) => {
      const date = parseCalendarDateValue(value);
      return !!date && date >= visibleRangeStart && date < visibleRangeEnd;
    };
    const sortEvents = (items: any[]) =>
      [...items].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const matchesCalendarItem = (event: any, item: any) => {
      const eventId = String(event?.id || '');
      const eventGoogleId = String(event?.googleEventId || '');
      const itemId = String(item?.id || '');
      const itemGoogleId = String(item?.googleEventId || '');
      if (itemId && (eventId === itemId || eventGoogleId === itemId)) return true;
      if (itemGoogleId && (eventId === itemGoogleId || eventGoogleId === itemGoogleId)) return true;
      return false;
    };

    if (name === 'calendar_create') {
      const item = result?.item;
      if (item && inVisibleWeek(item.startDate)) {
        const nextEvent = {
          id: String(item.id || item.googleEventId || `calendar-${Date.now()}`),
          title: String(item.title || ''),
          startDate: parseCalendarDateValue(item.startDate) || new Date(),
          endDate: parseCalendarDateValue(item.endDate) || new Date(),
          isGoogleEvent: false,
          googleEventId: typeof item.googleEventId === 'string' ? item.googleEventId : undefined,
          location: typeof item.location === 'string' ? item.location : undefined,
          isAllDay: false,
        };
        setEvents((current) =>
          sortEvents([
            ...current.filter((event) => !matchesCalendarItem(event, item)),
            nextEvent as any,
          ]) as any
        );
      }
    }

    if (name === 'calendar_update') {
      const item = result?.item;
      if (item) {
        setEvents((current) => {
          const nextItems = current.filter((event) => !matchesCalendarItem(event, item));
          if (inVisibleWeek(item.startDate)) {
            nextItems.push({
              ...(current.find((event) => matchesCalendarItem(event, item)) || {}),
              id: String(item.id || item.googleEventId || ''),
              title: String(item.title || ''),
              startDate: parseCalendarDateValue(item.startDate) || new Date(),
              endDate: parseCalendarDateValue(item.endDate) || new Date(),
              isGoogleEvent: item.source === 'google',
              googleEventId:
                item.source === 'google'
                  ? String(item.id || '')
                  : typeof item.googleEventId === 'string'
                    ? item.googleEventId
                    : undefined,
              location: typeof item.location === 'string' ? item.location : undefined,
              isAllDay: !!item.isAllDay,
            } as any);
          }
          return sortEvents(nextItems) as any;
        });
      }
    }

    if (name === 'calendar_delete') {
      setEvents((current) => current.filter((event) => !matchesCalendarItem(event, result)) as any);
    }

    if (compactResyncTimeoutRef.current) {
      clearTimeout(compactResyncTimeoutRef.current);
    }
    compactResyncTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          await fetchEventsForWeek(weekStart, { silent: true });
          setRefreshKey((value) => value + 1);
        } catch {}
      })();
    }, 800);
  };

  // drag move helpers placed after dependencies are declared
  const updateEventTime = useCallback(async (event: EventModel, newStart: Date, newEnd: Date) => {
    const eventKey = String(event.id);
    pendingOptimisticEventIdsRef.current.add(eventKey);
    let linkedGoogleEventId = event.googleEventId ? String(event.googleEventId) : null;
    let isGoogleEvent = !!event.isGoogleEvent;

    // Optimistic UI update via override map (keep types intact)
    setOptimisticOverrides((prev) => ({
      ...prev,
      [eventKey]: { startDate: newStart, endDate: newEnd },
    }));

    try {
      if (!isGoogleEvent && !linkedGoogleEventId) {
        try {
          const localRecord = await database.get<EventModel>('events').find(event.id);
          linkedGoogleEventId = localRecord.googleEventId ? String(localRecord.googleEventId) : null;
          isGoogleEvent = !!localRecord.isGoogleEvent;
        } catch {}
      }

      // Update Google if linked
      if (isGoogleEvent || linkedGoogleEventId) {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('No access token');

        const eventId = isGoogleEvent ? event.id : linkedGoogleEventId;

        // fetch details to detect all-day and permissions
        const details: any = await getGoogleCalendarEvent(eventId!);
        if (!details) throw new Error('Could not fetch Google event details');

        const isAllDay = !!(details.start?.date && !details.start?.dateTime);
        const canModify = !!(details.organizer?.self || details.guestsCanModify);
        if (!canModify) {
          throw new Error('403 Forbidden - read only');
        }

        const tz = details.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const body = isAllDay
          ? {
              start: { date: format(newStart, 'yyyy-MM-dd') },
              end: { date: format(newEnd, 'yyyy-MM-dd') },
            }
          : {
              start: { dateTime: newStart.toISOString(), timeZone: tz },
              end: { dateTime: newEnd.toISOString(), timeZone: tz },
            };

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const txt = await response.text().catch(() => '');
          throw new Error(`Google update failed: ${response.status} ${txt}`);
        }

        // Verify (background check)
        try {
          const verify = await getGoogleCalendarEvent(eventId!);
          if (!verify) throw new Error('Verify failed: no event');

          const ok = isAllDay
            ? (verify.start?.date === format(newStart, 'yyyy-MM-dd') &&
               verify.end?.date === format(newEnd, 'yyyy-MM-dd'))
            : (
                new Date(verify.start?.dateTime || verify.start?.date).getTime() === newStart.getTime() &&
                new Date(verify.end?.dateTime || verify.end?.date).getTime() === newEnd.getTime()
              );

          if (!ok) throw new Error('Verify failed: mismatch');
        } catch (verr) {
          // Rollback on verification failure
          setOptimisticOverrides((prev) => {
            const copy = { ...prev };
            delete copy[eventKey];
            return copy;
          });
          Alert.alert('Update failed', 'Could not confirm the change on Google. Reverted.');
          return;
        }
      }

      // Update local DB if record exists
      try {
        await database.write(async () => {
          const record = await database.get<EventModel>('events').find(event.id);
          await record.update((r) => {
            r.startDate = newStart;
            r.endDate = newEnd;
            r.startTime = newStart.getHours();
            r.endTime = newEnd.getHours();
          });
        });
      } catch {
        // Ignore if this is a pure Google event not stored locally
      }

      // Refresh silently to replace with updated records/models, then clear optimistic override
      try {
        await fetchEventsForWeek(weekStart, { silent: true });
      } catch {}
      // Clear optimistic override after success
      setOptimisticOverrides((prev) => {
        const copy = { ...prev };
        delete copy[eventKey];
        return copy;
      });
    } catch (e: any) {
      // Rollback on hard failure
      setOptimisticOverrides((prev) => {
        const copy = { ...prev };
        delete copy[eventKey];
        return copy;
      });

      const msg = String(e?.message || '');
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        Alert.alert('Read-only event', "This Google Calendar event can't be moved.");
      } else if (msg.includes('400') || msg.toLowerCase().includes('badrequest')) {
        Alert.alert('Cannot move event', 'All-day events must be moved by whole days, and some events are read-only.');
      } else {
        Alert.alert('Error', 'Failed to move event. Reverted.');
      }
    } finally {
      pendingOptimisticEventIdsRef.current.delete(eventKey);
    }
  }, [getAccessToken, weekStart]);

  const createOnEventDragStateChange = (event: EventModel) => async (e: any) => {
    if (e.nativeEvent.state === State.BEGAN) {
      // Only start dragging if user held long enough
      if (dragReadyEventId === event.id) {
        setDraggingEvent(event);
      }
      return;
    }

    if (
      (e.nativeEvent.state === State.END ||
        e.nativeEvent.state === State.CANCELLED ||
        e.nativeEvent.state === State.FAILED) &&
      e.nativeEvent.oldState !== State.ACTIVE
    ) {
      if (dragReadyEventId === event.id || draggingEvent?.id === event.id) {
        resetDrag();
      }
      return;
    }

    if (e.nativeEvent.oldState === State.ACTIVE) {
      // Require that a long-press drag was actually armed for THIS event
      if (!dragReadyEventId || dragReadyEventId !== event.id || !draggingEvent || draggingEvent.id !== event.id) {
        stopAutoScroll();
        resetDrag();
        return;
      }

      if (dropInProgressRef.current) {
        return;
      }
      dropInProgressRef.current = true;

      // Capture values synchronously before any awaits to avoid SyntheticEvent pooling
      const native = e && e.nativeEvent ? e.nativeEvent : { translationX: 0, translationY: 0 } as any;
      const tX = native.translationX || 0;
      const tY = native.translationY || 0;
      const releasedAutoScrollY = autoScrollAccumYRef.current || 0;
      stopAutoScroll();

      // Fire drop haptic immediately without awaiting to avoid delaying and losing event
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      try {

        const { daysDelta, minutesDelta: boundedMinutesDelta } = getBoundedDrag(
          event,
          tX,
          tY,
          releasedAutoScrollY
        );
        let minutesDelta = boundedMinutesDelta;

        // If all-day, ignore minute moves entirely; require whole-day moves
        const isAllDay = (event as any).isAllDay === true;
        if (isAllDay) {
          minutesDelta = 0;
        }

        if (minutesDelta !== 0 || daysDelta !== 0) {
          const newStart = new Date(event.startDate);
          const newEnd = new Date(event.endDate);

          // preserve duration exactly
          const durationMs = newEnd.getTime() - newStart.getTime();

          newStart.setDate(newStart.getDate() + daysDelta);
          newStart.setMinutes(newStart.getMinutes() + minutesDelta);

          newEnd.setTime(newStart.getTime() + durationMs);

          const prevStart = new Date(event.startDate);
          const prevEnd = new Date(event.endDate);

          const updatePromise = updateEventTime(event, newStart, newEnd);
          resetDrag();
          await updatePromise;

          // Show snackbar with relative day + time and Undo
          const relative = formatRelativeTarget(newStart);
          const timeStr = `${format(newStart, 'h:mm a')} - ${format(newEnd, 'h:mm a')}`;
          // small delay to ensure layout settled
          setTimeout(() => showSnackbar(`Moved to ${relative} • ${timeStr}`, async () => {
            // Undo: move back to previous time
            try {
              await updateEventTime(event, prevStart, prevEnd);
            } catch {}
          }), 0);
        } else {
          resetDrag();
        }
      } catch (err) {
        console.error('Drag update failed:', err);
        resetDrag();
      } finally {
        dropInProgressRef.current = false;
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!isTokenLoading) {
        fetchEventsForWeek(weekStart);
      }
    }, [isTokenLoading, fetchEventsForWeek, weekStart])
  );

  // Periodic background refresh while this screen is focused
  useFocusEffect(
    useCallback(() => {
      let intervalId: any;
      const poll = () => {
        try { fetchEventsForWeek(weekStart, { silent: true }); } catch {}
      };
      intervalId = setInterval(poll, 10000);
      return () => {
        if (intervalId) clearInterval(intervalId);
      };
    }, [weekStart, fetchEventsForWeek])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        closeCalendarOverlays();
      };
    }, [closeCalendarOverlays])
  );

  useEffect(() => {
    return () => {
      if (compactResyncTimeoutRef.current) {
        clearTimeout(compactResyncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingEventScrollDate || !selectedEvent || !eventDetails) return;
    if (!timelineLayoutReady) return;

    const targetWeekStart = startOfWeek(pendingEventScrollDate, { weekStartsOn: 0 });
    if (targetWeekStart.getTime() !== weekStart.getTime()) return;

    const timer = setTimeout(() => {
      const didScroll = scrollToEventTime(pendingEventScrollDate, false);
      if (!didScroll) return;
      eventDetailsBottomSheetRef.current?.expand();
      setPendingEventScrollDate(null);
    }, 0);

    return () => clearTimeout(timer);
  }, [pendingEventScrollDate, selectedEvent, eventDetails, timelineLayoutReady, weekStart, scrollToEventTime]);

  const createGoogleCalendarEvent = async (): Promise<string | null> => {
    let currentAccessToken = await getAccessToken();
    if (!currentAccessToken) {
      return null;
    }
    if (!selectedSlot || !eventTitle) {
      console.error('Missing required data for creating event');
      return null;
    }

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startDateTime = new Date(selectedSlot.date);
    startDateTime.setHours(selectedSlot.hour, 0, 0, 0);
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(selectedSlot.hour + 1, 0, 0, 0);

    const formatToRFC3339 = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + 'T' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes()) + ':' +
        pad(date.getSeconds()) +
        (userTimeZone === 'UTC' ? 'Z' : '');
    };

    const event = {
      summary: eventTitle,
      description: 'Event created from wave',
      location: location,
      start: {
        dateTime: formatToRFC3339(startDateTime),
        timeZone: userTimeZone,
      },
      end: {
        dateTime: formatToRFC3339(endDateTime),
        timeZone: userTimeZone,
      },
      conferenceData: {
        createRequest: {
          requestId: Math.random().toString(36).substring(2),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      attendees: guests.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    try {
      // console.log('Sending request to Google Calendar API');
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (response.ok) {
        const responseData = await response.json();
        return responseData.id;
      } else {
        console.error('Failed to create event on Google Calendar');
        return null;
      }
    } catch (error) {
      console.error('Error creating event on Google Calendar:', error);
      return null;
    }
  };

  const getGoogleCalendarEvent = async (eventId: string) => {
    let currentAccessToken = await getAccessToken();
    // console.log({ currentAccessToken }, { eventId })
    if (!currentAccessToken) {
      return null;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const eventData = await response.json();
        return eventData;
      } else {
        console.error('Failed to fetch event from Google Calendar');
        return null;
      }
    } catch (error) {
      console.error('Error fetching event from Google Calendar:', error);
      return null;
    }
  };

  // delete event
  const deleteEvent = useCallback(async (event: EventModel) => {
    // console.log({ event })
    const accessToken = await getAccessToken();
    const deleteFromGoogle = async () => {
      if (!accessToken) {
        console.error('No access token available');
        return false;
      }

      const eventId = event.isGoogleEvent ? event.id : event.googleEventId;
      if (!eventId) {
        console.error('No Google event ID available');
        return true; // Consider it a success if there's no Google event ID
      }

      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.status === 404) {
          // console.log('Event not found in Google Calendar, considering deletion successful');
          return true;
        }

        return response.ok;
      } catch (error) {
        console.error('Error deleting event from Google Calendar:', error);
        return false;
      }
    };

    const deleteFromLocal = async () => {
      try {
        await database.write(async () => {
          const recordId = (event as any)?.id || (event as any)?._raw?.id;
          if (recordId) {
            const record = await database.get('events').find(recordId);
            await record.destroyPermanently();
          }
        });
        return true;
      } catch (error) {
        console.error('Error deleting event from local database:', error);
        console.error('Event details:', event);
        return false;
      }
    };
    Alert.alert(
      "Delete Event",
      "Are you sure you want to delete this event?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Close the event details sheet immediately for instant UI feedback
              eventDetailsBottomSheetRef.current?.close();
              // For Google events
              if (event.isGoogleEvent) {
                const success = await deleteFromGoogle();
                if (!success) {
                  throw new Error('Failed to delete Google event');
                }
              }
              // For local events (including todos)
              else {
                const success = await deleteFromLocal();
                if (!success) {
                  throw new Error('Failed to delete local event');
                }
                // If it also has a Google event ID, delete from Google
                if (event.googleEventId) {
                  await deleteFromGoogle();
                }
              }

              // If we get here, the deletion was successful
              // console.log('Event deleted successfully');
              eventDetailsBottomSheetRef.current?.close();
              await fetchEventsForWeek(weekStart);
              setRefreshKey(prevKey => prevKey + 1);
            } catch (error) {
              console.error('Error during deletion:', error);
              Alert.alert('Error', 'Failed to delete the event. Please try again.');
            }
          }
        }
      ]
    );
  }, [getAccessToken, fetchEventsForWeek, weekStart]);


  const handleEventPress = useCallback(async (event: EventModel) => {
    const fetchEventDetails = async () => {
      if (event.isGoogleEvent) {
        return await getGoogleCalendarEvent(event.id);
      } else if (event.googleEventId) {
        const googleEventDetails = await getGoogleCalendarEvent(event.googleEventId);
        return {
          ...googleEventDetails,
          location: event.location || googleEventDetails.location,
          latitude: event.latitude,
          longitude: event.longitude,
        };
      } else {
        // console.log('Fetching local event details');
        return {
          id: event.id,
          summary: event.title,
          start: { dateTime: event.startDate.toISOString() },
          end: { dateTime: event.endDate.toISOString() },
          location: event.location,
          latitude: event.latitude,
          longitude: event.longitude,
        };
      }
    };
    const details = await fetchEventDetails();
    if (details) {
      // Normalize selected event to ensure title and dates are present (esp. for Google events)
      let normalizedSelected: EventModel = event;
      if (event.isGoogleEvent) {
        const startIso = details?.start?.dateTime || details?.start?.date;
        const endIso = details?.end?.dateTime || details?.end?.date;
        normalizedSelected = {
          ...event,
          title: event.title || details?.summary || '',
          startDate: parseCalendarDateValue(startIso) || event.startDate,
          endDate: parseCalendarDateValue(endIso) || event.endDate,
        } as EventModel;
      }
      setSelectedEvent(normalizedSelected);
      setEventDetails(details);
      const eventStart = new Date(normalizedSelected.startDate);
      const targetWeekStart = startOfWeek(eventStart, { weekStartsOn: 0 });
      if (targetWeekStart.getTime() !== weekStart.getTime()) {
        setWeekStart(targetWeekStart);
      }
      setPendingEventScrollDate(eventStart);
      setIsEventDetailsOpen(true);
    }
  }, [getGoogleCalendarEvent, weekStart]);

  const handleSearchResultPress = useCallback(async (item: SearchItem) => {
    try {
      closeSearch();
      if (item.source === 'local') {
        const localEvent = await database.get<EventModel>('events').find(item.id);
        await handleEventPress(localEvent);
      } else {
        const pseudoEvent: any = {
          id: item.id,
          title: item.title,
          startDate: item.startDate,
          endDate: item.endDate,
          isGoogleEvent: true,
          isAllDay: item.isAllDay,
        };
        await handleEventPress(pseudoEvent);
      }
    } catch (e) {
      // noop
    }
  }, [closeSearch, handleEventPress]);

  // Queue opening from params on focus, avoid duplicate opens for same id
  useFocusEffect(
    useCallback(() => {
      const uniqueKey = `${openEventId || ''}:${openNonce || ''}`;
      if (openEventId && openedFromParamsRef.current !== uniqueKey) {
        setPendingOpen({ id: String(openEventId), source: openEventSource === 'google' ? 'google' : 'local' });
        openedFromParamsRef.current = uniqueKey;
      }
    }, [openEventId, openEventSource, openNonce])
  );

  // Attempt to open when prerequisites are ready (e.g., tokens fetched on first app launch)
  useEffect(() => {
    if (!pendingOpen) return;
    const attempt = async () => {
      if (isOpeningFromParamsRef.current) return;
      isOpeningFromParamsRef.current = true;
      try {
        if (pendingOpen.source === 'google') {
          if (isTokenLoading || !hasTokens) return; // wait for tokens
          const pseudoEvent: any = {
            id: pendingOpen.id,
            title: '',
            startDate: new Date(),
            endDate: new Date(),
            isGoogleEvent: true,
          };
          await handleEventPress(pseudoEvent);
          setPendingOpen(null);
        } else {
          const local = await database.get<EventModel>('events').find(pendingOpen.id);
          await handleEventPress(local);
          setPendingOpen(null);
        }
      } catch {
        // keep pending if it fails; will retry on next relevant state change
      } finally {
        isOpeningFromParamsRef.current = false;
      }
    };
    attempt();
  }, [pendingOpen, isTokenLoading, hasTokens, handleEventPress]);


  // note create in event details
  const renderEventDetailsBottomSheetContent = () => (
    <View style={styles.eventBottomSheetContent}>
      <View style={styles.bottomSheetHeader}>
        <TouchableOpacity
          onPress={() => eventDetailsBottomSheetRef.current?.close()}
          style={styles.closeButtonContainer}
        >
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectedEvent && (
            <TouchableOpacity
              onPress={() => {
                if (!selectedEvent || !eventDetails) return;
                setIsEditMode(true);
                setEditingEvent(selectedEvent);
                setEditTitle(selectedEvent.title || '');
                try {
                  const startIso = eventDetails?.start?.dateTime || eventDetails?.start?.date;
                  const endIso = eventDetails?.end?.dateTime || eventDetails?.end?.date;
                  const start = parseCalendarDateValue(startIso) || new Date(selectedEvent.startDate);
                  const end = parseCalendarDateValue(endIso) || new Date(selectedEvent.endDate);
                  setEditStart(start);
                  setEditEnd(end);
                } catch {
                  setEditStart(new Date(selectedEvent.startDate));
                  setEditEnd(new Date(selectedEvent.endDate));
                }
                try {
                  const emails = (eventDetails?.attendees || []).map((a: any) => a?.email).filter((e: any) => !!e);
                  setEditGuests(emails);
                } catch {
                  setEditGuests([]);
                }
                eventDetailsBottomSheetRef.current?.close();
                bottomSheetRef.current?.snapToIndex(0);
              }}
              style={[styles.saveButton, styles.actionButton, { marginRight: 8 }]}
            >
              <Text style={styles.saveButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
          {selectedEvent && (
            <TouchableOpacity onPress={() => deleteEvent(selectedEvent)} style={[styles.deleteButton, styles.actionButton]}>
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {selectedEvent && eventDetails ? (
        <View>
          <View style={styles.eventHeader}>
            <View style={[styles.eventColorIndicator, { backgroundColor: selectedEvent.isGoogleEvent ? '#4285F4' : EAZEE_EVENT_COLOR }]} />
            <Text style={styles.eventDetailTitle}>{selectedEvent.title}</Text>
          </View>
          <Text style={styles.eventDetailDateTime}>
            {(() => {
              const startIso = eventDetails?.start?.dateTime || eventDetails?.start?.date;
              const endIso = eventDetails?.end?.dateTime || eventDetails?.end?.date;
              if (!startIso || !endIso) return '';
              const start = parseCalendarDateValue(startIso);
              const end = parseCalendarDateValue(endIso);
              if (!start || !end) return '';
              const isAllDay = !eventDetails?.start?.dateTime || !eventDetails?.end?.dateTime;
              return isAllDay
                ? `${format(start, 'EEE, MMM d')} • All day`
                : `${format(start, 'EEE, MMM d • h:mm a')} - ${format(end, 'h:mm a')}`;
            })()}
          </Text>
          <View style={styles.inputSeparator} />
          {eventDetails.hangoutLink && (
            <>
              <TouchableOpacity onPress={() => Linking.openURL(eventDetails.hangoutLink)} style={styles.eventContainer}>
                <View style={styles.iconContainer}>
                  <Icon name="video" size={20} color="black" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.joinText}>Join with Google Meet</Text>
                  <Text style={styles.linkText}>{eventDetails.hangoutLink}</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
          {eventDetails.location && (
            <>
              <View style={styles.eventContainer}>
                <View style={styles.iconContainer}>
                  <Icon name="map-marker" size={20} color="black" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.locationText}>{eventDetails.location}</Text>
                </View>
              </View>
              {eventDetails.latitude && eventDetails.longitude && (
                <>
                  {renderMiniMap(eventDetails.latitude, eventDetails.longitude)}
                </>
              )}
            </>
          )}
          {eventDetails.attendees && eventDetails.attendees.length > 0 && (
            <View style={styles.eventContainer}>
              <View style={styles.iconContainer}>
                <Icon name="account-multiple" size={20} color="black" />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.guestText}>{eventDetails.attendees.length} guests</Text>
                <Text style={styles.linkText}>
                  {eventDetails.attendees.filter((attendee: any) => attendee.responseStatus === 'accepted').length} yes
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        <Text>Loading event details...</Text>
      )}
    </View>
  );

  const handleSave = async () => {
    if (selectedSlot && eventTitle) {
      Keyboard.dismiss();
      const startDate = new Date(selectedSlot.date);
      startDate.setHours(selectedSlot.hour, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(selectedSlot.hour + 1, 0, 0, 0);

      try {
        const googleEventId = await createGoogleCalendarEvent();
        await database.write(async () => {
          const eventsCollection = database.get<EventModel>('events');
          await eventsCollection.create((event) => {
            if (event) {
              event.title = eventTitle;
              event.startDate = startDate;
              event.startTime = selectedSlot.hour;
              event.endDate = endDate;
              event.endTime = selectedSlot.hour + 1;
              if (googleEventId) {
                event.googleEventId = googleEventId;
              }
              event.isGoogleEvent = false;
              event.location = location;
              if (selectedLocation) {
                event.latitude = selectedLocation.lat;
                event.longitude = selectedLocation.lng;
              }
            } else {
              console.error('Event object is undefined in create function');
            }
          });
        });

        Keyboard.dismiss();
        bottomSheetRef.current?.close();
        setEventTitle('');
        setSelectedSlot(null);
        setGuests([]);
        setNewGuest('');
        setSelectedLocation(null);

        await fetchEventsForWeek(weekStart);
        setRefreshKey(prevKey => prevKey + 1);
      } catch (error) {
        console.error('Error in handleSave:', error);
      }
    } else {
      // console.log('Missing selectedSlot or eventTitle');
    }
    // console.log('Finished handleSave');
  };

  const handleUpdate = async () => {
    if (!editingEvent) return;

    try {
      Keyboard.dismiss();
      const currentStart = editStart ? new Date(editStart) : new Date(editingEvent.startDate);
      let currentEnd = editEnd ? new Date(editEnd) : new Date(editingEvent.endDate);
      // If same-clock time rolls end before start (e.g., 11 PM -> 12 AM), move end to next day
      if (currentEnd <= currentStart) {
        currentEnd = new Date(currentEnd.getTime() + 24 * 60 * 60000);
      }

      // Update Google Calendar if it's a Google event
      if (editingEvent.isGoogleEvent || editingEvent.googleEventId) {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const eventId = editingEvent.isGoogleEvent ? editingEvent.id : editingEvent.googleEventId;
        // Try to include time changes too
        const details: any = await getGoogleCalendarEvent(eventId!);
        const isAllDay = !!(details?.start?.date && !details?.start?.dateTime);
        const tz = details?.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timeBody = isAllDay
          ? {
              start: { date: format(currentStart, 'yyyy-MM-dd') },
              end: { date: format(currentEnd, 'yyyy-MM-dd') },
            }
          : {
              start: { dateTime: currentStart.toISOString(), timeZone: tz },
              end: { dateTime: currentEnd.toISOString(), timeZone: tz },
            };
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: editTitle,
              attendees: editGuests.map(email => ({ email })),
              ...timeBody,
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to update Google Calendar event');
        }
      }

      // Update local database
      await database.write(async () => {
        const event = await database.get<EventModel>('events').find(editingEvent.id);
        await event.update((record: EventModel) => {
          record.title = editTitle;
          try {
            if (editStart && editEnd) {
              record.startDate = currentStart;
              record.endDate = currentEnd;
              record.startTime = currentStart.getHours();
              record.endTime = currentEnd.getHours();
            }
          } catch {}
        });
      });

      // Close bottom sheet and reset states
      Keyboard.dismiss();
      bottomSheetRef.current?.close();
      setIsEditMode(false);
      setEditingEvent(null);
      setEditStart(null);
      setEditEnd(null);
      await fetchEventsForWeek(weekStart);
      setRefreshKey(prevKey => prevKey + 1);

    } catch (error) {
      console.error('Error updating event:', error);
      Alert.alert('Error', 'Failed to update event. Please try again.');
    }
  };


  const handleBottomSheetChange = (index: number) => {
    setIsAnyBottomSheetOpen(index !== -1);
    setIsBottomSheetExpanded(index === 1);
    if (index === -1) {
      Keyboard.dismiss();
      setSelectedSlot(null);
      setSelectedSlotKey(null);
      setEventTitle('');
      setGuests([]);
      setNewGuest('');
      setLocation('');
      setSelectedLocation(null);
      resetEditState();
    }
  };


  const renderBottomSheetContent = () => (
    <View style={styles.bottomSheetContent}>
      <View style={styles.bottomSheetHeader}>
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            bottomSheetRef.current?.close();
            setIsEditMode(false);
            setEditingEvent(null);
            setEditStart(null);
            setEditEnd(null);
          }}
          style={styles.closeButtonContainer}
        >
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={isEditMode ? handleUpdate : handleSave}
          style={[styles.saveButton, isEditMode ? styles.primaryWideButton : null]}
        >
          <Text style={styles.saveButtonText}>{isEditMode ? 'Update' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
      <BottomSheetTextInput
        style={styles.titleInput}
        placeholder="Add title"
        placeholderTextColor="#000"
        value={isEditMode ? editTitle : eventTitle}
        onChangeText={isEditMode ? setEditTitle : setEventTitle}
      />
      {selectedSlot && !isEditMode && (
        <Text style={styles.dateTimeText}>
          {formatDate(selectedSlot.date)}, {selectedSlot.hour}:00 - {selectedSlot.hour + 1}:00
        </Text>
      )}
      {isEditMode && editStart && editEnd && (
        <>
          <View style={styles.inputSeparator} />
          <View style={[styles.inputContainer, { height: undefined, paddingVertical: 8 }]}> 
            <Icon name="calendar" size={24} color="#666" style={styles.inputIcon} />
            <TouchableOpacity onPress={() => setShowEditDatePicker(true)}>
              <Text style={{ fontSize: 16 }}>{format(editStart, 'EEE, MMM d')}</Text>
            </TouchableOpacity>
          </View>
          {showEditDatePicker && (
            <DateTimePicker
              value={editStart}
              mode="date"
              display="default"
              onChange={(_, date) => {
                setShowEditDatePicker(false);
                if (!date) return;
                const duration = editEnd.getTime() - editStart.getTime();
                const ns = new Date(editStart);
                ns.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                const ne = new Date(ns.getTime() + Math.max(15 * 60000, duration));
                setEditStart(ns);
                setEditEnd(ne);
              }}
            />
          )}
          <View style={[styles.inputContainer, { height: undefined, paddingVertical: 8 }]}> 
            <Icon name="clock-outline" size={24} color="#666" style={styles.inputIcon} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TouchableOpacity onPress={() => setShowEditStartPicker(true)}>
                <Text style={{ minWidth: 90 }}>Start: {format(editStart, 'h:mm a')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowEditEndPicker(true)}>
                <Text style={{ minWidth: 90 }}>End: {format(editEnd, 'h:mm a')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {showEditStartPicker && (
            <DateTimePicker
              value={editStart}
              mode="time"
              display="default"
              minuteInterval={15}
              onChange={(_, date) => {
                setShowEditStartPicker(false);
                if (!date) return;
                const duration = Math.max(15 * 60000, editEnd.getTime() - editStart.getTime());
                const ns = new Date(editStart);
                ns.setHours(date.getHours(), date.getMinutes(), 0, 0);
                const ne = new Date(ns.getTime() + duration);
                setEditStart(ns);
                setEditEnd(ne);
              }}
            />
          )}
          {showEditEndPicker && (
            <DateTimePicker
              value={editEnd}
              mode="time"
              display="default"
              minuteInterval={15}
              onChange={(_, date) => {
                setShowEditEndPicker(false);
                if (!date) return;
                const ne = new Date(editEnd);
                ne.setHours(date.getHours(), date.getMinutes(), 0, 0);
                // Ensure end is after start; if not, roll to next day
                if (ne <= editStart) {
                  ne.setDate(ne.getDate() + 1);
                }
                setEditEnd(ne);
              }}
            />
          )}
        </>
      )}
      <View style={styles.inputSeparator} />
      <View style={styles.inputContainer}>
        <Icon name="account-multiple" size={24} color="#666" style={styles.guestIcon} />
        <View style={styles.guestInputWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.guestChipsContainer}>
            {(isEditMode ? editGuests : guests).map((guest, index) => (
              <GuestChip
                key={index}
                email={guest}
                onRemove={() => {
                  if (isEditMode) {
                    setEditGuests(editGuests.filter((_, i) => i !== index));
                  } else {
                    setGuests(guests.filter((_, i) => i !== index));
                  }
                }}
              />
            ))}
          </ScrollView>
          <BottomSheetTextInput
            style={styles.guestInput}
            placeholder={(isEditMode ? editGuests : guests).length === 0 ? "Add guests" : ""}
            placeholderTextColor="#000"
            value={newGuest}
            autoCapitalize="none"
            onChangeText={(text) => {
              setNewGuest(text);
              if (text.includes(' ') || text.includes(',')) {
                const newGuests = text.split(/[\s,]+/).filter(email => email.includes('@'));
                if (newGuests.length > 0) {
                  if (isEditMode) {
                    setEditGuests([...editGuests, ...newGuests]);
                  } else {
                    setGuests([...guests, ...newGuests]);
                  }
                  setNewGuest('');
                }
              }
            }}
            onSubmitEditing={() => {
              if (newGuest) {
                const newGuests = newGuest.split(/[\s,]+/).filter(email => email.includes('@'));
                if (newGuests.length > 0) {
                  if (isEditMode) {
                    setEditGuests([...editGuests, ...newGuests]);
                  } else {
                    setGuests([...guests, ...newGuests]);
                  }
                  setNewGuest('');
                }
              }
            }}
          />
        </View>
      </View>
      <View style={styles.inputSeparator} />
    </View>
  );

  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  const checkSignInStatus = useCallback(async () => {
    const accessToken = await getAccessToken();
    // console.log('Checking sign-in status');
    if (!accessToken) {
      setIsSignedIn(false);
      return;
    }

    try {
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (response.ok) {
        setIsSignedIn(true);
      } else {
        setIsSignedIn(false);
      }
    } catch (error) {
      console.error('Error checking sign-in status:', error);
      setIsSignedIn(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    checkSignInStatus();
  }, [checkSignInStatus]);

  const CalendarHeader: React.FC = () => {
    const currentMonth = format(weekStart, 'MMMM');
    const currentDate = format(new Date(), 'd');

    return (
      <View style={styles.calendarHeader}>
        <View style={styles.screenTitleRow}>
          <Text style={styles.screenTitleText}>Calendar</Text>
        </View>

        <View style={styles.calendarControlsRow}>
          <View style={styles.monthSection}>
            <Text style={styles.monthText}>{currentMonth}</Text>
          </View>

          <View style={styles.headerRightIcons}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setIsSearchOpen(true)}>
              <Icon name="magnify" size={24} color="#DFFBFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.dateButton}>
              <Text style={styles.dateButtonText}>{currentDate}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };


  return (
    <View style={{ flex: 1, backgroundColor: '#0E4048' }} key={refreshKey}>
    <LinearGradient colors={['#219BAE', '#0E4048']} locations={[0, 1]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 1 }} style={[styles.container, { paddingTop: insets.top, minHeight: Dimensions.get('screen').height }]}>
      <View
        style={{
          position: 'absolute',
          top: -24,
          left: -12,
          right: -12,
          bottom: -24,
          zIndex: 11,
        }}
        pointerEvents="none"
      >
        <Image
          source={require('../../../assets/images/calendar-bg.png')}
          style={{
            width: '100%',
            height: '100%',
            opacity: 0.11,
          }}
          resizeMode="stretch"
        />
      </View>
      {isFocused && <StatusBar style="light" />}
      {/* {!isSignedIn && (
        <TouchableOpacity onPress={signIn} style={styles.signInButton}>
          <Text style={styles.signInButtonText}>Sign in with Google</Text>
        </TouchableOpacity>
      )} */}
      <View style={{ flex: 1, paddingBottom: contentBottomPadding }}>
      <CalendarHeader />
      <Modal
        visible={isSearchOpen}
        transparent={false}
        animationType="fade"
        statusBarTranslucent={true}
        presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : 'overFullScreen'}
        onRequestClose={() => {
          closeSearch();
        }}
        onShow={async () => {
          if (Platform.OS === 'android') {
            try {
              await NavigationBar.setBackgroundColorAsync('#219BAE');
              await NavigationBar.setButtonStyleAsync('light');
              await NavigationBar.setBehaviorAsync('inset-swipe');
              await NavigationBar.setVisibilityAsync('visible');
            } catch {}
          }
        }}
      >
        <TouchableWithoutFeedback onPress={() => {}}>
          <LinearGradient colors={['#219BAE', '#0E4048']} locations={[0, 1]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 1 }} style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <View
              style={{
                position: 'absolute',
                top: -24,
                left: -12,
                right: -12,
                bottom: -24,
                zIndex: 11,
              }}
              pointerEvents="none"
            >
              <Image
                source={require('../../../assets/images/calendar-bg.png')}
                style={{
                  width: '100%',
                  height: '100%',
                  opacity: 0.11,
                }}
                resizeMode="stretch"
              />
            </View>
            {isFocused && <StatusBar style="light" />}
            <View className="flex-row items-center px-4 pt-2 pb-2 border-b" style={{ borderBottomColor: 'rgba(223, 251, 255, 0.3)' }}>
              <TouchableOpacity className="p-1 mr-2" onPress={() => {
                closeSearch();
              }}>
                <Icon name="arrow-left" size={24} color="#DFFBFF" />
              </TouchableOpacity>
              <TextInput
                className="flex-1 h-10 text-base"
                placeholder="Search"
                placeholderTextColor="#DFFBFF"
                style={{ color: '#DFFBFF' }}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 16 }}>
              {isSearching ? (
                <View className="py-4">
                  <Text style={{ color: '#DFFBFF' }}>Searching…</Text>
                </View>
              ) : (
                <>
                  {groupedSearchResults.map((group) => {
                    const first = group.items[0];
                    const rest = group.items.slice(1);
                    return (
                      <View key={`group-${group.dateKey}`} style={{ paddingTop: 6, paddingBottom: 4 }}>
                        {first && (
                          <TouchableOpacity key={`${first.source}-${first.id}`} className="flex-row items-start py-1" activeOpacity={0.7} onPress={() => handleSearchResultPress(first)}>
                            <View style={{ width: 80 }}>
                              <Text style={{ color: '#DFFBFF', fontSize: 12 }}>{format(group.date, 'EEE')}</Text>
                              <Text style={{ color: '#DFFBFF', fontSize: 14, fontWeight: '600' }}>{format(group.date, 'MMM d')}</Text>
                            </View>
                            <View
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                padding: 10,
                                backgroundColor: '#155A64',
                              }}
                            >
                              <Text style={{ color: '#DFFBFF', fontWeight: '700' }} numberOfLines={2}>{first.title || '(No title)'}</Text>
                              <Text style={{ color: '#DFFBFF', opacity: 0.9, marginTop: 2, fontSize: 12 }}>
                                {first.isAllDay ? 'All day' : format(first.startDate, 'p')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                        {rest.map((item) => (
                          <TouchableOpacity key={`${item.source}-${item.id}`} className="flex-row items-start py-1" activeOpacity={0.7} onPress={() => handleSearchResultPress(item)}>
                            <View style={{ width: 80 }} />
                            <View
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                padding: 10,
                                backgroundColor: '#155A64',
                              }}
                            >
                              <Text style={{ color: '#DFFBFF', fontWeight: '700' }} numberOfLines={2}>{item.title || '(No title)'}</Text>
                              <Text style={{ color: '#DFFBFF', opacity: 0.9, marginTop: 2, fontSize: 12 }}>
                                {item.isAllDay ? 'All day' : format(item.startDate, 'p')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })}
                  {!isSearching && searchQuery.trim() !== '' && searchResults.length === 0 && (
                    <View className="py-6">
                      <Text style={{ color: '#DFFBFF' }}>No events found</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </LinearGradient>
        </TouchableWithoutFeedback>
      </Modal>
      <View style={styles.calendarGridWrapper}>
        {renderWeekHeader()}
        {renderAllDayEvents()}
        {isLoading && <PulsatingLine width={500} height={4} />}
        <PinchGestureHandler
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchHandlerStateChange}
        >
          <ScrollView ref={timelineScrollViewRef}
            style={styles.timelineContainer}
            scrollEnabled={!draggingEvent && !isPinching}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onLayout={(e) => {
              scrollViewHeightRef.current = e.nativeEvent.layout.height;
              setTimelineLayoutReady((value) => value + 1);
              setTimeout(() => {
                try {
                  const node = timelineScrollViewRef.current as any;
                  if (node && node.measureInWindow) {
                    node.measureInWindow((_x: number, y: number) => {
                      scrollViewTopInWindowRef.current = y;
                    });
                  }
                // restore previous scroll position to avoid jumping to top
                const scrollView = timelineScrollViewRef.current as any;
                if (scrollView && typeof scrollYRef.current === 'number') {
                  scrollView.scrollTo({ y: scrollYRef.current, animated: false });
                }
                } catch {}
              }, 0);
            }}
          >
            {renderTimeSlots()}
          </ScrollView>
        </PinchGestureHandler>
      </View>
      </View>
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['45%', '95%']}
        backdropComponent={renderBottomSheetBackdrop}
        keyboardBehavior="extend"
        enablePanDownToClose={true}
        onChange={handleBottomSheetChange}
      >
        {renderBottomSheetContent()}
      </BottomSheet>
      {snackbar.visible && (
        <View style={[styles.snackbarContainer, { bottom: (insets?.bottom || 0) + 84 }]} pointerEvents="box-none">
          <View style={styles.snackbar}>
            <Text style={styles.snackbarText} numberOfLines={2}>{snackbar.message}</Text>
            {snackbar.undo && (
              <TouchableOpacity onPress={() => { const fn = snackbar.undo; hideSnackbar(); fn && fn(); }}>
                <Text style={styles.snackbarAction}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      <BottomSheet
        ref={eventDetailsBottomSheetRef}
        index={-1}
        snapPoints={['96%']}
        backdropComponent={renderBottomSheetBackdrop}
        enablePanDownToClose={true}
        animateOnMount={false}
        onChange={(index) => {
          'worklet';
          const isOpen = index !== -1;
          if (index === -1) {
            runOnJS(setSelectedEvent)(null);
            runOnJS(setEventDetails)(null);
          }
          runOnJS(setIsEventDetailsOpen)(isOpen);
          if (!isOpen) {
            runOnJS(() => {
              isOpeningFromParamsRef.current = false;
            })();
          }
        }}
        onAnimate={(fromIndex, toIndex) => {
          setIsAnyBottomSheetOpen(toIndex !== -1);
          if (toIndex !== -1) {
            setIsEventDetailsOpen(true);
          }
        }}
      >
        {renderEventDetailsBottomSheetContent()}
      </BottomSheet>
    </LinearGradient>
    <CompactAiBanner
      notice={aiNotice}
      surface="calendar"
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
    {shouldRenderAiComposer && isAiComposerActive && (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 11, 14, 0.46)' }} />
        </View>
      </TouchableWithoutFeedback>
    )}
    {shouldRenderAiComposer && (
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: aiInputKeyboardBottom,
          },
          { opacity: fadeAnim },
          {
            transform: [
              {
                translateY: keyboardOffset.interpolate({
                  inputRange: [0, 1000],
                  outputRange: [0, -1000],
                  extrapolate: 'clamp',
                }),
              },
              {
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [50, 0],
                })
              },
            ]
          }
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
          surfaceVariant="chatAsset"
          containerStyle={{ backgroundColor: 'transparent' }}
        />
      </Animated.View>
    )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E4048',
  },
  weekHeader: {
    flexDirection: 'row',
  },
  calendarGridWrapper: {
    flex: 1,
    paddingHorizontal: CALENDAR_GRID_INSET,
    paddingTop: 8,
    paddingBottom: 8,
  },
  allDayDividerOnly: {
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE_COLOR,
  },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 3,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE_COLOR,
  },
  allDayLabelColumn: {
    width: TIME_LABEL_WIDTH,
    paddingTop: 4,
    paddingRight: 8,
    alignItems: 'flex-end',
  },
  allDayLabel: {
    color: '#DFFBFF',
    fontSize: 9,
    opacity: 0.8,
  },
  allDayDayColumn: {
    flex: 1,
    minHeight: 24,
    paddingHorizontal: 1,
  },
  allDayChip: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    marginBottom: 2,
  },
  allDayChipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },
  weekNumberContainer: {
    width: TIME_LABEL_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekNumberText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#DFFBFF',
  },
  timeLabel: {
    width: TIME_LABEL_WIDTH,
    height: '100%',
    justifyContent: 'flex-start',
    paddingRight: 8,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 10,
  },
  dayText: {
    fontWeight: 'bold',
    fontSize: 9,
    color: '#DFFBFF',
    textAlign: 'center',
  },
  dateCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  todayCircle: {
    backgroundColor: '#DFFBFF',
  },
  dateText: {
    fontSize: 12,
    color: '#DFFBFF',
  },
  todayText: {
    color: '#0E4048',
    fontWeight: 'bold',
  },
  timelineContainer: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE_COLOR,
  },
  timeSlotRow: {
    flexDirection: 'row',
  },
  timeText: {
    width: '100%',
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
    color: TIME_LABEL_COLOR,
  },
  quarterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingRight: 8,
    zIndex: 5,
  },
  quarterItem: {
    position: 'absolute',
    width: '100%',
    marginTop: 2,
  },
  quarterText: {
    textAlign: 'right',
    fontSize: 10,
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
    color: '#888',
    opacity: 0,
  },
  quarterTextActive: {
    color: EAZEE_EVENT_COLOR,
    opacity: 1,
  },
  timeSlotCell: {
    flex: 1,
    position: 'relative',
  },
  gridLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  gridRowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: CALENDAR_GRID_LINE_COLOR,
    zIndex: 0,
  },
  gridColLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: CALENDAR_GRID_LINE_COLOR,
    zIndex: 0,
  },
  // bottom sheet
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  // event bottom sheet
  eventBottomSheetContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  inputSeparator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    height: 48,
  },
  inputIcon: {
    marginRight: 16,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButtonContainer: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    fontSize: 20,
    color: '#666',
  },
  saveButton: {
    backgroundColor: EAZEE_EVENT_COLOR,
    padding: 10,
    borderRadius: 20,
    width: 84,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  titleInput: {
    fontSize: 24,
    marginLeft: 30,
    marginBottom: 4,
    paddingBottom: 8,
    color: '#000',
  },
  dateTimeText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 30,
    marginBottom: 10,
  },
  // event in time slot
  eventItem: {
    backgroundColor: EAZEE_EVENT_COLOR,
    borderRadius: 4,
    padding: 2,
    margin: 1,
    overflow: 'hidden',
    zIndex: 1,
    position: 'absolute',
    left: 1,
    right: 1,
  },
  eventTitle: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  selectedTimeSlot: {
    borderWidth: 1,
    borderColor: EAZEE_EVENT_COLOR,
  },
  // google sign in
  signInButton: {
    backgroundColor: '#4285F4',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  signInButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  // event details
  eventDetailTitle: {
    fontSize: 24,
    fontWeight: 'semibold',
    marginTop: 0,
    marginBottom: 0,
  },
  eventDetailDateTime: {
    fontSize: 14,
    color: '#666',
    marginLeft: 30,
    marginBottom: 10,
  },
  eventDetailDescription: {
    fontSize: 14,
    marginBottom: 10,
  },
  meetLinkButton: {
    backgroundColor: '#4285F4',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  meetLinkButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  eventColorIndicator: {
    width: 14,
    height: 14,
    borderRadius: 2,
    marginRight: 14,
    marginLeft: 2,
  },
  meetLink: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  guestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  guestCount: {
    marginLeft: 5,
    fontSize: 14,
    color: '#666',
  },
  guestName: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  // expanded bottom sheet
  guestInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 20,
    marginTop: 15,
    marginBottom: 15,
  },
  guestIcon: {
    marginRight: 10,
  },
  guestInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestChipsContainer: {
    flexGrow: 0,
  },
  guestInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
    color: '#000',
  },
  guestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  guestChipText: {
    fontSize: 14,
    marginRight: 4,
    color: '#000',
  },
  // google event
  googleEventItem: {
    backgroundColor: '#4285F4',
  },
  // event reusable components
  eventContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    marginTop: 10,
  },
  iconContainer: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    color: 'blue',
  },
  joinText: {
    color: '#4285F4',
    fontWeight: 'bold',
  },
  guestText: {
    fontWeight: 'bold',
    color: 'black',
  },
  linkText: {
    fontSize: 12,
    marginTop: 2,
    color: '#666',
  },
  // delete button
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 10,
    borderRadius: 20,
    width: 84,
  },
  actionButton: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryWideButton: {
    width: 110,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // event details - create note
  createNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: EAZEE_EVENT_COLOR,
    padding: 10,
    borderRadius: 5,
    marginTop: 15,
    justifyContent: 'center',
  },
  createNoteButtonText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  // location
  locationInputContainer: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  locationIcon: {
    marginRight: 5,
  },
  autocompleteContainer: {
    flex: 1,
  },
  locationInput: {
    fontSize: 16,
    backgroundColor: 'transparent',
    paddingLeft: 6,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    height: '100%',
  },
  locationSuggestionsList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  miniMap: {
    height: 150,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 10,
    overflow: 'hidden',
    width: '100%',
  },
  locationText: {
    fontSize: 14,
    color: '#666',
  },
  // note preview
  notePreviewContainer: {
    marginTop: 8,
    height: 100,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  notePreview: {
    fontSize: 12,
    color: '#333',
    padding: 8,
  },
  // header
  calendarHeader: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  screenTitleRow: {
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 8,
  },
  screenTitleText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#B3E7F0',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  calendarControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  monthSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DFFBFF',
  },
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
  },
  dateButton: {
    backgroundColor: '#62AEBA',
    borderRadius: 17,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  dateButtonText: {
    color: '#B7F5FF',
    fontWeight: 'bold',
  },
  snackbarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 12,
    zIndex: 999,
    elevation: 8,
  },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  snackbarText: {
    color: 'white',
    fontSize: 13,
    flex: 1,
    marginRight: 12,
  },
  snackbarAction: {
    color: '#9EE8DB',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default CalendarScreen;
