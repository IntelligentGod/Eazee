import type { BehaviorMetrics } from './BehaviorMetrics';
import type { BlobState } from './BlobStateEngine';
import { clamp01 } from './BlobStateEngine';

export function computeBlobState(metrics: BehaviorMetrics): BlobState {
  const load = clamp01(
    0.6 * metrics.dueSoon +
      0.7 * metrics.overdue +
      0.3 * metrics.calendarChanges
  );

  const control = clamp01(
    0.7 * metrics.completedToday -
      0.6 * metrics.overdue -
      0.4 * metrics.missedToday -
      0.3 * metrics.contextSwitches
  );

  const recovery = clamp01(1 - metrics.lateNightActivity);

  const growth = clamp01(
    metrics.completedToday * 0.5 + (1 - metrics.inboxTrend) * 0.5
  );

  const volatility = clamp01(
    0.6 * metrics.contextSwitches +
      0.6 * metrics.calendarChanges +
      0.4 * metrics.inboxTrend
  );

  return {
    load,
    control,
    recovery,
    growth,
    volatility,
  };
}
