import { fr } from '../i18n/fr.js';
import { QUICK_PERIODS } from '../utils/periods.js';

const t = fr.reports;

/** The usual periods as pills, the current one pressed; `onChange({ from, to })`. */
export function QuickPeriods({ from, to, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.quickPeriod}>
      <span aria-hidden="true" className="mr-1 text-label text-ink-soft">
        {t.quickPeriod}
      </span>
      {Object.entries(QUICK_PERIODS).map(([key, range]) => {
        const period = range();
        const current = from === period.from && to === period.to;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={current}
            onClick={() => onChange(period)}
            className={`focus-ring rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${
              current
                ? 'bg-primary text-white ring-primary'
                : 'bg-surface text-ink ring-line-strong/60 hover:bg-sunken'
            }`}
          >
            {t.periods[key]}
          </button>
        );
      })}
    </div>
  );
}
