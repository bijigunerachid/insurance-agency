import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiUpload } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';
import { useAuth } from '../auth/AuthContext.jsx';

const t = fr.documents;
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 10 * 1024 * 1024;

/** Scans of the documents printed by the insurer's platform, attached to the contract. */
export function ContractDocuments({ contract }) {
  const { can } = useAuth();
  const { state, reload } = useApiQuery(`/contracts/${contract.id}/documents`);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function remove(document, reason) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/documents/${document.id}/remove`, { reason });
      setDialog(null);
      reload({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="documents-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="documents-heading" className="text-lg font-semibold">
            {t.section}
          </h2>
          <p className="text-sm text-slate-600">{t.intro}</p>
        </div>
        {can('documents.upload') && (
          <Button onClick={() => setDialog({ type: 'upload' })}>{t.add}</Button>
        )}
      </div>
      {state.status === 'loading' && <Spinner label={fr.app.loading} />}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {state.status === 'done' &&
        (state.data.items.length === 0 ? (
          <p className="text-sm text-slate-600">{t.none}</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {state.data.items.map((document) => {
              const current = !document.removal && !document.replacedBy;
              return (
                <li
                  key={document.id}
                  className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{t.types[document.type]}</p>
                    <p className="break-all">
                      {can('documents.download') && !document.removal ? (
                        <a
                          href={`/api/documents/${document.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 underline-offset-2 hover:underline"
                        >
                          {document.originalName}
                        </a>
                      ) : (
                        document.originalName
                      )}{' '}
                      <span className="text-slate-600">· {t.size(document.size)}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {formatDateTime(document.uploadedAt)} · {t.by}{' '}
                      {document.uploadedBy.displayName}
                    </p>
                    {document.replaces && (
                      <p className="text-xs text-slate-600">
                        {t.replaces(document.replaces.originalName)}
                      </p>
                    )}
                    {/* Notes, not badges: long file names and reasons must wrap on a phone. */}
                    {document.replacedBy && (
                      <p className="break-all text-xs font-medium text-slate-700">
                        {t.replacedBy(document.replacedBy.originalName)}
                      </p>
                    )}
                    {document.removal && (
                      <p className="break-words text-xs font-medium text-amber-900">
                        {t.removed(document.removal.reason)}
                      </p>
                    )}
                  </div>
                  {current && (
                    <div className="flex flex-wrap gap-2">
                      {can('documents.download') && (
                        <Link
                          to={`/documents/${document.id}/saisie`}
                          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                        >
                          {t.capture}
                        </Link>
                      )}
                      {can('documents.upload') && (
                        <Button
                          variant="secondary"
                          onClick={() => setDialog({ type: 'upload', replaces: document })}
                        >
                          {t.replace}
                        </Button>
                      )}
                      {can('documents.remove') && (
                        <Button
                          variant="secondary"
                          onClick={() => setDialog({ type: 'remove', document })}
                        >
                          {t.remove}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}

      {dialog?.type === 'upload' && (
        <UploadDialog
          contract={contract}
          replaces={dialog.replaces}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            reload({ silent: true });
          }}
        />
      )}
      {dialog?.type === 'remove' && (
        <ReasonDialog
          title={t.removeTitle(dialog.document.originalName)}
          intro={t.removeIntro}
          confirmLabel={t.remove}
          busy={busy}
          error={error}
          onCancel={() => {
            setDialog(null);
            setError(null);
          }}
          onConfirm={(reason) => remove(dialog.document, reason)}
        />
      )}
    </section>
  );
}

/** Checks the file in the browser first (type, 10 MB); the server checks its content again. */
function UploadDialog({ contract, replaces, onClose, onDone }) {
  const fileId = useId();
  const [type, setType] = useState(replaces?.type ?? 'ATTESTATION');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function choose(event) {
    const chosen = event.target.files?.[0] ?? null;
    setError(null);
    if (chosen && !ACCEPTED.includes(chosen.type)) {
      setFile(null);
      setFileError(t.wrongType);
    } else if (chosen && chosen.size > MAX_BYTES) {
      setFile(null);
      setFileError(t.tooBig);
    } else {
      setFile(chosen);
      setFileError(null);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type });
      if (replaces) params.set('replacesId', replaces.id);
      await apiUpload(`/contracts/${contract.id}/documents?${params}`, file);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Dialog title={replaces ? t.replaceTitle(replaces.originalName) : t.addTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {replaces && <p className="text-sm text-slate-700">{t.replaceIntro}</p>}
        {error && <Alert>{errorMessage(error)}</Alert>}
        <SelectField
          label={t.type}
          value={type}
          onChange={(event) => setType(event.target.value)}
          disabled={Boolean(replaces)}
          options={Object.entries(t.types).map(([value, label]) => ({ value, label }))}
        />
        <div>
          <label htmlFor={fileId} className="block text-sm font-medium text-slate-800">
            {t.file}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={choose}
            aria-invalid={fileError ? 'true' : undefined}
            aria-describedby={`${fileId}-hint${fileError ? ` ${fileId}-error` : ''}`}
            className="mt-1 block w-full text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-800"
          />
          <p id={`${fileId}-hint`} className="mt-1 text-xs text-slate-500">
            {t.fileHint}
          </p>
          {fileError && (
            <p id={`${fileId}-error`} className="mt-1 text-sm text-red-700">
              {fileError}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !file}>
            {t.upload}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
