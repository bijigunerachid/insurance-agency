import { ArrowLeftIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { AmendmentDialog } from '../../features/contracts/AmendmentDialog.jsx';
import { AttestationDialog } from '../../features/contracts/AttestationDialog.jsx';
import { ContractStatus } from '../../features/contracts/ContractStatus.jsx';
import { TRANSITIONS, TransitionDialog } from '../../features/contracts/TransitionDialog.jsx';
import { ContractDocuments } from '../../features/documents/ContractDocuments.jsx';
import { ContractPayments } from '../../features/payments/ContractPayments.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { APP_TIME_ZONE, formatDate, formatDateTime, formatMoney } from '../../utils/format.js';

const t = fr.contracts;
const todayHere = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date());

export function ContractDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/contracts/${id}`);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'loading') return <Spinner label={fr.app.loading} />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
        action={<BackLink />}
      />
    );
  }
  const contract = state.data;
  const canWrite = can('contracts.write');
  const draft = contract.status === 'DRAFT';
  const transitions = canWrite
    ? TRANSITIONS[contract.status].filter((tr) => !tr.manager || can('contracts.terminate'))
    : [];

  /** Sends a change; the dialog shows the error if it fails. */
  const send = async (path, body) => {
    await apiPost(path, body);
    setDialog(null);
    setError(null);
    reload({ silent: true });
  };
  /** Same for actions without a dialog: the page shows the error. */
  const act = async (path, body) => {
    setBusy(true);
    setError(null);
    try {
      await send(path, body);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <section
        aria-labelledby="contract-title"
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 id="contract-title" className="text-2xl font-semibold">
              <Link
                to={`/clients/${contract.customer.id}`}
                className="text-slate-900 hover:text-blue-700 hover:underline"
              >
                {contract.customer.displayName}
              </Link>
            </h1>
            <p className="text-sm text-slate-600">
              <span className="font-mono">{contract.ref}</span> · {contract.insurer.name} ·{' '}
              {contract.product.name}
            </p>
            <ContractStatus contract={contract} />
            {/* The renewal chain stays in sight: last year's and next year's contract. */}
            {(contract.previousContract || contract.nextContract) && (
              <p className="text-sm text-slate-700">
                {contract.previousContract && (
                  <span className="mr-3">
                    {t.previousContract} <ContractLink contract={contract.previousContract} />
                  </span>
                )}
                {contract.nextContract && (
                  <span>
                    {t.nextContract} <ContractLink contract={contract.nextContract} />
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && draft && (
              <Link
                to={`/contrats/${contract.id}/modifier`}
                className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <PencilSquareIcon aria-hidden="true" className="size-4" />
                {t.edit}
              </Link>
            )}
            {transitions.map((transition) => (
              <Button
                key={transition.to}
                variant={transition.to === 'CANCELLED' ? 'danger' : 'primary'}
                onClick={() => setDialog({ type: 'transition', transition })}
              >
                {t.transitions[`${contract.status}>${transition.to}`]}
              </Button>
            ))}
          </div>
        </div>
        <Summary contract={contract} />
      </section>

      {error && !dialog && <Alert>{errorMessage(error)}</Alert>}

      {can('payments.read') && <ContractPayments contract={contract} />}
      <section aria-labelledby="attestations-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="attestations-heading" className="text-lg font-semibold">
            {t.sections.attestations}
          </h2>
          {canWrite && contract.status !== 'CANCELLED' && (
            <Button variant="secondary" onClick={() => setDialog({ type: 'attestation' })}>
              <PlusIcon aria-hidden="true" className="size-4" />
              {t.attestations.add}
            </Button>
          )}
        </div>
        {contract.attestations.length === 0 ? (
          <p className="text-sm text-slate-600">{t.attestations.none}</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {contract.attestations.map((attestation) => (
              <AttestationRow
                key={attestation.id}
                attestation={attestation}
                busy={busy}
                onCancel={
                  canWrite && !attestation.cancelled && !attestation.replaced
                    ? () => setDialog({ type: 'cancelAttestation', attestation })
                    : null
                }
                onReturned={
                  canWrite && attestation.replaced && !attestation.replaced.returned
                    ? () =>
                        act(`/attestations/${attestation.id}/returned`, {
                          version: attestation.version,
                        })
                    : null
                }
              />
            ))}
          </ul>
        )}
      </section>
      <AmendmentsSection
        contract={contract}
        onAdd={
          canWrite && contract.status === 'ISSUED' ? () => setDialog({ type: 'amendment' }) : null
        }
      />
      {can('documents.read') && <ContractDocuments contract={contract} />}

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold marker:hidden hover:bg-slate-50">
          <span
            className="mr-2 inline-block transition-transform group-open:rotate-90"
            aria-hidden="true"
          >
            ›
          </span>
          {t.summary.details}
        </summary>
        <dl className="grid gap-px border-t border-slate-200 bg-slate-200 text-sm sm:grid-cols-2">
          <Item
            label={t.fields.productId}
            value={`${contract.product.name}${contract.product.insurerCode ? ` (${contract.product.insurerCode})` : ''}`}
          />
          <Item label={t.fields.insurer} value={contract.insurer.name} />
          <Item label={t.fields.policyNumber} value={contract.policyNumber} mono />
          <Item label={t.fields.insurerReference} value={contract.insurerReference} />
          <Item
            label={t.fields.period}
            value={`${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`}
          />
          <Item label={t.fields.premiumTotal} value={formatMoney(contract.premiumTotal)} />
          {Number(contract.amendmentsTotal) > 0 && (
            <Item label={t.fields.amendmentsTotal} value={formatMoney(contract.amendmentsTotal)} />
          )}
          <Item label={t.fields.tacitRenewal} value={contract.tacitRenewal ? t.yes : t.no} />
          <Item label={t.fields.noticeDays} value={contract.noticeDays} />
          {contract.previousContract && (
            <Item
              label={t.previousContract}
              value={<ContractLink contract={contract.previousContract} />}
            />
          )}
          {contract.nextContract && (
            <Item
              label={t.nextContract}
              value={<ContractLink contract={contract.nextContract} />}
            />
          )}
        </dl>
      </details>

      <GuaranteesSection guarantees={contract.guarantees ?? []} formula={contract.formula} />

      <VehiclesSection
        contract={contract}
        editable={canWrite && draft}
        busy={busy}
        onAdd={(vehicleId) =>
          act(`/contracts/${contract.id}/vehicles`, { vehicleId, version: contract.version })
        }
        onRemove={(vehicleId) =>
          act(`/contracts/${contract.id}/vehicles/${vehicleId}/remove`, {
            version: contract.version,
          })
        }
      />

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold marker:hidden hover:bg-slate-50">
          <span
            className="mr-2 inline-block transition-transform group-open:rotate-90"
            aria-hidden="true"
          >
            ›
          </span>
          {t.summary.history}
        </summary>
        <ol className="space-y-2 border-t border-slate-200 p-4 text-sm">
          {contract.history.map((change) => (
            <li key={change.id}>
              <span className="font-medium">
                {t.historyLine(change.from && t.statuses[change.from], t.statuses[change.to])}
              </span>{' '}
              <span className="text-slate-600">
                {t.by(change.by.displayName, formatDateTime(change.at))}
              </span>
              {(change.reason || change.insurerReference || change.effectiveDate) && (
                <span className="block text-slate-700">
                  {[
                    change.reason,
                    change.insurerReference,
                    change.effectiveDate &&
                      `${t.fields.effectiveDate} ${formatDate(change.effectiveDate)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </li>
          ))}
        </ol>
      </details>

      {dialog?.type === 'transition' && (
        <TransitionDialog
          contract={contract}
          transition={dialog.transition}
          onClose={() => setDialog(null)}
          onDone={(body) => send(`/contracts/${contract.id}/transition`, body)}
        />
      )}
      {dialog?.type === 'attestation' && (
        <AttestationDialog
          contract={contract}
          onClose={() => setDialog(null)}
          onDone={(body) => send(`/contracts/${contract.id}/attestations`, body)}
        />
      )}
      {dialog?.type === 'amendment' && (
        <AmendmentDialog
          contract={contract}
          onClose={() => setDialog(null)}
          onDone={(body) => send(`/contracts/${contract.id}/amendments`, body)}
        />
      )}
      {dialog?.type === 'cancelAttestation' && (
        <ReasonDialog
          title={t.attestations.cancelTitle}
          intro={t.attestations.cancelIntro}
          confirmLabel={t.attestations.cancel}
          busy={busy}
          error={error}
          onCancel={() => {
            setDialog(null);
            setError(null);
          }}
          onConfirm={(reason) =>
            act(`/attestations/${dialog.attestation.id}/cancel`, {
              reason,
              version: dialog.attestation.version,
            })
          }
        />
      )}
    </div>
  );
}

