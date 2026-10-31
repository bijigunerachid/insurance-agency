import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { CatalogueSection, EntryList, EntryRow, QueryState } from './CatalogueSection.jsx';
import { EntryFormDialog, changesOf } from './EntryFormDialog.jsx';
import { ConfirmEntryDialog, VerificationBadges, VerificationDetails } from './Verification.jsx';

const t = fr.catalogue.models;
const officialFields = [
  {
    name: 'officialNumber',
    label: t.officialNumber,
    hint: t.officialNumberHint,
    maxLength: 2,
    inputMode: 'numeric',
  },
  { name: 'colour', label: t.colour, maxLength: 40 },
];
const source = {
  name: 'source',
  label: fr.verification.source,
  hint: fr.verification.sourceHint,
  required: true,
  maxLength: 300,
};

/** National attestation models (A Tourisme… P Provisoire). `models` is the page's shared query. */
export function ModelsSection({ models, onChanged, canManage }) {
  const [dialog, setDialog] = useState(null);
  const done = () => {
    setDialog(null);
    onChanged();
  };

  return (
    <CatalogueSection
      id="models-title"
      title={t.title}
      intro={t.intro}
      addLabel={t.create}
      onAdd={canManage ? () => setDialog({ type: 'create' }) : null}
    >
      <QueryState
        state={models}
        empty={fr.common.empty}
        isEmpty={(data) => data.items.length === 0}
        render={(data) => (
          <EntryList>
            {data.items.map((model) => (
              <EntryRow
                key={model.id}
                actions={
                  canManage && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setDialog({ type: 'edit', model })}
                      >
                        {fr.catalogue.edit}
                      </Button>
                      {model.status !== 'CONFIRMED' && (
                        <Button onClick={() => setDialog({ type: 'confirm', model })}>
                          {fr.verification.confirm}
                        </Button>
                      )}
                    </>
                  )
                }
              >
                <p className="font-medium">
                  <span className="font-mono">{model.code}</span> · {model.label}
                  <span className="ml-2 text-sm font-normal text-slate-600">
                    {t.official(model)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <VerificationBadges entry={model} />
                  {model.provisional && (
                    <StatusBadge tone="neutral">{t.provisionalTag}</StatusBadge>
                  )}
                </div>
                <VerificationDetails entry={model} />
              </EntryRow>
            ))}
          </EntryList>
        )}
      />

      {dialog?.type === 'create' && (
        <EntryFormDialog
          title={t.create}
          fields={[
            { name: 'code', label: t.code, hint: t.codeHint, required: true, maxLength: 1 },
            { name: 'label', label: t.label, required: true, maxLength: 80 },
            { name: 'provisional', label: t.provisional, type: 'checkbox' },
            ...officialFields,
            source,
          ]}
          initial={{
            code: '',
            label: '',
            provisional: false,
            officialNumber: '',
            colour: '',
            source: '',
          }}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await apiPost('/attestation-models', values);
            done();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <EditModel model={dialog.model} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.type === 'confirm' && (
        <ConfirmEntryDialog
          name={t.name(dialog.model)}
          onClose={() => setDialog(null)}
          onConfirm={async (reference) => {
            await apiPost(`/attestation-models/${dialog.model.id}/confirm`, {
              reference,
              version: dialog.model.version,
            });
            done();
          }}
        />
      )}
    </CatalogueSection>
  );
}

/** The letter and the provisional kind are fixed: series and usages rely on them. */
function EditModel({ model, onClose, onDone }) {
  const initial = {
    label: model.label,
    officialNumber: model.officialNumber ? String(model.officialNumber) : '',
    colour: model.colour ?? '',
    source: model.source,
    active: model.active,
  };
  return (
    <EntryFormDialog
      title={`${t.editTitle} ${model.code}`}
      note={model.status === 'CONFIRMED' ? fr.verification.clearedNote : null}
      fields={[
        { name: 'label', label: t.label, required: true, maxLength: 80 },
        ...officialFields,
        source,
        { name: 'active', label: fr.verification.activeLabel, type: 'checkbox' },
      ]}
      initial={initial}
      onClose={onClose}
      onSubmit={async (values) => {
        await apiSend(
          'PATCH',
          `/attestation-models/${model.id}`,
          changesOf(values, initial, model.version),
        );
        onDone();
      }}
    />
  );
}
