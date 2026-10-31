import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiUpload } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.scans;
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 10 * 1024 * 1024;
const TONES = { PENDING: 'warning', FILED: 'ok', DISCARDED: 'neutral' };

/** Scan an attestation; the scans waiting to be checked, or those already processed. */
export function ScansPage() {
  const navigate = useNavigate();
  const fileId = useId();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [closed, setClosed] = useState(false);
  const { state } = useApiQuery(`/scans?status=${closed ? 'FILED' : 'PENDING'}`);

  function choose(event) {
    const chosen = event.target.files?.[0] ?? null;
    setError(null);
    if (chosen && !ACCEPTED.includes(chosen.type)) {
      setFile(null);
      setFileError(fr.documents.wrongType);
    } else if (chosen && chosen.size > MAX_BYTES) {
      setFile(null);
      setFileError(fr.documents.tooBig);
    } else {
      setFile(chosen);
      setFileError(null);
    }
  }

  async function read(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const scan = await apiUpload('/scans', file);
      navigate(`/scans/${scan.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="scans-title" className="space-y-4">
      <div>
        <h1 id="scans-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>
      <form
        onSubmit={read}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        noValidate
      >
        {error && <Alert>{errorMessage(error)}</Alert>}
        <div>
          <label htmlFor={fileId} className="block text-sm font-medium text-slate-800">
            {t.file}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            capture="environment"
            onChange={choose}
            disabled={busy}
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
        <div className="flex flex-wrap items-center justify-end gap-3">
          {busy && <Spinner label={t.reading} />}
          <Button type="submit" disabled={busy || !file}>
            {t.read}
          </Button>
        </div>
      </form>

      <section aria-labelledby="scans-list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="scans-list" className="text-lg font-semibold">
            {closed ? t.closed : t.pending}
          </h2>
          <button
            type="button"
            onClick={() => setClosed(!closed)}
            className="text-sm font-medium text-blue-700 underline"
          >
            {closed ? t.showPending : t.showClosed}
          </button>
        </div>
        {state.status === 'loading' && <Spinner label={fr.app.loading} />}
        {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
        {state.status === 'done' &&
          (state.data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              {t.noPending}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {state.data.items.map((scan) => (
                <li
                  key={scan.id}
                  className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      <Link
                        to={`/scans/${scan.id}`}
                        className="break-all text-blue-700 underline-offset-2 hover:underline"
                      >
                        {scan.proposed.seriesCode && scan.proposed.number
                          ? `${scan.proposed.seriesCode} n° ${scan.proposed.number}`
                          : scan.originalName}
                      </Link>
                    </p>
                    <p className="text-xs text-slate-600">
                      {formatDateTime(scan.uploadedAt)} · {t.by} {scan.uploadedBy.displayName}
                      {scan.read ? ` · ${t.confidence(scan.confidence)}` : ` · ${t.notRead}`}
                    </p>
                  </div>
                  <StatusBadge tone={TONES[scan.status]}>{t.statuses[scan.status]}</StatusBadge>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </section>
  );
}
