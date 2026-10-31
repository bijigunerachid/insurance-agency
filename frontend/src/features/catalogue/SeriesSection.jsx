import { useEffect, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { CatalogueSection, EntryList, EntryRow, QueryState } from './CatalogueSection.jsx';
import { EntryFormDialog, changesOf } from './EntryFormDialog.jsx';
import { ConfirmEntryDialog, VerificationBadges, VerificationDetails } from './Verification.jsx';

const t = fr.catalogue.series;

/**
 * The model of a series is configuration (owner, 23/10/2026). Active models are offered, plus
 * the series' current one; on creation "by letter" lets the code's letter decide.
 */
function modelField(models, current) {
  return {
    name: 'modelCode',
    label: t.model,
    hint: t.modelHint,
    type: 'select',
    options: [
      ...(current ? [] : [{ value: '', label: t.modelByLetter }]),
      ...models
        .filter((m) => m.active || m.code === current)
        .map((m) => ({ value: m.code, label: fr.catalogue.models.name(m) })),
    ],
  };
}

function seriesFields({ insurers, models, editing, current }) {
  return [
    ...(editing
      ? []
      : [
          {
            name: 'insurerId',
            label: fr.catalogue.products.insurer,
            type: 'select',
            options: insurers.filter((i) => i.active).map((i) => ({ value: i.id, label: i.name })),
          },
        ]),
    { name: 'code', label: t.code, hint: t.codeHint, required: true, maxLength: 12 },
    modelField(models, current),
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

/**
 * Attestation series of each insurer, e.g. RMA 14 A, each with the national model chosen for it.
 * `modelChanges` counts the model edits made on the page: they change what the series show.
 */
export function SeriesSection({ insurers, models, modelChanges, canManage }) {
  const [dialog, setDialog] = useState(null);
  const { state, reload } = useApiQuery('/attestation-series');
  useEffect(() => {
    if (modelChanges > 0) reload({ silent: true });
  }, [modelChanges, reload]);
  const done = () => {
    setDialog(null);
    reload({ silent: true });
  };
  const activeInsurers = insurers.filter((i) => i.active);

  return (
    <CatalogueSection
      id="series-title"
      title={t.title}
      intro={t.intro}
      addLabel={t.create}
      onAdd={canManage && activeInsurers.length > 0 ? () => setDialog({ type: 'create' }) : null}
    >
      <QueryState
        state={state}
        empty={fr.common.empty}
        isEmpty={(data) => data.items.length === 0}
        render={(data) => (
          <EntryList>
            {data.items.map((series) => (
              <EntryRow
                key={series.id}
                actions={
                  canManage && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setDialog({ type: 'edit', series })}
                      >
                        {fr.catalogue.edit}
                      </Button>
                      {series.status !== 'CONFIRMED' && (
                        <Button onClick={() => setDialog({ type: 'confirm', series })}>
                          {fr.verification.confirm}
                        </Button>
                      )}
                    </>
                  )
                }
              >
                <p className="font-medium">
                  {series.insurer.code} <span className="font-mono">{series.code}</span>
                  <span className="ml-2 text-sm font-normal text-slate-600">
                    {fr.catalogue.models.name(series.model)}
                  </span>
                </p>
                <VerificationBadges entry={series} />
                <VerificationDetails entry={series} />
              </EntryRow>
            ))}
          </EntryList>
        )}
      />

      {dialog?.type === 'create' && (
        <EntryFormDialog
          title={t.create}
          fields={seriesFields({ insurers, models, editing: false })}
          initial={{ insurerId: activeInsurers[0].id, code: '', modelCode: '', source: '' }}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await apiPost('/attestation-series', values);
            done();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <EditSeries
          series={dialog.series}
          models={models}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog?.type === 'confirm' && (
        <ConfirmEntryDialog
          name={`${dialog.series.insurer.code} ${dialog.series.code}`}
          onClose={() => setDialog(null)}
          onConfirm={async (reference) => {
            await apiPost(`/attestation-series/${dialog.series.id}/confirm`, {
              reference,
              version: dialog.series.version,
            });
            done();
          }}
        />
      )}
    </CatalogueSection>
  );
}

function EditSeries({ series, models, onClose, onDone }) {
  const initial = {
    code: series.code,
    modelCode: series.model.code,
    source: series.source,
    active: series.active,
  };
  return (
    <EntryFormDialog
      title={t.editTitle}
      note={series.status === 'CONFIRMED' ? fr.verification.clearedNote : null}
      fields={seriesFields({ insurers: [], models, editing: true, current: series.model.code })}
      initial={initial}
      onClose={onClose}
      onSubmit={async (values) => {
        await apiSend(
          'PATCH',
          `/attestation-series/${series.id}`,
          changesOf(values, initial, series.version),
        );
        onDone();
      }}
    />
  );
}
