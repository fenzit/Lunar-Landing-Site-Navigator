export function createTimelinePlayback(from, to, started) {
  // Keep the short demo at 20 s, but give months and annual presets more
  // screen time so consecutive UTC positions remain visually close.
  const totalDuration = Math.min(180000, 20000 * Math.sqrt(Math.max(1, to / (7 * 24 * 60))));
  const duration = totalDuration * (to - from) / to;
  let previous = started, elapsed = 0;
  return now => {
    // A busy frame or a background tab must not catch up by jumping days.
    elapsed += Math.min(50, Math.max(0, now - previous));
    previous = now;
    const fraction = Math.min(1, elapsed / duration);
    return {fraction, minuteIndex:Math.round(from + (to - from) * fraction)};
  };
}
