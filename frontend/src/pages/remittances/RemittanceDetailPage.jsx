import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatDate, formatDateTime, formatDay, formatMoney } from '../../utils/format.js';

const t = fr.bordereau;

/** The agency's bordereau of one remittance, printed from the browser, and its cancellation. */
export function RemittanceDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/remittances/${id}`);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (state.status === 'loading') return <Spinner label={fr.app.loading} />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
      />
    );
  }
  const remittance = state.data;
  const agency = remittance.agency;
  const cancelled = remittance.status === 'CANCELLED';

  async function cancel(reason) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/remittances/${remittance.id}/cancel`, { reason });
      setCancelling(false);
      reload({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          to="/reversements"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          {t.back}
        </Link>
        <div className="flex flex-wrap gap-2">
          {can('remittances.manage') && !cancelled && (
            <Button variant="secondary" onClick={() => setCancelling(true)}>
              {t.cancel}
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <PrinterIcon aria-hidden="true" className="size-4" />
            {t.print}
          </Button>
        </div>
      </div>
      {cancelled && (
        <Alert>
          {t.cancelled(
            formatDay(remittance.cancellation.at),
            remittance.cancellation.by.displayName,
            remittance.cancellation.reason,
          )}
        </Alert>
      )}

      <article className="mx-auto max-w-3xl rounded-lg border border-slate-300 bg-white p-6 print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-slate-300 pb-4">
          <div className="text-sm">
            {agency.name && <p className="text-base font-semibold">{agency.name}</p>}
            {agency.address && <p>{agency.address}</p>}
            {agency.phone && <p>{agency.phone}</p>}
            {agency.acapsNumber && (
              <p>
                {fr.receipt.acaps} {agency.acapsNumber}
              </p>
            )}
          </div>
          <div className="text-right">
            <h1 className="text-xl font-semibold">{t.title}</h1>
            <p className="font-mono text-lg">{remittance.number}</p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Line label={t.insurer} value={remittance.insurer.name} />
          <Line label={t.collectedUntil} value={formatDate(remittance.collectedUntil)} />
          <Line label={t.remittedOn} value={formatDate(remittance.remittedOn)} />
          <Line
            label={t.method}
            value={`${fr.remittances.methods[remittance.method]}${remittance.reference ? ` · ${remittance.reference}` : ''}`}
          />
          <Line
            label={t.recordedBy}
            value={`${remittance.recordedBy.displayName} · ${formatDateTime(remittance.recordedAt)}`}
          />
          {remittance.note && <Line label={t.note} value={remittance.note} />}
        </dl>

        <div className="mt-6">
          {/* On a phone: receipt, customer and amount; the date and the contract from 640px and in print. */}
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-300 text-slate-600">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t.receipt}
                </th>
                <th
                  scope="col"
                  className="hidden py-2 pr-3 font-medium sm:table-cell print:table-cell"
                >
                  {t.date}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t.customer}
                </th>
                <th
                  scope="col"
                  className="hidden py-2 pr-3 font-medium sm:table-cell print:table-cell"
                >
                  {t.contract}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t.amount}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {remittance.items.map((item) => (
                <tr key={item.paymentId}>
                  <td className="py-2 pr-3 font-mono">
                    {item.receiptNumber}
                    {item.kind === 'REVERSAL' && (
                      <span className="ml-1 font-sans text-xs text-slate-600">({t.reversal})</span>
                    )}
                  </td>
                  <td className="hidden py-2 pr-3 sm:table-cell print:table-cell">
                    {formatDay(item.receivedAt)}
                  </td>
                  <td className="py-2 pr-3">{item.customer}</td>
                  <td className="hidden py-2 pr-3 font-mono sm:table-cell print:table-cell">
                    {item.contract.ref}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums">
                    {formatMoney(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 flex items-baseline justify-between border-t border-slate-300 pt-4">
          <span className="text-sm font-medium">
            {t.total} · {fr.remittances.items(remittance.itemCount)}
          </span>
          <span
            className={`text-2xl font-semibold tabular-nums ${cancelled ? 'text-slate-500 line-through' : ''}`}
          >
            {formatMoney(remittance.amount)}
          </span>
        </p>
        <p className="mt-6 text-xs text-slate-600">{t.agencyDocument}</p>
      </article>

      {cancelling && (
        <ReasonDialog
          title={`${t.cancel} ${remittance.number}`}
          intro={t.cancelIntro}
          confirmLabel={t.cancel}
          busy={busy}
          error={error}
          onCancel={() => {
            setCancelling(false);
            setError(null);
          }}
          onConfirm={cancel}
        />
      )}
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
