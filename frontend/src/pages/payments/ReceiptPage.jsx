import { PrinterIcon } from '@heroicons/react/20/solid';
import { Fragment } from 'react';
import { useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { BackLink } from '../../components/PageHeader.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { formatDateTime, formatMoney } from '../../utils/format.js';
import { contractNumber } from '../../features/contracts/contractNumber.js';

const t = fr.receipt;

/**
 * The agency's receipt (circulaire ACAPS 01/AS/19, art. 128), printed from the browser. It is
 * plainly the agency's own document: never laid out like an insurer's quittance (rules L2, L3).
 */
export function ReceiptPage() {
  const { id } = useParams();
  const { state } = useApiQuery(`/payments/${id}`);

  if (state.status === 'loading') return <SkeletonDetail />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
      />
    );
  }
  const receipt = state.data;
  const agency = receipt.agency;
  const reversal = receipt.kind === 'REVERSAL';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <BackLink to={`/contrats/${receipt.contract.id}`}>{t.back}</BackLink>
        <Button icon={PrinterIcon} onClick={() => window.print()}>
          {t.print}
        </Button>
      </div>
      {!agency.name && (
        <div className="print:hidden">
          <Alert tone="info">{t.agencyMissing}</Alert>
        </div>
      )}

      {/* Two copies on one A4 sheet (owner, 24/10/2026): one stays at the agency, one goes to
          the client. Each fills half the page when printed. */}
      <div className="space-y-6 print:space-y-0">
        <ReceiptCopy
          receipt={receipt}
          agency={agency}
          reversal={reversal}
          copy={t.copyAgency}
          main
        />
        <p
          aria-hidden="true"
          className="mx-auto max-w-2xl border-t-2 border-dashed border-line-strong pt-1 text-center text-xs text-ink-muted print:my-[4mm]"
        >
          ✂ {t.cutHere}
        </p>
        <ReceiptCopy receipt={receipt} agency={agency} reversal={reversal} copy={t.copyClient} />
      </div>
    </div>
  );
}

function ReceiptCopy({ receipt, agency, reversal, copy, main = false }) {
  // One main heading per page: the agency copy; the client copy looks the same.
  const Title = main ? 'h1' : 'h2';
  return (
    <article
      aria-label={copy}
      className="mx-auto max-w-2xl break-inside-avoid rounded-card border-2 border-ink-soft bg-white p-6 text-ink print:max-w-none print:rounded-none print:p-[3mm] print:text-[11px]"
    >
      <p className="mb-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted print:mb-0">
        {copy}
      </p>
      <header className="flex flex-wrap justify-between gap-4 border-b border-line-strong/60 pb-4 print:pb-2">
        {/* The agency's logo (its own mark, never an insurer's: rules L2, L3), or its name. */}
        <div className="min-w-0 flex-1 text-sm">
          {agency.logo ? (
            <img
              src="/api/agency/logo"
              alt={agency.name ?? ''}
              className="h-14 w-auto max-w-full print:h-[12mm]"
            />
          ) : (
            agency.name && <p className="text-base font-semibold">{agency.name}</p>
          )}
          {agency.tagline && <p className="text-ink-muted">{agency.tagline}</p>}
        </div>
        <div className="text-right">
          <Title className="text-xl font-semibold">{reversal ? t.reversalTitle : t.title}</Title>
          <p className="font-mono text-lg">{receipt.receiptNumber}</p>
        </div>
      </header>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 print:mt-2 print:gap-y-1">
        <Line label={t.date} value={formatDateTime(receipt.receivedAt)} />
        <Line
          label={t.customer}
          value={`${receipt.contract.customer.displayName} (${receipt.contract.customer.ref})`}
        />
        <Line label={t.policy} value={contractNumber(receipt.contract)} />
        <Line
          label={t.insurer}
          value={`${receipt.contract.insurer.name} · ${receipt.contract.product.name}`}
        />
        <Line
          label={t.method}
          value={`${fr.payments.methods[receipt.method]}${receipt.reference ? ` · ${receipt.reference}` : ''}`}
        />
        {receipt.payerName && <Line label={t.payer} value={receipt.payerName} />}
        <Line label={t.receivedBy} value={receipt.receivedBy.displayName} />
        {reversal && (
          <Line
            label={t.reason}
            value={`${fr.payments.reversal(receipt.reverses.receiptNumber)} · ${receipt.reason}`}
          />
        )}
      </dl>

      {/* As on the agency's former receipt (owner, 30/10/2026): the cash handed over and the
          change given back, when the employee typed it, on the amount's line so both signed
          copies still fit on one A4 sheet. */}
      <p className="mt-6 flex flex-wrap items-baseline gap-x-4 border-t border-line-strong/60 pt-4 print:mt-2 print:pt-2">
        <span className="text-sm font-medium">{t.amount}</span>
        {receipt.cashTendered && (
          <span className="text-sm tabular-nums text-ink-soft">
            <span className="whitespace-nowrap">
              {t.cashTendered} : {formatMoney(receipt.cashTendered)}
            </span>{' '}
            ·{' '}
            <span className="whitespace-nowrap">
              {t.change} : {formatMoney(receipt.change)}
            </span>
          </span>
        )}
        <span className="ml-auto text-2xl font-semibold tabular-nums">
          {formatMoney(receipt.amount)}
        </span>
      </p>
      {/* Signed by both (owner, 29/10/2026): the client and the agency, its stamp beside. */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm print:mt-2">
        <Signature label={t.signClient} />
        <Signature label={t.signAgency} />
      </div>
      <p className="mt-4 text-xs text-ink-muted print:mt-2">{t.notQuittance}</p>
      {/* The agency's legal line, as on its letterhead: two short lines, so both signed
          copies still fit on one A4 sheet. */}
      <footer className="mt-3 border-t border-line-strong/60 pt-2 text-center text-[11px] leading-snug text-ink-soft print:mt-1 print:pt-1 print:text-[8.5px]">
        <JoinedLine
          parts={[
            agency.address,
            agency.phone && `${t.phone} ${agency.phone}`,
            agency.fax && `${t.fax} ${agency.fax}`,
            agency.email,
          ]}
        />
        <JoinedLine
          parts={[
            (agency.name || agency.legalForm) && (
              <span key="name">
                {agency.name && <strong className="font-semibold">{agency.name}</strong>}
                {agency.name && agency.legalForm && ' '}
                {agency.legalForm}
              </span>
            ),
            agency.patente && `${t.patente} ${agency.patente}`,
            agency.taxId && `${t.taxId} ${agency.taxId}`,
            agency.ice && `${t.ice} ${agency.ice}`,
            agency.rc && `${t.rc} ${agency.rc}`,
            agency.cnss && `${t.cnss} ${agency.cnss}`,
            agency.acapsNumber && `${t.acaps} ${agency.acapsNumber}`,
          ]}
        />
      </footer>
    </article>
  );
}

function JoinedLine({ parts }) {
  const shown = parts.filter(Boolean);
  if (!shown.length) return null;
  return (
    <p>
      {shown.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

function Signature({ label }) {
  return (
    <div className="flex h-24 flex-col rounded-control border border-line-strong p-2 print:h-[14mm]">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium">{value || fr.vehicles.notSpecified}</dd>
    </div>
  );
}
