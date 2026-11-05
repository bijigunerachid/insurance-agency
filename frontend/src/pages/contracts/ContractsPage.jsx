import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { MoreFilters } from '../../components/MoreFilters.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { textLinkClasses } from '../../components/TextLink.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { ContractTable } from '../../features/contracts/ContractTable.jsx';
import { RecordDialog } from '../../features/payments/ContractPayments.jsx';
import { newRequestId } from '../../utils/ids.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { useInsurerFilter } from '../../features/workspace/Workspace.jsx';
import { WorkspaceNotice } from '../../features/workspace/WorkspaceNotice.jsx';

const t = fr.contracts;

export function ContractsPage() {
  // "?unpaid=1": opened from the to-do list of the home page.
  const [searchParams, setSearchParams] = useSearchParams();
  const unpaid = searchParams.get('unpaid') === '1';
  const { can } = useAuth();
  const navigate = useNavigate();
  // The contract being paid, with the id that makes a repeated click record one payment.
  const [paying, setPaying] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', page: 1 });
  const params = new URLSearchParams({ page: String(filters.page) });
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (unpaid) params.set('unpaid', '1');
  useInsurerFilter().apply(params);
  const { state } = useApiQuery(`/contracts?${params}`);

  return (
    <section aria-labelledby="contracts-title" className="space-y-5">
      <PageHeader title={t.title} titleId="contracts-title" description={t.intro} />
      <WorkspaceNotice />
      {unpaid && (
        <Alert tone="info">
          {t.unpaidOnly}{' '}
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className={`${textLinkClasses} underline`}
          >
            {t.showAll}
          </button>
        </Alert>
      )}

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, q: search.trim(), page: 1 });
        }}
        className="grid gap-3 rounded-card border border-line bg-surface p-3 shadow-hairline sm:p-4 md:grid-cols-2 lg:grid-cols-[1fr_auto_auto] lg:items-end"
      >
        {/* On a phone the button sits beside the box; on a computer it ends the row. */}
        <div className="flex items-end gap-2 md:contents">
          <TextField
            className="min-w-0 flex-1 md:col-span-2 lg:col-span-1"
            label={t.searchLabel}
            type="search"
            maxLength={80}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="secondary" className="md:order-last md:justify-self-start">
            {fr.common.search}
          </Button>
        </div>
        <MoreFilters active={filters.status ? 1 : 0}>
          <SelectField
            label={t.statusLabel}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            options={[
              { value: '', label: t.allStatuses },
              ...Object.entries(t.statuses).map(([value, label]) => ({ value, label })),
            ]}
          />
        </MoreFilters>
      </form>

      {state.status === 'loading' && <SkeletonList />}
      {state.status === 'error' && (
        <ErrorState
          title={errorMessage(state.error)}
          body={fr.common.genericError}
          requestId={state.error.requestId}
        />
      )}
      {state.status === 'done' && state.data.items.length === 0 && (
        <EmptyState
          icon={DocumentTextIcon}
          title={fr.common.empty}
          description={filters.q || filters.status || unpaid ? fr.common.emptyFiltered : undefined}
        />
      )}
      {state.status === 'done' && state.data.items.length > 0 && (
        <>
          <ContractTable
            contracts={state.data.items}
            onPay={
              can('payments.record')
                ? (contract) => setPaying({ contract, requestId: newRequestId() })
                : undefined
            }
          />
          <Pagination
            page={state.data.page}
            pageCount={state.data.pageCount}
            total={state.data.total}
            onPage={(page) => setFilters({ ...filters, page })}
          />
        </>
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
