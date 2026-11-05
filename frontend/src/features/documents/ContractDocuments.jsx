import { DocumentTextIcon, PaperClipIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { FileField } from '../../components/FileField.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { textLinkClasses } from '../../components/TextLink.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiUpload } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';
import { useAuth } from '../auth/AuthContext.jsx';

const t = fr.documents;

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
      <SectionHeading
        id="documents-heading"
        title={t.section}
        description={t.intro}
        actions={
          can('documents.upload') && (
            <Button size="sm" icon={PaperClipIcon} onClick={() => setDialog({ type: 'upload' })}>
              {t.add}
            </Button>
          )
        }
      />
      {state.status === 'loading' && <SkeletonList rows={2} />}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {state.status === 'done' &&
        (state.data.items.length === 0 ? (
          <EmptyState compact title={t.none} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-hairline">
            {state.data.items.map((document) => {
              const current = !document.removal && !document.replacedBy;
              return (
                <li
                  key={document.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5"
                >
                  <div className="flex min-w-0 gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control bg-sunken"
                    >
                      <DocumentTextIcon
                        className={`size-5 ${current ? 'text-primary' : 'text-ink-muted'}`}
                      />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className={`font-medium ${current ? 'text-ink' : 'text-ink-muted'}`}>
                        {t.types[document.type]}
                      </p>
                      <p className="break-all text-ink-soft">
                        {can('documents.download') && !document.removal ? (
                          <a
                            href={`/api/documents/${document.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className={textLinkClasses}
                          >
                            {document.originalName}
                          </a>
                        ) : (
                          document.originalName
                        )}{' '}
                        <span className="text-ink-muted">· {t.size(document.size)}</span>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatDateTime(document.uploadedAt)} · {t.by}{' '}
                        {document.uploadedBy.displayName}
                      </p>
                      {document.replaces && (
                        <p className="break-all text-xs text-ink-muted">
                          {t.replaces(document.replaces.originalName)}
                        </p>
                      )}
                      {/* Notes, not badges: long file names and reasons must wrap on a phone. */}
                      {document.replacedBy && (
                        <p className="break-all text-xs font-medium text-ink-soft">
                          {t.replacedBy(document.replacedBy.originalName)}
                        </p>
                      )}
                      {document.removal && (
                        <p className="break-words text-xs font-medium text-warning-ink">
                          {t.removed(document.removal.reason)}
                        </p>
                      )}
                    </div>
                  </div>
                  {current && (
                    <div className="flex flex-wrap gap-2">
                      {can('documents.download') && (
                        <ButtonLink size="sm" to={`/documents/${document.id}/saisie`}>
                          {t.capture}
                        </ButtonLink>
                      )}
                      {can('documents.upload') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDialog({ type: 'upload', replaces: document })}
                        >
                          {t.replace}
                        </Button>
                      )}
                      {can('documents.remove') && (
                        <Button
                          size="sm"
                          variant="ghost"
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

/** The file is checked in the browser first (FileField); the server checks its content again. */
function UploadDialog({ contract, replaces, onClose, onDone }) {
  const [type, setType] = useState(replaces?.type ?? 'ATTESTATION');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
        {replaces && <p className="text-sm text-ink-soft">{t.replaceIntro}</p>}
        {error && <Alert>{errorMessage(error)}</Alert>}
        <SelectField
          label={t.type}
          value={type}
          onChange={(event) => setType(event.target.value)}
          disabled={Boolean(replaces)}
          options={Object.entries(t.types).map(([value, label]) => ({ value, label }))}
        />
        <FileField
          label={t.file}
          hint={t.fileHint}
          file={file}
          error={fileError}
          disabled={busy}
          onChange={(chosen, problem) => {
            setFile(chosen);
            setFileError(problem);
            setError(null);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" loading={busy} disabled={!file}>
            {t.upload}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
