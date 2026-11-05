import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { FileField } from '../../components/FileField.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { SkeletonList } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiUpload } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const t = fr.scans;
const TONES = { PENDING: 'warning', FILED: 'ok', DISCARDED: 'neutral' };

/** Scan an attestation; the scans waiting to be checked, those recorded, those discarded. */
export function ScansPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('PENDING');
  const { state } = useApiQuery(`/scans?status=${status}`);

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
    <section aria-labelledby="scans-title" className="space-y-6">
      <PageHeader titleId="scans-title" title={t.title} description={t.intro} />
      <Card>
        <form onSubmit={read} className="space-y-4" noValidate>
          {error && <Alert>{errorMessage(error)}</Alert>}
          <FileField
            label={t.file}
            hint={t.fileHint}
            capture="environment"
            file={file}
            error={fileError}
            disabled={busy}
            onChange={(chosen, problem) => {
              setFile(chosen);
              setFileError(problem);
              setError(null);
            }}
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {busy && (
              <p role="status" className="text-sm text-ink-muted">
                {t.reading}
              </p>
            )}
            <Button type="submit" size="lg" loading={busy} disabled={!file}>
              {t.read}
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="scans-list" className="space-y-3">
        <SectionHeading id="scans-list" title={t.lists[status]} />
        <SegmentedControl
          label={t.statusLabel}
          value={status}
          onChange={setStatus}
          options={Object.entries(t.filters).map(([value, label]) => ({ value, label }))}
        />
        {state.status === 'loading' && <SkeletonList rows={3} />}
        {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
        {state.status === 'done' &&
          (state.data.items.length === 0 ? (
            <EmptyState compact title={t.empty[status]} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-hairline">
              {state.data.items.map((scan) => {
                const named = scan.proposed.seriesCode && scan.proposed.number;
                return (
                  <li
                    key={scan.id}
                    className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm sm:px-5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p>
                        <TextLink
                          to={`/scans/${scan.id}`}
                          className={named ? 'font-mono' : 'break-all'}
                        >
                          {named
                            ? `${scan.proposed.seriesCode} n° ${scan.proposed.number}`
                            : scan.originalName}
                        </TextLink>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatDateTime(scan.uploadedAt)} · {t.by} {scan.uploadedBy.displayName}
                        {scan.read ? ` · ${t.confidence(scan.confidence)}` : ` · ${t.notRead}`}
                      </p>
                    </div>
                    <StatusBadge tone={TONES[scan.status]}>{t.statuses[scan.status]}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          ))}
      </section>
    </section>
  );
}
