import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type ActivityLog,
  type CalendarEvent,
  type EmailSummary,
  type Task,
  computeBehaviorMetrics,
} from '@/core/blob/BehaviorMetrics';
import { computeBlobState } from '@/core/blob/BlobStateFromBehavior';
import { computeBlobVisualState } from '@/core/blob/BlobStateEngine';

const REFRESH_INTERVAL_MS = 30_000;

export type BlobStateInput = {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  emailSummary: EmailSummary;
  activityLog: ActivityLog;
};

const defaultInput: BlobStateInput = {
  tasks: [],
  calendarEvents: [],
  emailSummary: { unreadNow: 0, unread24hAgo: 0 },
  activityLog: { events: [] },
};

export type UseBlobStateResult = {
  mood: 'calm' | 'normal' | 'stressed';
  rippleAmp: number;
  rippleFreq: number;
  rippleSpeed: number;
  smoothness: number;
  lobes: { home: number; growth: number; money: number };
};

export function useBlobState(input: BlobStateInput = defaultInput): UseBlobStateResult {
  const [intervalTick, setIntervalTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setIntervalTick(t => t + 1);
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const effective = input ?? defaultInput;

  return useMemo(() => {
    const metrics = computeBehaviorMetrics({
      tasks: effective.tasks,
      calendarEvents: effective.calendarEvents,
      emailSummary: effective.emailSummary,
      activityLog: effective.activityLog,
    });
    const state = computeBlobState(metrics);
    const visual = computeBlobVisualState(state);
    return {
      mood: visual.mood,
      rippleAmp: visual.rippleAmp,
      rippleFreq: visual.rippleFreq,
      rippleSpeed: visual.rippleSpeed,
      smoothness: visual.smoothness,
      lobes: visual.lobes,
    };
  }, [effective, intervalTick]);
}
