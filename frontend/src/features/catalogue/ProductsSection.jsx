import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { CatalogueSection, EntryList, EntryRow, QueryState } from './CatalogueSection.jsx';
import { EntryFormDialog, changesOf } from './EntryFormDialog.jsx';
import { ConfirmEntryDialog, VerificationBadges, VerificationDetails } from './Verification.jsx';

const t = fr.catalogue.products;
const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

function productFields({ insurers, editing }) {
  return [
    ...(editing
      ? []
      : [
          {
            name: 'insurerId',
            label: t.insurer,
            type: 'select',
            options: insurers.filter((i) => i.active).map((i) => ({ value: i.id, label: i.name })),
          },
        ]),
    { name: 'line', label: t.line, type: 'select', options: options(t.lines) },
    { name: 'name', label: t.name, required: true, maxLength: 120 },
    { name: 'insurerCode', label: t.insurerCode, maxLength: 40 },
    { name: 'description', label: t.description, type: 'textarea', maxLength: 2000 },
    {
      name: 'source',
      label: fr.verification.source,
      hint: fr.verification.sourceHint,
      required: true,
      maxLength: 300,
    },
    ...(editing ? [{ name: 'active', label: fr.verification.activeLabel, type: 'checkbox' }] : []),
  ];
}

export function ProductsSection({ insurers, canManage }) {
  const [filters, setFilters] = useState({ insurerId: '', line: '', status: '' });
  const [dialog, setDialog] = useState(null);
  const params = new URLSearchParams({ active: 'all' });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const { state, reload } = useApiQuery(`/products?${params}`);

  const done = () => {
    setDialog(null);
    reload({ silent: true });
  };
  const select = (name, label, all, opts) => (
    <SelectField
      label={label}
      value={filters[name]}
      onChange={(event) => setFilters({ ...filters, [name]: event.target.value })}
      options={[{ value: '', label: all }, ...opts]}
    />
  );
  const activeInsurers = insurers.filter((i) => i.active);

  return (
    <CatalogueSection
      id="products-title"
      title={t.title}
      addLabel={t.create}
      onAdd={canManage && activeInsurers.length > 0 ? () => setDialog({ type: 'create' }) : null}
      filters={
        <div className="grid gap-3 sm:grid-cols-3">
          {select(
            'insurerId',
            t.insurer,
            t.allInsurers,
            insurers.map((i) => ({ value: i.id, label: i.name })),
          )}
          {select('line', t.line, t.allLines, options(t.lines))}
          {select(
            'status',
            t.status,
            t.allStatuses,
            options({
              TO_CONFIRM: fr.verification.TO_CONFIRM,
              CONFIRMED: fr.verification.CONFIRMED,
            }),
          )}
        </div>
      }
    >
      <QueryState
        state={state}
        empty={t.none}
        isEmpty={(data) => data.items.length === 0}
        render={(data) => (
          <EntryList>
            {data.items.map((product) => (
              <EntryRow
                key={product.id}
                actions={
                  canManage && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setDialog({ type: 'edit', product })}
                      >
                        {fr.catalogue.edit}
                      </Button>
                      {product.status !== 'CONFIRMED' && (
                        <Button onClick={() => setDialog({ type: 'confirm', product })}>
                          {fr.verification.confirm}
                        </Button>
                      )}
                    </>
                  )
                }
              >
                <p className="font-medium">
                  {product.name}
                  {product.insurerCode && (
                    <span className="ml-2 font-mono text-xs text-slate-500">
                      {product.insurerCode}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {product.insurer.name} · {t.lines[product.line]}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <VerificationBadges entry={product} />
                  <StatusBadge tone={product.usable ? 'ok' : 'neutral'}>
                    {product.usable ? t.usable : t.notUsable}
                  </StatusBadge>
                </div>
                {product.description && (
                  <p className="whitespace-pre-line text-sm">{product.description}</p>
                )}
                <VerificationDetails entry={product} />
              </EntryRow>
            ))}
          </EntryList>
        )}
      />

      {dialog?.type === 'create' && (
        <EntryFormDialog
          title={t.create}
          fields={productFields({ insurers, editing: false })}
          initial={{
            insurerId: activeInsurers[0].id,
            line: 'CAR',
            name: '',
            insurerCode: '',
            description: '',
            source: '',
          }}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await apiPost('/products', values);
            done();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <ProductEditDialog product={dialog.product} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.type === 'confirm' && (
        <ConfirmEntryDialog
          name={dialog.product.name}
          onClose={() => setDialog(null)}
          onConfirm={async (reference) => {
            await apiPost(`/products/${dialog.product.id}/confirm`, {
              reference,
              version: dialog.product.version,
            });
            done();
          }}
        />
      )}
    </CatalogueSection>
  );
}

function ProductEditDialog({ product, onClose, onDone }) {
  const initial = {
    line: product.line,
    name: product.name,
    insurerCode: product.insurerCode ?? '',
    description: product.description ?? '',
    source: product.source,
    active: product.active,
  };
  return (
    <EntryFormDialog
      title={t.editTitle}
      note={product.status === 'CONFIRMED' ? fr.verification.clearedNote : null}
      fields={productFields({ insurers: [], editing: true })}
      initial={initial}
      onClose={onClose}
      onSubmit={async (values) => {
        await apiSend(
          'PATCH',
          `/products/${product.id}`,
          changesOf(values, initial, product.version),
        );
        onDone();
      }}
    />
  );
}