/** The guarantees printed on the insurer's sheet, as read: never a price of the app. */
function GuaranteesSection({ guarantees, formula }) {
  if (guarantees.length === 0) return null;
  // RC = responsabilité civile, DC = dommages collision (owner, 29/10/2026).
  const meaning = formula?.split(/\s+/).find((word) => t.guarantees.formulas[word]);
  return (
    <section aria-labelledby="guarantees-heading" className="space-y-3">
      <div>
        <h2 id="guarantees-heading" className="text-lg font-semibold">
          {t.guarantees.title}
        </h2>
        <p className="text-sm text-slate-600">{t.guarantees.intro}</p>
        {formula && (
          <p className="mt-1 text-sm">
            <span className="font-medium">{t.guarantees.formula}</span> {formula}
            {meaning && ` (${t.guarantees.formulas[meaning]})`}
          </p>
        )}
      </div>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {guarantees.map((g) => (
          <li
            key={g.label}
            className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{g.label}</p>
              {g.details && <p className="break-words text-xs text-slate-600">{g.details}</p>}
            </div>
            <span className="tabular-nums">
              {g.premium ? formatMoney(g.premium) : t.guarantees.noPremium}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VehiclesSection({ contract, editable, busy, onAdd, onRemove }) {
  const others = useApiQuery(
    editable ? `/vehicles?customerId=${contract.customer.id}&pageSize=100` : null,
  );
  const [choice, setChoice] = useState('');
  const candidates =
    others.state.status === 'done'
      ? others.state.data.items.filter((v) => !contract.vehicles.some((c) => c.id === v.id))
      : [];

  return (
    <section aria-labelledby="contract-vehicles-heading" className="space-y-3">
      <h2 id="contract-vehicles-heading" className="text-lg font-semibold">
        {t.sections.vehicles}
      </h2>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {contract.vehicles.map((vehicle) => (
          <li key={vehicle.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-sm">
              <Link
                to={`/vehicules/${vehicle.id}`}
                className="font-mono font-medium text-blue-700 underline"
              >
                {vehicle.registration}
              </Link>{' '}
              {vehicle.make} {vehicle.model}
              {vehicle.usage && <span className="text-slate-600"> · {vehicle.usage.label}</span>}
              {vehicle.insurerUsage && (
                <span className="text-slate-600"> · {vehicle.insurerUsage.label}</span>
              )}
            </span>
            {editable && (
              <Button variant="secondary" disabled={busy} onClick={() => onRemove(vehicle.id)}>
                {t.removeVehicle}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {editable && others.state.status === 'done' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (choice) onAdd(choice);
            setChoice('');
          }}
          className="flex flex-wrap items-end gap-2"
        >
          {candidates.length ? (
            <>
              <SelectField
                label={t.addVehicle}
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                options={[
                  { value: '', label: '—' },
                  ...candidates.map((v) => ({
                    value: v.id,
                    label: `${v.registration} · ${[v.make, v.model].filter(Boolean).join(' ')}`,
                  })),
                ]}
              />
              <Button type="submit" variant="secondary" disabled={busy || !choice}>
                {t.addVehicle}
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-600">{t.noOtherVehicle}</p>
          )}
        </form>
      )}
    </section>
  );
}

/** The avenants of the contract, newest first: what changed, from when, and what it cost. */
function AmendmentsSection({ contract, onAdd }) {
  const m = t.amendments;
  const amendments = contract.amendments ?? [];
  if (amendments.length === 0 && !onAdd) return null;
  return (
    <section aria-labelledby="amendments-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="amendments-heading" className="text-lg font-semibold">
          {m.title}
        </h2>
        {onAdd && (
          <Button variant="secondary" onClick={onAdd}>
            <PlusIcon aria-hidden="true" className="size-4" />
            {m.add}
          </Button>
        )}
      </div>
      {amendments.length === 0 ? (
        <p className="text-sm text-slate-600">{m.none}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {amendments.map((amendment) => (
            <li key={amendment.id} className="space-y-1 p-3 text-sm">
              <p className="font-medium">
                {m.kinds[amendment.kind]}
                <span className="ml-2 font-normal text-slate-600">
                  {amendment.number ? m.numbered(amendment.number) : m.unnumbered} ·{' '}
                  {m.effective(formatDate(amendment.effectiveDate))}
                </span>
              </p>
              <p className="text-slate-700">
                {amendment.kind === 'REGISTRATION_CHANGE'
                  ? m.line.REGISTRATION_CHANGE(
                      amendment.previousRegistration,
                      amendment.registration,
                    )
                  : m.line.VEHICLE_CHANGE(
                      amendment.previousVehicle?.registration,
                      amendment.vehicle.registration,
                    )}{' '}
                · {amendment.attestation.series} n° {amendment.attestation.number}
              </p>
              <p className="text-slate-600">
                {[
                  amendment.amount && m.amountLine(formatMoney(amendment.amount)),
                  amendment.insurerReference,
                  t.by(amendment.createdBy.displayName, formatDateTime(amendment.createdAt)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttestationRow({ attestation, busy, onCancel, onReturned }) {
  const a = t.attestations;
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
      <div className="space-y-1">
        <p className="font-medium">
          {attestation.series.code} <span className="font-mono">n° {attestation.number}</span>
          <span className="ml-2 font-normal text-slate-600">
            {a.model(attestation.series.model)} ·{' '}
            <span className="whitespace-nowrap">{attestation.vehicle.registration}</span>
          </span>
        </p>
        <p className="text-slate-700">
          {formatDate(attestation.validFrom)} – {formatDate(attestation.validTo)} ·{' '}
          {a.mediums[attestation.medium]}
          {attestation.coverNoteRef && ` · ${a.coverNoteRef} ${attestation.coverNoteRef}`}
        </p>
        {/* A plain line, not a badge: it is long and must wrap on a phone. */}
        {attestation.replaced && (
          <p className="text-slate-700">
            {a.replaced(
              attestation.replaced.number,
              formatDate(attestation.replaced.effectiveDate),
            )}
          </p>
        )}
        <span className="flex flex-wrap gap-1.5">
          {attestation.provisional && <StatusBadge tone="neutral">{a.provisional}</StatusBadge>}
          {attestation.duplicateOf && (
            <StatusBadge tone="neutral">{a.duplicate(attestation.duplicateOf.number)}</StatusBadge>
          )}
          {attestation.cancelled && (
            <StatusBadge tone="error">{a.cancelled(attestation.cancelled.reason)}</StatusBadge>
          )}
          {/* The replaced paper comes back to the agency (owner, 28/10/2026). */}
          {attestation.replaced &&
            (attestation.replaced.returned ? (
              <StatusBadge tone="ok">
                {a.returned(formatDate(attestation.replaced.returned.at))}
              </StatusBadge>
            ) : (
              <StatusBadge tone="warning">{a.toCollect}</StatusBadge>
            ))}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {onReturned && (
          <Button variant="secondary" disabled={busy} onClick={onReturned}>
            {a.markReturned}
          </Button>
        )}
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {a.cancel}
          </Button>
        )}
      </div>
    </li>
  );
}

/** Who and what is covered, until when, and what is left to pay: the first thing to read. */
function Summary({ contract }) {
  const s = t.summary;
  const payments = useApiQuery(`/contracts/${contract.id}/payments`);
  const balance = payments.state.status === 'done' ? payments.state.data : null;
  const daysLeft = Math.round(
    (Date.parse(contract.endDate) - Date.parse(todayHere())) / 86_400_000,
  );
  const until =
    contract.period === 'EXPIRED'
      ? s.ended(formatDate(contract.endDate))
      : contract.period === 'UPCOMING'
        ? s.startsOn(formatDate(contract.startDate))
        : s.coveredUntil(formatDate(contract.endDate));
  const tone =
    contract.period === 'EXPIRED' || contract.status !== 'ISSUED'
      ? 'text-slate-700'
      : daysLeft <= 30
        ? 'text-amber-800'
        : 'text-green-800';
  const owed = balance && balance.balance !== null ? Number(balance.balance) : null;

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-slate-50 p-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.vehicles}</dt>
        <dd className="mt-1 text-sm">
          {contract.vehicles.length === 0 && (
            <span className="block text-slate-600">{t.summary.noVehicle}</span>
          )}
          {contract.vehicles.map((v) => (
            <span key={v.id} className="block">
              <span className="font-mono font-semibold">{v.registration}</span> {v.make} {v.model}
            </span>
          ))}
          {contract.policyNumber && (
            <span className="block text-slate-600">
              {s.policy} <span className="font-mono">{contract.policyNumber}</span>
            </span>
          )}
        </dd>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <dt className="sr-only">{t.fields.period}</dt>
        <dd className={`text-lg font-semibold ${tone}`}>{until}</dd>
        {contract.period === 'ACTIVE' && (
          <dd className="text-sm text-slate-600">{s.daysLeft(daysLeft)}</dd>
        )}
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {s.leftToPay}
        </dt>
        <dd
          className={`mt-1 text-lg font-semibold tabular-nums ${owed > 0 ? 'text-red-700' : 'text-slate-900'}`}
        >
          {balance === null
            ? '…'
            : balance.amountDue === null
              ? s.noPremium
              : formatMoney(balance.balance)}
        </dd>
      </div>
    </dl>
  );
}

function Item({ label, value, mono }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`mt-0.5 font-medium ${mono ? 'font-mono' : ''}`}>
        {value === null || value === undefined || value === '' ? fr.vehicles.notSpecified : value}
      </dd>
    </div>
  );
}

function ContractLink({ contract }) {
  return (
    <Link to={`/contrats/${contract.id}`} className="font-mono text-blue-700 underline">
      {contract.ref}
    </Link>
  );
}

function BackLink() {
  return (
    <Link
      to="/contrats"
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {t.back}
    </Link>
  );
}
