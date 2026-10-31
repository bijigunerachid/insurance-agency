import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField } from '../../components/TextField.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';

const t = fr.contracts;

/**
 * Allowed changes from each status and what they need (same table as the API,
 * docs/data-model.md §3.2). `manager`: needs contracts.terminate.
 */
export const TRANSITIONS = {
  DRAFT: [
    { to: 'AWAITING_INSURER', needs: [] },
    { to: 'CANCELLED', needs: ['reason'] },
  ],
  AWAITING_INSURER: [
    { to: 'ISSUED', needs: ['policyNumber', 'insurerReference'] },
    { to: 'DRAFT', needs: ['reason'] },
    { to: 'CANCELLED', needs: ['reason'] },
  ],
  ISSUED: [
    { to: 'SUSPENDED', needs: ['insurerReference', 'effectiveDate'], manager: true },
    { to: 'CANCELLED', needs: ['reason', 'insurerReference', 'effectiveDate'], manager: true },
  ],
  SUSPENDED: [
    { to: 'ISSUED', needs: ['insurerReference', 'effectiveDate'], manager: true },
    { to: 'CANCELLED', needs: ['reason', 'insurerReference', 'effectiveDate'], manager: true },
  ],
  CANCELLED: [],
};

const INPUTS = {
  policyNumber: { maxLength: 40, hint: t.hints.policyNumber, autoComplete: 'off' },
  insurerReference: { maxLength: 120, hint: t.hints.insurerReference },
  effectiveDate: { type: 'date' },
  reason: { maxLength: 300 },
};

/** Asks for what a status change needs, then sends it. */
export function TransitionDialog({ contract, transition, onDone, onClose }) {
  const key = `${contract.status}>${transition.to}`;
  const [values, setValues] = useState(
    Object.fromEntries(transition.needs.map((field) => [field, ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const complete = transition.needs.every((field) => values[field].trim());

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onDone({ to: transition.to, ...values, version: contract.version });
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(err.details.map((d) => [d.path, t.rules[d.rule] ?? t.rules.REQUIRED])),
        );
      }
      setBusy(false);
    }
  }

  return (
    <Dialog title={t.transitions[key]} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (complete) submit();
        }}
        className="space-y-4"
        noValidate
      >
        {t.transitionIntro[key] && (
          <p className="text-sm text-slate-700">{t.transitionIntro[key]}</p>
        )}
        {error && <Alert>{errorMessage(error)}</Alert>}
        {transition.needs.map((field) => (
          <TextField
            key={field}
            label={t.fields[field]}
            required
            value={values[field]}
            error={fieldErrors[field]}
            onChange={(e) => setValues({ ...values, [field]: e.target.value })}
            {...INPUTS[field]}
          />
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button
            type="submit"
            variant={transition.to === 'CANCELLED' ? 'danger' : 'primary'}
            disabled={busy || !complete}
          >
            {t.transitions[key]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
