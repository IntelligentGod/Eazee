import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import Markdown from 'react-native-markdown-display';
import type { CompactAiNotice } from '@/lib/useCompactTabAI';
import { parseCalendarDateValue } from '@/utils/calendarDates';

type CompactSurface = 'todo' | 'calendar' | 'home';

type CompactAiBannerProps = {
  notice: CompactAiNotice | null;
  surface: CompactSurface;
  top: number;
  onActionPress?: () => void;
  onDismissPress?: () => void;
  onCancelPress?: () => void;
};

const bannerColorsBySurface: Record<CompactSurface, [string, string]> = {
  todo: ['rgba(9, 12, 13, 0.98)', 'rgba(20, 108, 92, 0.96)'],
  calendar: ['rgba(12, 24, 27, 0.99)', 'rgba(54, 118, 128, 0.96)'],
  home: ['rgba(34, 33, 29, 0.99)', 'rgba(73, 71, 63, 0.97)'],
};

function formatCalendarNoticeTimeRange(startDate: string, endDate?: string, isAllDay?: boolean) {
  const start = parseCalendarDateValue(startDate);
  const end = parseCalendarDateValue(endDate);

  if (!start) return '';

  if (isAllDay) {
    if (!end) return `${format(start, 'EEE, MMM d')} • All day`;
    const inclusiveEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (inclusiveEnd.toDateString() === start.toDateString()) {
      return `${format(start, 'EEE, MMM d')} • All day`;
    }
    return `${format(start, 'EEE, MMM d')} - ${format(inclusiveEnd, 'EEE, MMM d')} • All day`;
  }

  if (!end) return format(start, 'EEE, MMM d • h:mm a');
  const sameDay = start.toDateString() === end.toDateString();
  return `${format(start, 'EEE, MMM d • h:mm a')} - ${format(end, sameDay ? 'h:mm a' : 'EEE, MMM d • h:mm a')}`;
}

function CalendarNoticeCards({ notice }: { notice: CompactAiNotice }) {
  if (!notice.calendarItems?.length) return null;

  return (
    <View style={{ marginTop: 12 }}>
      {notice.calendarItems.map((item, index) => {
        const timeText = formatCalendarNoticeTimeRange(item.startDate, item.endDate, item.isAllDay);
        const sourceLabel = item.source === 'google' ? 'Google' : 'Calendar';

        return (
          <View
            key={`${item.source}-${item.id}-${index}`}
            style={{
              marginTop: index === 0 ? 0 : 8,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 11,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '700', marginRight: 10 }} numberOfLines={2}>
                {item.title || 'Untitled event'}
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  backgroundColor: item.source === 'google' ? 'rgba(66, 133, 244, 0.24)' : 'rgba(34, 171, 147, 0.24)',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontWeight: '700' }}>{sourceLabel}</Text>
              </View>
            </View>
            {timeText ? (
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 16, marginTop: 5 }} numberOfLines={2}>
                {timeText}
              </Text>
            ) : null}
            {item.location ? (
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, lineHeight: 16, marginTop: 4 }} numberOfLines={1}>
                {item.location}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default function CompactAiBanner({ notice, surface, top, onActionPress, onDismissPress, onCancelPress }: CompactAiBannerProps) {
  if (!notice) return null;

  const colors = bannerColorsBySurface[surface];

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.18)',
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top,
          left: 16,
          right: 16,
        }}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'relative',
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.28,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          {onDismissPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onDismissPress}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: 24,
                height: 24,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 13, fontWeight: '700' }}>x</Text>
            </TouchableOpacity>
          ) : null}
          <Markdown
            style={{
              body: {
                color: '#FFFFFF',
                fontSize: 15,
                lineHeight: 20,
                fontWeight: '700',
                paddingRight: onDismissPress ? 28 : 0,
                margin: 0,
              },
              paragraph: {
                marginTop: 0,
                marginBottom: 0,
              },
              strong: {
                color: '#FFFFFF',
                fontWeight: '800',
              },
              em: {
                color: '#FFFFFF',
                fontStyle: 'italic',
              },
              link: {
                color: '#FFFFFF',
                textDecorationLine: 'underline',
              },
            }}
          >
            {notice.message}
          </Markdown>
          <CalendarNoticeCards notice={notice} />
          {(notice.kind === 'clarify' && onCancelPress) || (notice.kind === 'confirm' && (onCancelPress || (notice.actionLabel && onActionPress))) ? (
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
              {onCancelPress ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onCancelPress}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    backgroundColor: 'rgba(255,255,255,0.14)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                    marginRight: notice.kind === 'confirm' && notice.actionLabel && onActionPress ? 8 : 0,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 11, lineHeight: 13, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              ) : null}
              {notice.kind === 'confirm' && notice.actionLabel && onActionPress ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onActionPress}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    backgroundColor:
                      notice.actionVariant === 'destructive' ? 'rgba(255, 99, 92, 0.18)' : 'rgba(255,255,255,0.14)',
                    borderWidth: 1,
                    borderColor:
                      notice.actionVariant === 'destructive' ? 'rgba(255, 140, 132, 0.45)' : 'rgba(255,255,255,0.24)',
                  }}
                >
                  <Text
                    style={{
                      color: notice.actionVariant === 'destructive' ? '#FFE5E1' : '#FFFFFF',
                      fontSize: 11,
                      lineHeight: 13,
                      fontWeight: '700',
                    }}
                  >
                    {notice.actionLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {notice.kind !== 'confirm' && notice.actionLabel && onActionPress ? (
            <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onActionPress}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  backgroundColor:
                    notice.actionVariant === 'destructive' ? 'rgba(255, 99, 92, 0.18)' : 'rgba(255,255,255,0.14)',
                  borderWidth: 1,
                  borderColor:
                    notice.actionVariant === 'destructive' ? 'rgba(255, 140, 132, 0.45)' : 'rgba(255,255,255,0.24)',
                }}
              >
                <Text
                  style={{
                    color: notice.actionVariant === 'destructive' ? '#FFE5E1' : '#FFFFFF',
                    fontSize: 11,
                    lineHeight: 13,
                    fontWeight: '700',
                  }}
                >
                  {notice.actionLabel}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </LinearGradient>
      </View>
    </View>
  );
}
