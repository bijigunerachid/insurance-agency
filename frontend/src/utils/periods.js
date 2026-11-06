import { APP_TIME_ZONE } from './format.js';

/** Today in the agency's time zone, as YYYY-MM-DD. */
export const todayHere = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date());
const iso = (date) => date.toISOString().slice(0, 10);

/** First and last day of a month (0 = this one, -1 = the one before), agency time zone. */
export function monthOf(offset = 0) {
  const [year, month] = todayHere().split('-').map(Number);
  return {
    from: iso(new Date(Date.UTC(year, month - 1 + offset, 1))),
    to: iso(new Date(Date.UTC(year, month + offset, 0))),
  };
}

/** The periods asked for most, one tap each (reports, état de production). */
export const QUICK_PERIODS = {
  thisMonth: () => monthOf(0),
  lastMonth: () => monthOf(-1),
  thisYear: () => {
    const year = todayHere().slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  },
};
