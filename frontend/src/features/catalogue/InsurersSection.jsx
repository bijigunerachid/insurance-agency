import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { CatalogueSection, EntryList, EntryRow, QueryState } from './CatalogueSection.jsx';
import { EntryFormDialog, changesOf } from './EntryFormDialog.jsx';

const t = fr.catalogue.insurers;

/**
 * Insurers. Activating a third one is refused by the server (rule L1) unless the manager
 * confirms it in a second dialog.
 */
export function InsurersSection({ insurers, onChanged, canManage }) {
  const [dialog, setDialog] = useState(null);
  const [overLimit, setOverLimit] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const done = () => {
    setDialog(null);
    setOverLimit(null);
    onChanged();
  };
  /** Sends the request; on INSURER_LIMIT, asks before sending it again with confirmLimit. */
  const save = async (send) => {
    try {
      await send(false);
      done();
    } catch (err) {
      if (err.code !== 'INSURER_LIMIT') throw err;
      setDialog(null);
      setError(null);
      setOverLimit({ send });
    }
  };

  return (
    <CatalogueSection
      id="insurers-title"
      title={t.title}
      intro={t.intro}
      addLabel={t.create}
      onAdd={canManage ? () => setDialog({ type: 'create' }) : null}
    >
      {error && (
        <div className="px-4 pt-3">
          <Alert>{errorMessage(error)}</Alert>
        </div>
      )}
      <QueryState
        state={insurers}
        empty={fr.common.empty}
        isEmpty={(data) => data.items.length === 0}
        render={(data) => (
          <EntryList>
            {data.items.map((insurer) => (
              <EntryRow
                key={insurer.id}
                actions={
                  canManage && (
                    <Button
                      variant="secondary"
                      onClick={() => setDialog({ type: 'edit', insurer })}
                    >
                      {fr.catalogue.edit}
                    </Button>
                  )
                }
              >
                <p className="font-medium">
                  <span className="font-mono">{insurer.code}</span> · {insurer.name}
                </p>
                <StatusBadge tone={insurer.active ? 'ok' : 'neutral'}>
                  {insurer.active ? fr.verification.active : fr.verification.inactive}
                </StatusBadge>
              </EntryRow>
            ))}
          </EntryList>
        )}
      />

      {dialog?.type === 'create' && (
        <EntryFormDialog
          title={t.create}
          fields={[
            { name: 'code', label: t.code, hint: t.codeHint, required: true, maxLength: 16 },
            { name: 'name', label: t.name, required: true, maxLength: 120 },
          ]}
          initial={{ code: '', name: '' }}
          onClose={() => setDialog(null)}
          onSubmit={(values) =>
            save((confirmLimit) =>
              apiPost('/insurers', confirmLimit ? { ...values, confirmLimit } : values),
            )
          }
        />
      )}
      {dialog?.type === 'edit' && (
        <EditInsurer insurer={dialog.insurer} save={save} onClose={() => setDialog(null)} />
      )}
      {overLimit && (
        <ConfirmDialog
          title={t.limitTitle}
          message={t.limitBody}
          confirmLabel={t.limitConfirm}
          tone="danger"
          busy={busy}
          onCancel={() => setOverLimit(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await overLimit.send(true);
              done();
            } catch (err) {
              setOverLimit(null);
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </CatalogueSection>
  );
}

function EditInsurer({ insurer, save, onClose }) {
  const initial = { name: insurer.name, active: insurer.active };
  return (
    <EntryFormDialog
      title={t.editTitle}
      fields={[
        { name: 'name', label: t.name, required: true, maxLength: 120 },
        { name: 'active', label: fr.verification.activeLabel, type: 'checkbox' },
      ]}
      initial={initial}
      onClose={onClose}
      onSubmit={(values) =>
        save((confirmLimit) => {
          const body = changesOf(values, initial, insurer.version);
          return apiSend(
            'PATCH',
            `/insurers/${insurer.id}`,
            confirmLimit ? { ...body, confirmLimit } : body,
          );
        })
      }
    />
  );
}
