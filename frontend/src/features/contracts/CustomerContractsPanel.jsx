import { PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { newRequestId } from '../../utils/ids.js';
import { RecordDialog } from '../payments/ContractPayments.jsx';
import { ContractTable } from './ContractTable.jsx';

const t = fr.contracts;

/** Contracts on a customer's page. */
export function CustomerContractsPanel({ customer }) {
  const { can } = useAuth();
  const contracts = useApiQuery(`/contracts?customerId=${customer.id}&pageSize=100`);
  const navigate = useNavigate();
  const [paying, setPaying] = useState(null);

  return (
    <section aria-labelledby="contracts-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="contracts-heading" className="text-lg font-semibold">
          {t.title}
        </h2>
        {can('contracts.write') && !customer.archivedAt && (
          <Link
            to={`/contrats/nouveau?client=${customer.id}`}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700"
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            {t.create}
          </Link>
        )}
      </div>
      {contracts.state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {contracts.state.status === 'error' && <Alert>{errorMessage(contracts.state.error)}</Alert>}
      {contracts.state.status === 'done' &&
        (contracts.state.data.items.length ? (
          <ContractTable
            contracts={contracts.state.data.items}
            showCustomer={false}
            onPay={
              can('payments.record')
                ? (contract) => setPaying({ contract, requestId: newRequestId() })
                : undefined
            }
          />
        ) : (
          <p className="text-sm text-slate-600">{t.none}</p>
        ))}
      {paying && (
        <RecordDialog
          contract={paying.contract}
          balance={paying.contract.balance}
          requestId={paying.requestId}
          onClose={() => setPaying(null)}
          onDone={(payment) => navigate(`/recus/${payment.id}`)}
        />
      )}
    </section>
  );
}
