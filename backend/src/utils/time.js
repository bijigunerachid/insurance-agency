/** Offset (ms) of `timeZone` from UTC at the given instant, e.g. +3_600_000 for UTC+1. */
function zoneOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which the calendar day `YYYY-MM-DD` starts in `timeZone`.
 * Handles Morocco's clock changes (UTC+1, UTC+0 during Ramadan) through the time-zone data.
 */
export function startOfZonedDay(isoDate, timeZone) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day);
  let result = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Re-check with the offset at the computed instant (differs only around a clock change).
  result = guess - zoneOffsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** Today's date (YYYY-MM-DD) in `timeZone`. */
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** Start of the day after `YYYY-MM-DD`: use as an exclusive upper bound. */
export function startOfNextZonedDay(isoDate, timeZone) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return startOfZonedDay(next, timeZone);
}
