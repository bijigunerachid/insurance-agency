import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { CatalogueSection, EntryList, EntryRow, QueryState } from './CatalogueSection.jsx';
import { EntryFormDialog, changesOf } from './EntryFormDialog.jsx';
import { ConfirmEntryDialog, VerificationBadges, VerificationDetails } from './Verification.jsx';

const t = fr.catalogue.usages;
const source = {
  name: 'source',
  label: fr.verification.source,
  hint: fr.verification.sourceHint,
  required: true,
  maxLength: 300,
};

/**
 * A usage may take any active model except the provisional one; its current model stays listed
 * even if it was deactivated since.
 */
function modelField(models, current) {
  return {
    name: 'modelCode',
    label: t.model,
    type: 'select',
    options: [
      { value: '', label: t.noModel },
      ...models
        .filter((m) => !m.provisional && (m.active || m.code === current))
        .map((m) => ({ value: m.code, label: fr.catalogue.models.name(m) })),
    ],
  };
}

/** Usages printed on attestations (rule L16). `usages` is the page's shared query. */
export function UsagesSection({ usages, models, onChanged, canManage }) {
  const [dialog, setDialog] = useState(null);
  const done = () => {
    setDialog(null);
    onChanged();
  };

  return (
    <CatalogueSection
      id="usages-title"
      title={t.title}
      intro={t.intro}
      addLabel={t.create}
      onAdd={canManage ? () => setDialog({ type: 'create' }) : null}
    >
      <QueryState
        state={usages}
        empty={fr.common.empty}
        isEmpty={(data) => data.items.length === 0}
        render={(data) => (
          <EntryList>
            {data.items.map((usage) => (
              <EntryRow
                key={usage.id}
                actions={
                  canManage && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setDialog({ type: 'edit', usage })}
                      >
                        {fr.catalogue.edit}
                      </Button>
                      {usage.status !== 'CONFIRMED' && (
                        <Button onClick={() => setDialog({ type: 'confirm', usage })}>
                          {fr.verification.confirm}
                        </Button>
                      )}
                    </>
                  )
                }
              >
                <p className="font-medium">
                  {usage.label}
                  <span className="ml-2 text-sm font-normal text-slate-600">
                    {usage.model ? fr.catalogue.models.name(usage.model) : t.modelMissing} ·{' '}
                    {t.vehicles(usage.vehicleCount)}
                  </span>
                </p>
                <VerificationBadges entry={usage} />
                <VerificationDetails entry={usage} />
              </EntryRow>
            ))}
          </EntryList>
        )}
      />

      {dialog?.type === 'create' && (
        <EntryFormDialog
          title={t.create}
          fields={[
            { name: 'label', label: t.label, required: true, maxLength: 80 },
            modelField(models, null),
            source,
          ]}
          initial={{ label: '', modelCode: '', source: '' }}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await apiPost('/vehicle-usages', values);
            done();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <EditUsage
          usage={dialog.usage}
          models={models}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog?.type === 'confirm' && (
        <ConfirmEntryDialog
          name={dialog.usage.label}
          onClose={() => setDialog(null)}
          onConfirm={async (reference) => {
            await apiPost(`/vehicle-usages/${dialog.usage.id}/confirm`, {
              reference,
              version: dialog.usage.version,
            });
            done();
          }}
        />
      )}
    </CatalogueSection>
  );
}

function EditUsage({ usage, models, onClose, onDone }) {
  const initial = {
    label: usage.label,
    modelCode: usage.model?.code ?? '',
    source: usage.source,
    active: usage.active,
  };
  return (
    <EntryFormDialog
      title={t.editTitle}
      note={usage.status === 'CONFIRMED' ? fr.verification.clearedNote : null}
      fields={[
        { name: 'label', label: t.label, required: true, maxLength: 80 },
        modelField(models, usage.model?.code),
        source,
        { name: 'active', label: fr.verification.activeLabel, type: 'checkbox' },
      ]}
      initial={initial}
      onClose={onClose}
      onSubmit={async (values) => {
        await apiSend(
          'PATCH',
          `/vehicle-usages/${usage.id}`,
          changesOf(values, initial, usage.version),
        );
        onDone();
      }}
    />
  );
}
