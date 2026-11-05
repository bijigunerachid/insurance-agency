import { PencilSquareIcon, PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { DetailItem, DetailList } from '../../components/DetailList.jsx';
import { Disclosure } from '../../components/Disclosure.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { BackLink, PageHeader } from '../../components/PageHeader.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Skeleton, SkeletonDetail } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextLink } from '../../components/TextLink.jsx';
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
import { usePageTitle } from '../../features/layout/PageTitle.jsx';
import { contractNumber } from '../../features/contracts/contractNumber.js';

const t = fr.contracts;
const todayHere = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date());
/** A list of a part of the page (attestations, avenants…): one white block, rows divided. */
const listClasses =
  'divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-sm shadow-hairline';

export function ContractDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/contracts/${id}`);
  // The header shows « … › {its ref} » once loaded.
  usePageTitle(state.status === 'done' ? contractNumber(state.data) : null);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'loading') return <SkeletonDetail />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
        action={<BackLink to="/contrats">{t.back}</BackLink>}
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
    <div className="space-y-8">
      <section aria-labelledby="contract-title" className="space-y-5">
        <PageHeader
          back={{ to: '/contrats', label: t.back }}
          titleId="contract-title"
          title={
            <Link
              to={`/clients/${contract.customer.id}`}
              className="focus-ring rounded-control text-ink hover:text-primary hover:underline"
            >
              {contract.customer.displayName}
            </Link>
          }
          description={
            <>
              {t.fields.policyNumber}{' '}
              <span className="font-mono font-medium text-ink-soft">
                {contractNumber(contract)}
              </span>{' '}
              · {contract.insurer.name} · {contract.product.name}
            </>
          }
          meta={
            <>
              <ContractStatus contract={contract} />
              {/* The renewal chain stays in sight: last year's and next year's contract. */}
              {contract.previousContract && (
                <span className="text-sm text-ink-soft">
                  {t.previousContract} <ContractLink contract={contract.previousContract} />
                </span>
              )}
              {contract.nextContract && (
                <span className="text-sm text-ink-soft">
                  {t.nextContract} <ContractLink contract={contract.nextContract} />
                </span>
              )}
            </>
          }
          actions={
            (canWrite && draft) || transitions.length > 0 ? (
              <>
                {canWrite && draft && (
                  <ButtonLink to={`/contrats/${contract.id}/modifier`} icon={PencilSquareIcon}>
                    {t.edit}
                  </ButtonLink>
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
              </>
            ) : null
          }
        />
        <Summary contract={contract} />
      </section>

      {error && !dialog && <Alert>{errorMessage(error)}</Alert>}

      {can('payments.read') && <ContractPayments contract={contract} />}
      <section aria-labelledby="attestations-heading" className="space-y-3">
        <SectionHeading
          id="attestations-heading"
          title={t.sections.attestations}
          actions={
            canWrite &&
            contract.status !== 'CANCELLED' && (
              <Button
                variant="secondary"
                size="sm"
                icon={PlusIcon}
                onClick={() => setDialog({ type: 'attestation' })}
              >
                {t.attestations.add}
              </Button>
            )
          }
        />
        {contract.attestations.length === 0 ? (
          <EmptyState compact title={t.attestations.none} />
        ) : (
          <ul className={listClasses}>
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

      <Disclosure title={t.summary.details}>
        <div className="px-4 py-4 sm:px-5">
          <DetailList>
            <Fact
              label={t.fields.productId}
              value={`${contract.product.name}${contract.product.insurerCode ? ` (${contract.product.insurerCode})` : ''}`}
            />
            <Fact label={t.fields.insurer} value={contract.insurer.name} />
            <Fact label={t.fields.policyNumber} value={contract.policyNumber} mono />
            <Fact label={t.fields.insurerReference} value={contract.insurerReference} />
            {/* The app's own reference, for the audit log; the agency uses the policy number. */}
            <Fact label={t.fields.internalRef} value={contract.ref} mono />
            <Fact
              label={t.fields.period}
              value={`${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`}
            />
            <Fact label={t.fields.premiumTotal} value={formatMoney(contract.premiumTotal)} />
            {Number(contract.amendmentsTotal) > 0 && (
              <Fact
                label={t.fields.amendmentsTotal}
                value={formatMoney(contract.amendmentsTotal)}
              />
            )}
            <Fact label={t.fields.tacitRenewal} value={contract.tacitRenewal ? t.yes : t.no} />
            <Fact label={t.fields.noticeDays} value={contract.noticeDays} />
            {contract.previousContract && (
              <Fact
                label={t.previousContract}
                value={<ContractLink contract={contract.previousContract} />}
              />
            )}
            {contract.nextContract && (
              <Fact
                label={t.nextContract}
                value={<ContractLink contract={contract.nextContract} />}
              />
            )}
          </DetailList>
        </div>
      </Disclosure>

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

      <Disclosure title={t.summary.history}>
        <ol className="space-y-3 px-4 py-4 text-sm sm:px-5">
          {contract.history.map((change) => (
            <li key={change.id} className="border-l-2 border-line pl-3">
              <span className="font-medium text-ink">
                {t.historyLine(change.from && t.statuses[change.from], t.statuses[change.to])}
              </span>{' '}
              <span className="text-ink-muted">
                {t.by(change.by.displayName, formatDateTime(change.at))}
              </span>
              {(change.reason || change.insurerReference || change.effectiveDate) && (
                <span className="block text-ink-soft">
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
      </Disclosure>

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
      <SectionHeading
        id="guarantees-heading"
        title={t.guarantees.title}
        description={t.guarantees.intro}
      />
      {formula && (
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">{t.guarantees.formula}</span> {formula}
          {meaning && ` (${t.guarantees.formulas[meaning]})`}
        </p>
      )}
      <ul className={listClasses}>
        {guarantees.map((g) => (
          <li
            key={g.label}
            className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 sm:px-5"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium text-ink">{g.label}</p>
              {g.details && <p className="break-words text-xs text-ink-muted">{g.details}</p>}
            </div>
            <span className={`tabular-nums ${g.premium ? 'text-ink' : 'text-ink-muted'}`}>
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
      <SectionHeading id="contract-vehicles-heading" title={t.sections.vehicles} />
      {contract.vehicles.length === 0 ? (
        <EmptyState compact title={t.summary.noVehicle} />
      ) : (
        <ul className={listClasses}>
          {contract.vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
            >
              <span>
                <TextLink to={`/vehicules/${vehicle.id}`} className="font-mono">
                  {vehicle.registration}
                </TextLink>{' '}
                <span className="text-ink">
                  {vehicle.make} {vehicle.model}
                </span>
                {vehicle.usage && <span className="text-ink-muted"> · {vehicle.usage.label}</span>}
                {vehicle.insurerUsage && (
                  <span className="text-ink-muted"> · {vehicle.insurerUsage.label}</span>
                )}
              </span>
              {editable && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRemove(vehicle.id)}
                >
                  {t.removeVehicle}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
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
            <p className="text-sm text-ink-muted">{t.noOtherVehicle}</p>
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
      <SectionHeading
        id="amendments-heading"
        title={m.title}
        actions={
          onAdd && (
            <Button variant="secondary" size="sm" icon={PlusIcon} onClick={onAdd}>
              {m.add}
            </Button>
          )
        }
      />
      {amendments.length === 0 ? (
        <EmptyState compact title={m.none} />
      ) : (
        <ul className={listClasses}>
          {amendments.map((amendment) => (
            <li key={amendment.id} className="space-y-1 px-4 py-3 sm:px-5">
              <p className="font-medium text-ink">
                {m.kinds[amendment.kind]}
                <span className="ml-2 font-normal text-ink-muted">
                  {amendment.number ? m.numbered(amendment.number) : m.unnumbered} ·{' '}
                  {m.effective(formatDate(amendment.effectiveDate))}
                </span>
              </p>
              <p className="text-ink-soft">
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
              <p className="text-ink-muted">
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
    <li className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 sm:px-5">
      <div className="space-y-1">
        <p className="font-medium text-ink">
          {attestation.series.code} <span className="font-mono">n° {attestation.number}</span>
          <span className="ml-2 font-normal text-ink-muted">
            {a.model(attestation.series.model)} ·{' '}
            <span className="whitespace-nowrap">{attestation.vehicle.registration}</span>
          </span>
        </p>
        <p className="text-ink-soft">
          {formatDate(attestation.validFrom)} – {formatDate(attestation.validTo)} ·{' '}
          {a.mediums[attestation.medium]}
          {attestation.coverNoteRef && ` · ${a.coverNoteRef} ${attestation.coverNoteRef}`}
        </p>
        {/* A plain line, not a badge: it is long and must wrap on a phone. */}
        {attestation.replaced && (
          <p className="text-ink-soft">
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
          <Button variant="secondary" size="sm" disabled={busy} onClick={onReturned}>
            {a.markReturned}
          </Button>
        )}
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
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
  // Green while covered, amber within 30 days of the end; plain once ended or not issued.
  const tone =
    contract.period === 'EXPIRED' || contract.status !== 'ISSUED'
      ? 'text-ink-soft'
      : daysLeft <= 30
        ? 'text-warning-ink'
        : 'text-success-ink';
  const owed = balance && balance.balance !== null ? Number(balance.balance) : null;
  const tile = 'rounded-card border border-line bg-surface p-4 shadow-hairline';
  const label = 'text-xs font-semibold uppercase tracking-wide text-ink-muted';

  return (
    <dl className="grid gap-3 md:grid-cols-3">
      <div className={tile}>
        <dt className={label}>{s.vehicles}</dt>
        <dd className="mt-1.5 space-y-0.5 text-sm text-ink">
          {contract.vehicles.length === 0 && (
            <span className="block text-ink-muted">{t.summary.noVehicle}</span>
          )}
          {contract.vehicles.map((v) => (
            <span key={v.id} className="block">
              <span className="font-mono font-semibold">{v.registration}</span> {v.make} {v.model}
            </span>
          ))}
        </dd>
      </div>
      <div className={tile}>
        <dt className="sr-only">{t.fields.period}</dt>
        <dd className={`text-lg font-semibold ${tone}`}>{until}</dd>
        {contract.period === 'ACTIVE' && (
          <dd className="mt-0.5 text-sm text-ink-muted">{s.daysLeft(daysLeft)}</dd>
        )}
      </div>
      <div className={tile}>
        <dt className={label}>{s.leftToPay}</dt>
        <dd
          className={`mt-1.5 text-2xl font-semibold tabular-nums ${owed > 0 ? 'text-danger-ink' : 'text-ink'}`}
        >
          {payments.state.status === 'error' ? (
            // Never an endless wait: the rest of the page stays usable.
            <span className="text-base font-medium text-ink-muted">{s.balanceUnavailable}</span>
          ) : balance === null ? (
            <>
              <Skeleton className="h-7 w-28" />
              <span className="sr-only">{fr.app.loading}</span>
            </>
          ) : balance.amountDue === null ? (
            <span className="text-base font-medium text-ink-muted">{s.noPremium}</span>
          ) : (
            formatMoney(balance.balance)
          )}
        </dd>
      </div>
    </dl>
  );
}

/** A fact of the folded details; empty reads « Non précisé ». */
function Fact(props) {
  return <DetailItem empty={fr.vehicles.notSpecified} {...props} />;
}

function ContractLink({ contract }) {
  return (
    <TextLink to={`/contrats/${contract.id}`} className="font-mono">
      {contractNumber(contract)}
    </TextLink>
  );
}
