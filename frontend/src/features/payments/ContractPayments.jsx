import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatDateTime, formatMoney, signedMoney } from '../../utils/format.js';
import { newRequestId } from '../../utils/ids.js';
import { useAuth } from '../auth/AuthContext.jsx';

const t = fr.payments;
const WITH_REFERENCE = ['CHEQUE', 'TRANSFER', 'OTHER'];

/** "1 234,50" or "1234.50" in cents, or null: amounts are compared without floats. */
function toCents(typed) {
  const value = String(typed ?? '')
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const [units, decimals = ''] = value.split('.');
  return Number(units) * 100 + Number(decimals.padEnd(2, '0'));
}

/** Premium, what was paid and what is left, the payments and their receipts. */
export function ContractPayments({ contract }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { state, reload } = useApiQuery(`/contracts/${contract.id}/payments`);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'loading') return <Spinner label={fr.app.loading} />;
  if (state.status === 'error') return <Alert>{errorMessage(state.error)}</Alert>;
  const data = state.data;
  const hasAmendments = Number(data.amendmentsTotal ?? 0) > 0;
  const canRecord =
    can('payments.record') &&
    contract.status !== 'CANCELLED' &&
    data.balance !== null &&
    Number(data.balance) > 0;

  async function reverse(payment, reason, requestId) {
    setBusy(true);
    setError(null);
    try {
      const reversal = await apiPost(`/payments/${payment.id}/reverse`, {
        reason,
        idempotencyKey: requestId,
      });
      setDialog(null);
      reload({ silent: true });
      navigate(`/recus/${reversal.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="payments-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payments-heading" className="text-lg font-semibold">
          {t.section}
        </h2>
        {canRecord && (
          <Button onClick={() => setDialog({ type: 'record', requestId: newRequestId() })}>
            {t.record}
          </Button>
        )}
      </div>
      <dl
        className={`grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm ${
          hasAmendments ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
        }`}
      >
        <Amount label={t.premium} value={data.premiumTotal} />
        {/* Avenants are owed on top of the premium (their own total à payer). */}
        {hasAmendments && <Amount label={t.amendments} value={data.amendmentsTotal} />}
        <Amount label={t.paid} value={data.paid} />
        <Amount label={t.balance} value={data.balance} strong />
      </dl>
      {data.amountDue === null && <Alert tone="info">{t.noPremium}</Alert>}
      {data.items.length === 0 ? (
        <p className="text-sm text-slate-600">{t.none}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {data.items.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
            >
              <div className="space-y-0.5">
                <p className="font-medium">
                  <Link
                    to={`/recus/${payment.id}`}
                    className="font-mono text-blue-700 underline-offset-2 hover:underline"
                  >
                    {payment.receiptNumber}
                  </Link>{' '}
                  · <span className="tabular-nums">{formatMoney(payment.amount)}</span> ·{' '}
                  {t.methods[payment.method]}
                  {payment.reference && ` · ${payment.reference}`}
                </p>
                <p className="text-xs text-slate-600">
                  {formatDateTime(payment.receivedAt)} · {t.by} {payment.receivedBy.displayName}
                  {payment.reason && ` · ${payment.reason}`}
                </p>
                {payment.clientPaid && (
                  <p className="text-xs text-slate-600">
                    {t.rounded(formatMoney(payment.clientPaid), signedMoney(payment.roundingGap))}
                  </p>
                )}
                {payment.reverses && (
                  <StatusBadge tone="neutral">
                    {t.reversal(payment.reverses.receiptNumber)}
                  </StatusBadge>
                )}
                {payment.reversedBy && (
                  <StatusBadge tone="warning">
                    {t.reversed(payment.reversedBy.receiptNumber)}
                  </StatusBadge>
                )}
              </div>
              {can('payments.reverse') && payment.kind === 'PAYMENT' && !payment.reversedBy && (
                <Button
                  variant="secondary"
                  onClick={() => setDialog({ type: 'reverse', payment, requestId: newRequestId() })}
                >
                  {t.reverse}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog?.type === 'record' && (
        <RecordDialog
          contract={contract}
          balance={data.balance}
          requestId={dialog.requestId}
          onClose={() => setDialog(null)}
          onDone={(payment) => navigate(`/recus/${payment.id}`)}
        />
      )}
      {dialog?.type === 'reverse' && (
        <ReasonDialog
          title={`${t.reverse} ${dialog.payment.receiptNumber}`}
          intro={t.reverseIntro}
          confirmLabel={t.reverse}
          busy={busy}
          error={error}
          onCancel={() => {
            setDialog(null);
            setError(null);
          }}
          onConfirm={(reason) => reverse(dialog.payment, reason, dialog.requestId)}
        />
      )}
    </section>
  );
}

function Amount({ label, value, strong }) {
  return (
    <div className="min-w-0 bg-white px-2.5 py-3 sm:p-4">
      <dt className="text-xs text-slate-600 sm:text-sm">{label}</dt>
      <dd
        className={`mt-1 tabular-nums ${strong ? 'text-sm font-semibold sm:text-xl' : 'text-sm font-medium sm:text-base'}`}
      >
        {value === null ? fr.vehicles.notSpecified : formatMoney(value)}
      </dd>
    </div>
  );
}

/**
 * The request id is created when the dialog opens: clicking twice or retrying after a network
 * error records one payment, not two.
 */
export function RecordDialog({ contract, balance, requestId, onClose, onDone }) {
  const [values, setValues] = useState({
    // Most payments settle the whole balance: it is proposed, and can be changed.
    amount: balance ? String(balance).replace('.', ',') : '',
    method: 'CASH',
    reference: '',
    payerName: '',
    rounded: false,
    clientPaid: '',
    cashTendered: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const needsReference = WITH_REFERENCE.includes(values.method);
  // The agency may round what the customer gives in cash for the whole balance (owner,
  // 29/10/2026): the payment stays the exact amount, the gap is the agency's.
  const amountCents = toCents(values.amount);
  const canRound =
    values.method === 'CASH' && amountCents !== null && amountCents === toCents(balance);
  const rounding = canRound && values.rounded;
  const givenCents = toCents(values.clientPaid);
  const gap = rounding && givenCents !== null ? (givenCents - amountCents) / 100 : null;
  const balanceCents = toCents(balance);
  // What stays owed once this payment is in, said as the amount is typed.
  const leftCents =
    amountCents !== null && balanceCents !== null && amountCents <= balanceCents
      ? balanceCents - amountCents
      : null;
  // The change to give back: from what the customer pays (the rounded sum when rounding).
  const paysCents = rounding ? givenCents : amountCents;
  const tenderedTyped = values.method === 'CASH' && values.cashTendered.trim() !== '';
  const tenderedCents = tenderedTyped ? toCents(values.cashTendered) : null;
  const changeCents =
    tenderedCents !== null && paysCents !== null ? tenderedCents - paysCents : null;
  const complete =
    values.amount.trim() &&
    (!tenderedTyped || (tenderedCents !== null && changeCents >= 0)) &&
    (!needsReference || values.reference.trim()) &&
    (!rounding || (gap !== null && gap !== 0));

  const set = (name) => (event) => {
    setValues({ ...values, [name]: event.target.value });
    setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  };

  async function submit(event) {
    event.preventDefault();
    if (!complete) return;
    setBusy(true);
    setError(null);
    try {
      const body = { amount: values.amount, method: values.method, idempotencyKey: requestId };
      if (values.reference.trim()) body.reference = values.reference;
      if (values.payerName.trim()) body.payerName = values.payerName;
      if (rounding) body.clientPaid = values.clientPaid;
      if (tenderedCents !== null) body.cashTendered = values.cashTendered;
      onDone(await apiPost(`/contracts/${contract.id}/payments`, body));
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, t.rules[d.rule] ?? t.rules.invalid_format]),
          ),
        );
      }
      setBusy(false);
    }
  }

  return (
    <Dialog title={t.recordTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <div>
          <TextField
            label={t.amount}
            hint={t.amountHint(formatMoney(balance))}
            inputMode="decimal"
            maxLength={20}
            value={values.amount}
            onChange={set('amount')}
            error={fieldErrors.amount}
            inputClassName="text-2xl font-semibold tabular-nums"
            autoFocus
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-slate-700">
              {leftCents === 0 && t.settles}
              {leftCents > 0 && t.leftAfter(formatMoney(leftCents / 100))}
            </p>
            {balanceCents !== null && amountCents !== balanceCents && (
              <Button
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                onClick={() => {
                  setValues({ ...values, amount: String(balance).replace('.', ',') });
                  setFieldErrors(({ amount: _cleared, ...rest }) => rest);
                }}
              >
                {t.payAll}
              </Button>
            )}
          </div>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">{t.method}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {Object.entries(t.methods).map(([value, label]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-700 ${
                  values.method === value
                    ? 'bg-blue-700 text-white ring-blue-700'
                    : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={value}
                  checked={values.method === value}
                  onChange={set('method')}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {values.method === 'CASH' && (
          <div>
            <TextField
              label={t.cashTendered}
              hint={t.cashTenderedHint}
              inputMode="decimal"
              maxLength={20}
              value={values.cashTendered}
              onChange={set('cashTendered')}
              error={
                fieldErrors.cashTendered ??
                (tenderedTyped && tenderedCents === null ? t.rules.INVALID_AMOUNT : undefined)
              }
            />
            {changeCents !== null && (
              <p
                aria-live="polite"
                className={`mt-2 text-base font-semibold tabular-nums ${changeCents < 0 ? 'text-red-700' : 'text-emerald-800'}`}
              >
                {changeCents < 0 ? t.changeShort : t.changeDue(formatMoney(changeCents / 100))}
              </p>
            )}
          </div>
        )}
        {needsReference && (
          <TextField
            label={t.reference[values.method]}
            maxLength={80}
            value={values.reference}
            onChange={set('reference')}
            error={fieldErrors.reference}
          />
        )}
        {/* What is rarely filled waits here, so the counter sees the amount and the method. */}
        <details
          open={Boolean(fieldErrors.reference && !needsReference) || undefined}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <summary className="cursor-pointer font-medium text-slate-700">{t.moreDetails}</summary>
          <div className="mt-3 space-y-3">
            {!needsReference && (
              <TextField
                label={t.reference[values.method]}
                maxLength={80}
                value={values.reference}
                onChange={set('reference')}
                error={fieldErrors.reference}
              />
            )}
            <TextField
              label={t.payerName}
              maxLength={120}
              value={values.payerName}
              onChange={set('payerName')}
            />
          </div>
        </details>
        {canRound && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={values.rounded}
                onChange={(e) => setValues({ ...values, rounded: e.target.checked })}
                className="size-4 rounded border-slate-300"
              />
              {t.roundedCheck}
            </label>
            {rounding && (
              <>
                <TextField
                  label={t.clientPaid}
                  hint={t.clientPaidHint}
                  inputMode="decimal"
                  maxLength={20}
                  value={values.clientPaid}
                  onChange={set('clientPaid')}
                  error={fieldErrors.clientPaid}
                />
                {gap !== null && gap !== 0 && (
                  <p className="text-sm" role="status">
                    {gap > 0 ? t.gapGain(signedMoney(gap)) : t.gapLoss(signedMoney(gap))}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !complete}>
            {t.record}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
