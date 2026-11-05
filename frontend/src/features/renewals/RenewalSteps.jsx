import { CheckIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { fr } from '../../i18n/fr.js';

const t = fr.renewals;
const STEPS = ['TO_PREPARE', 'CUSTOMER_CONTACTED', 'DOCUMENTS_COMPLETE'];

/**
 * Where the follow-up stands, from its stored status only: the steps done, the one in progress,
 * those to come. It ends « Renouvelé » or, when the client did not renew, « Non renouvelé ».
 */
export function RenewalSteps({ status }) {
  const steps = [...STEPS, status === 'NOT_RENEWED' ? 'NOT_RENEWED' : 'RENEWED'];
  const current = steps.indexOf(status);
  const closed = status === 'RENEWED' || status === 'NOT_RENEWED';

  return (
    <ol aria-label={t.stepsLabel} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {steps.map((step, index) => {
        // A closed follow-up has no step in progress: its last step is done (or refused).
        const done = index < current || (closed && index === current && step === 'RENEWED');
        const refused = step === 'NOT_RENEWED';
        const active = index === current && !closed;
        const state = refused
          ? t.stepRefused
          : done
            ? t.stepDone
            : active
              ? t.stepCurrent
              : t.stepToCome;
        return (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className={`flex items-center gap-3 rounded-card border px-3 py-2.5 text-sm ${
              refused
                ? 'border-danger/30 bg-danger-soft text-danger-ink'
                : done
                  ? 'border-success/30 bg-success-soft text-success-ink'
                  : active
                    ? 'border-primary bg-primary-soft text-ink ring-1 ring-primary'
                    : 'border-line bg-surface text-ink-muted'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                refused
                  ? 'bg-danger text-white'
                  : done
                    ? 'bg-success text-white'
                    : active
                      ? 'bg-primary text-white'
                      : 'bg-sunken text-ink-muted'
              }`}
            >
              {refused ? (
                <XMarkIcon className="size-4" />
              ) : done ? (
                <CheckIcon className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            <span className="min-w-0 font-medium">
              {t.statuses[step]}
              <span className="sr-only"> ({state})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
