import { PlusIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { ButtonLink } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { newRequestId } from '../../utils/ids.js';
import { RecordDialog } from '../payments/ContractPayments.jsx';
import { ContractTable } from './ContractTable.jsx';
import { useInsurerFilter } from '../workspace/Workspace.jsx';

const t = fr.contracts;

/**
 * Contracts on a customer's page: all of them, as the client owes them all. In one insurer's
 * workspace, that insurer's first; the others below under « Autres compagnies », greyed.
 */
export function CustomerContractsPanel({ customer }) {
  const { can } = useAuth();
  const contracts = useApiQuery(`/contracts?customerId=${customer.id}&pageSize=100`);
  const { insurer } = useInsurerFilter();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(null);
  const onPay = can('payments.record')
    ? (contract) => setPaying({ contract, requestId: newRequestId() })
    : undefined;
  const items = contracts.state.status === 'done' ? contracts.state.data.items : [];
  const mine = insurer ? items.filter((c) => c.insurer.id === insurer.id) : items;
  const others = insurer ? items.filter((c) => c.insurer.id !== insurer.id) : [];

  return (
    <section aria-labelledby="contracts-heading" className="space-y-3">
      <SectionHeading
        id="contracts-heading"
        title={t.title}
        actions={
          can('contracts.write') &&
          !customer.archivedAt && (
            <ButtonLink to={`/contrats/nouveau?client=${customer.id}`} size="sm" icon={PlusIcon}>
              {t.create}
            </ButtonLink>
          )
        }
      />
      {contracts.state.status === 'loading' && <SkeletonList rows={2} />}
      {contracts.state.status === 'error' && <Alert>{errorMessage(contracts.state.error)}</Alert>}
      {contracts.state.status === 'done' &&
        (mine.length ? (
          <ContractTable contracts={mine} showCustomer={false} onPay={onPay} />
        ) : (
          <EmptyState title={t.none} />
        ))}
      {others.length > 0 && (
        <section
          aria-labelledby="other-insurers"
          className="space-y-3 rounded-card border border-dashed border-line-strong/50 bg-sunken/60 p-3 sm:p-4"
        >
          <div>
            <h3 id="other-insurers" className="text-sm font-semibold text-ink-soft">
              {fr.workspace.otherInsurers}
            </h3>
            <p className="text-xs text-ink-muted">{fr.workspace.otherInsurersHint(insurer.code)}</p>
          </div>
          <ContractTable contracts={others} showCustomer={false} onPay={onPay} />
        </section>
      )}
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
