/** Source of "now". Tests pass a controllable clock to check expiry rules. */
export const systemClock = { now: () => new Date() };
