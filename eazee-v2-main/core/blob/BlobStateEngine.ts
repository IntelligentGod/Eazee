export type BlobState = {
  load: number;
  control: number;
  recovery: number;
  growth: number;
  volatility: number;
};

export type BlobVisualState = {
  mood: 'calm' | 'normal' | 'stressed';
  smoothness: number;
  rippleAmp: number;
  rippleFreq: number;
  rippleSpeed: number;
  lobes: {
    home: number;
    growth: number;
    money: number;
  };
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function lerp(a: number, b: number, t: number): number {
  const tt = clamp01(t);
  return a + (b - a) * tt;
}

export function computeBlobVisualState(state: BlobState): BlobVisualState {
  const load = clamp01(state.load);
  const control = clamp01(state.control);
  const recovery = clamp01(state.recovery);
  const growth = clamp01(state.growth);
  const volatility = clamp01(state.volatility);

  let mood: BlobVisualState['mood'];
  if (load <= 0.35 && control >= 0.65 && volatility <= 0.35) {
    mood = 'calm';
  } else if (load >= 0.7 || control <= 0.35 || volatility >= 0.7) {
    mood = 'stressed';
  } else {
    mood = 'normal';
  }

  const smoothness = clamp01(
    0.65 * control +
      0.25 * recovery -
      0.45 * load -
      0.35 * volatility
  );

  const rippleAmp = clamp01(
    0.75 * volatility +
      0.55 * (1 - control) +
      0.35 * load -
      0.45 * recovery
  );

  const rippleFreq = lerp(6, 18, volatility);
  const rippleSpeed = lerp(0.6, 1.8, volatility);

  const lobesHome = clamp01(load);
  const lobesGrowth = clamp01(1 - growth);
  const lobesMoney = clamp01(load * 0.6);

  return {
    mood,
    smoothness,
    rippleAmp,
    rippleFreq,
    rippleSpeed,
    lobes: {
      home: lobesHome,
      growth: lobesGrowth,
      money: lobesMoney,
    },
  };
}

