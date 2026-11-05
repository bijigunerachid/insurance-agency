import { Link } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { textLinkClasses } from '../../components/TextLink.jsx';
import { fr } from '../../i18n/fr.js';
import { formatDate, formatMoney } from '../../utils/format.js';
import { ContractStatus } from './ContractStatus.jsx';
import { contractNumber } from './contractNumber.js';

const t = fr.contracts;

const balanceText = (contract) =>
  contract.balance === null || contract.balance === undefined ? '—' : formatMoney(contract.balance);
const owes = (contract) => Number(contract.balance) > 0;
const canPay = (contract, onPay) =>
  Boolean(onPay) && contract.status === 'ISSUED' && owes(contract);
const period = (contract) => `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`;

function PayButton({ contract, onPay, size = 'sm', className = '' }) {
  return (
    <Button
      size={size}
      onClick={() => onPay(contract)}
      aria-label={t.payFor(contractNumber(contract))}
      className={className}
    >
      {fr.payments.record}
    </Button>
  );
}

/** What is left to pay: in red when something is owed. */
function Balance({ contract, className = '' }) {
  return (
    <span
      className={`tabular-nums ${owes(contract) ? 'font-semibold text-danger-ink' : 'text-ink-muted'} ${className}`}
    >
      {balanceText(contract)}
    </span>
  );
}

function columns({ showCustomer, onPay }) {
  return [
    {
      key: 'number',
      header: t.fields.policyNumber,
      primary: true,
      className: 'whitespace-nowrap',
      cell: (contract) => (
        <Link to={`/contrats/${contract.id}`} className={`${textLinkClasses} font-mono`}>
          {contractNumber(contract)}
        </Link>
      ),
    },
    ...(showCustomer
      ? [
          {
            key: 'customer',
            header: t.fields.customer,
            cell: (contract) => contract.customer.displayName,
          },
        ]
      : []),
    {
      key: 'product',
      header: t.fields.productId,
      cell: (contract) => (
        <>
          {contract.insurer.code} · {contract.product.name}
          <span className="block font-mono text-xs text-ink-muted">
            {contract.vehicles.map((v) => v.registration).join(', ')}
          </span>
        </>
      ),
    },
    { key: 'period', header: t.fields.period, className: 'whitespace-nowrap', cell: period },
    {
      key: 'balance',
      header: t.summary.leftToPay,
      align: 'right',
      className: 'whitespace-nowrap',
      cell: (contract) => (
        <span className="inline-flex items-center justify-end gap-3">
          <Balance contract={contract} />
          {canPay(contract, onPay) && <PayButton contract={contract} onPay={onPay} />}
        </span>
      ),
    },
    {
      key: 'status',
      header: t.statusLabel,
      cell: (contract) => <ContractStatus contract={contract} />,
    },
  ];
}

/**
 * Contract rows: a table on a computer, cards on a phone. `showCustomer` is false on a
 * customer's own page. With `onPay`, a contract with something left to pay gets an
 * « Encaisser » button (owner, 24/10/2026: fewer clicks).
 */
export function ContractTable({ contracts, showCustomer = true, onPay }) {
  return (
    <DataTable
      caption={t.title}
      columns={columns({ showCustomer, onPay })}
      rows={contracts}
      renderCard={(contract) => (
        <ContractCard contract={contract} showCustomer={showCustomer} onPay={onPay} />
      )}
    />
  );
}

/** On a phone: one card per contract, what is left to pay and « Encaisser » at its foot. */
function ContractCard({ contract, showCustomer, onPay }) {
  return (
    <div className="relative rounded-card border border-line bg-surface p-4 text-sm shadow-hairline">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          to={`/contrats/${contract.id}`}
          className="focus-ring rounded-control font-mono font-semibold text-primary after:absolute after:inset-0 after:rounded-card"
        >
          {contractNumber(contract)}
        </Link>
        <ContractStatus contract={contract} />
      </div>
      {showCustomer && <p className="mt-1 font-medium text-ink">{contract.customer.displayName}</p>}
      <p className="mt-0.5 text-ink-soft">
        {contract.insurer.code} · {contract.product.name}
      </p>
      <p className="text-xs text-ink-muted">
        {[
          contract.vehicles.map((v) => v.registration).join(', '),
          period(contract),
          contract.policyNumber && `${t.fields.policyNumber} ${contract.policyNumber}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-ink-muted">
          {t.summary.leftToPay} <Balance contract={contract} className="block text-base" />
        </p>
        {canPay(contract, onPay) && (
          <PayButton contract={contract} onPay={onPay} size="md" className="relative" />
        )}
      </div>
    </div>
  );
}
