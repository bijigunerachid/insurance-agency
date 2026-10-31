import { Link } from 'react-router';
import { useWideScreen } from '../../hooks/useWideScreen.js';
import { fr } from '../../i18n/fr.js';
import { formatDate, formatMoney } from '../../utils/format.js';
import { ContractStatus } from './ContractStatus.jsx';

const t = fr.contracts;

const balanceText = (contract) =>
  contract.balance === null || contract.balance === undefined ? '—' : formatMoney(contract.balance);
const canPay = (contract, onPay) =>
  Boolean(onPay) && contract.status === 'ISSUED' && Number(contract.balance) > 0;

function PayButton({ contract, onPay, large = false, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onPay(contract)}
      aria-label={t.payFor(contract.ref)}
      className={`rounded-md bg-blue-700 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${large ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs'} ${className}`}
    >
      {fr.payments.record}
    </button>
  );
}

/**
 * Contract rows; `showCustomer` is false on a customer's own page. With `onPay`, a contract
 * with something left to pay gets an "Encaisser" button (owner, 24/10/2026: fewer clicks).
 */
export function ContractTable({ contracts, showCustomer = true, onPay }) {
  const wide = useWideScreen();
  if (!wide)
    return <ContractCards contracts={contracts} showCustomer={showCustomer} onPay={onPay} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t.fields.ref}
            </th>
            {showCustomer && (
              <th scope="col" className="px-4 py-3">
                {t.fields.customer}
              </th>
            )}
            <th scope="col" className="px-4 py-3">
              {t.fields.productId}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.fields.period}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t.summary.leftToPay}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.statusLabel}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {contracts.map((contract) => (
            <tr key={contract.id}>
              <td className="whitespace-nowrap px-4 py-3">
                <Link
                  to={`/contrats/${contract.id}`}
                  className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
                >
                  {contract.ref}
                </Link>
                {contract.policyNumber && (
                  <span className="block text-xs text-slate-600">
                    {t.fields.policyNumber} {contract.policyNumber}
                  </span>
                )}
              </td>
              {showCustomer && <td className="px-4 py-3">{contract.customer.displayName}</td>}
              <td className="px-4 py-3">
                {contract.insurer.code} · {contract.product.name}
                <span className="block text-xs text-slate-600">
                  {contract.vehicles.map((v) => v.registration).join(', ')}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${Number(contract.balance) > 0 ? 'font-semibold text-red-700' : 'text-slate-600'}`}
              >
                {balanceText(contract)}
                {canPay(contract, onPay) && (
                  <PayButton contract={contract} onPay={onPay} className="ml-3" />
                )}
              </td>
              <td className="px-4 py-3">
                <ContractStatus contract={contract} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** On a phone: one card per contract, what is left to pay and « Encaisser » at its foot. */
function ContractCards({ contracts, showCustomer, onPay }) {
  return (
    <ul className="space-y-2">
      {contracts.map((contract) => {
        const owed = Number(contract.balance) > 0;
        return (
          <li
            key={contract.id}
            className="relative rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link
                to={`/contrats/${contract.id}`}
                className="font-mono font-semibold text-blue-700 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                {contract.ref}
              </Link>
              <ContractStatus contract={contract} />
            </div>
            {showCustomer && <p className="mt-1 font-medium">{contract.customer.displayName}</p>}
            <p className="mt-0.5 text-slate-700">
              {contract.insurer.code} · {contract.product.name}
            </p>
            <p className="text-xs text-slate-600">
              {[
                contract.vehicles.map((v) => v.registration).join(', '),
                `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`,
                contract.policyNumber && `${t.fields.policyNumber} ${contract.policyNumber}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-600">
                {t.summary.leftToPay}{' '}
                <span
                  className={`block text-base tabular-nums ${owed ? 'font-semibold text-red-700' : 'text-slate-700'}`}
                >
                  {balanceText(contract)}
                </span>
              </p>
              {canPay(contract, onPay) && (
                <PayButton contract={contract} onPay={onPay} large className="relative" />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
