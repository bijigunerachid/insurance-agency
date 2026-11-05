import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { Button } from '../components/Button.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { useReadiness } from '../features/system/useReadiness.js';
import { fr } from '../i18n/fr.js';
import { formatDateTime } from '../utils/format.js';

const t = fr.status;
/** Two-step codes allow 30 seconds either side: beyond a minute, the clock needs setting. */
const CLOCK_TOLERANCE_MS = 60_000;
/** The backup job runs every 5 minutes; a full copy is taken every day. */
const BACKUP_RUN_MAX_MS = 15 * 60_000;
const BACKUP_BASE_MAX_MS = 26 * 3600_000;
/** "2026-10-30T190000Z" (a full copy's folder) as a date. */
const baseDate = (name) =>
  name ? new Date(name.replace(/T(\d{2})(\d{2})(\d{2})Z$/, 'T$1:$2:$3Z')) : null;

export function SystemStatus() {
  const { state, refresh } = useReadiness();

  return (
    <section aria-labelledby="status-title" className="space-y-6">
      <PageHeader
        titleId="status-title"
        title={t.title}
        description={t.intro}
        actions={
          <Button
            variant="secondary"
            icon={ArrowPathIcon}
            onClick={refresh}
            loading={state.status === 'loading'}
          >
            {t.refresh}
          </Button>
        }
      />

      <div aria-live="polite" className="max-w-3xl">
        {state.status === 'loading' && <SkeletonList rows={4} label={t.loading} />}

        {state.status === 'error' && (
          <ErrorState title={t.errorTitle} body={t.errorBody} requestId={state.error.requestId} />
        )}

        {state.status === 'done' && (
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-hairline">
            <dl className="divide-y divide-line">
              <StatusRow label={t.server} ok />
              <StatusRow label={t.database} ok={state.data?.checks?.database === 'ok'} />
              {state.data?.serverTime && (
                <ClockRow serverTime={state.data.serverTime} checkedAt={state.checkedAt} />
              )}
              {state.data?.backup && (
                <BackupRow backup={state.data.backup} checkedAt={state.checkedAt} />
              )}
            </dl>
            <p className="border-t border-line bg-canvas px-4 py-3 text-xs text-ink-muted sm:px-5">
              {t.checkedAt} : {formatDateTime(state.checkedAt)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** The server's clock against this PC's: a gap means codes refused and wrong audit times. */
function ClockRow({ serverTime, checkedAt }) {
  const gapMs = new Date(serverTime).getTime() - checkedAt.getTime();
  const ok = Math.abs(gapMs) <= CLOCK_TOLERANCE_MS;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <dt className="min-w-0 text-sm font-medium text-ink">
        {t.clock}
        <span className="mt-0.5 block text-xs font-normal text-ink-muted">
          {formatDateTime(serverTime)}
          {!ok && ` · ${t.clockGap(Math.round(Math.abs(gapMs) / 60_000))}`}
        </span>
      </dt>
      <dd>
        <StatusBadge tone={ok ? 'ok' : 'warning'}>{ok ? t.clockOk : t.clockWrong}</StatusBadge>
      </dd>
    </div>
  );
}

/** The last backup run: disk in place, run recently, a full copy from the last day. */
function BackupRow({ backup, checkedAt }) {
  const ranAt = backup.checkedAt ? new Date(backup.checkedAt) : null;
  const base = baseDate(backup.lastBase);
  let problem = null;
  if (backup.state === 'missing') problem = t.backupNoDisk;
  else if (backup.state !== 'ok' || !ranAt) problem = t.backupNever;
  else if (checkedAt - ranAt > BACKUP_RUN_MAX_MS) problem = t.backupStopped(formatDateTime(ranAt));
  else if (!base || checkedAt - base > BACKUP_BASE_MAX_MS) problem = t.backupNoBase;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <dt className="min-w-0 text-sm font-medium text-ink">
        {t.backup}
        <span className="mt-0.5 block text-xs font-normal text-ink-muted">
          {problem ??
            t.backupDetails({
              disk: backup.disk,
              base: formatDateTime(base),
              free: backup.diskFreeKb ? Math.round(Number(backup.diskFreeKb) / 1048576) : null,
            })}
        </span>
      </dt>
      <dd>
        <StatusBadge tone={problem ? 'warning' : 'ok'}>
          {problem ? t.backupWrong : t.backupOk}
        </StatusBadge>
      </dd>
    </div>
  );
}

function StatusRow({ label, ok }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <dt className="min-w-0 text-sm font-medium text-ink">{label}</dt>
      <dd>
        <StatusBadge tone={ok ? 'ok' : 'error'}>{ok ? t.ok : t.unavailable}</StatusBadge>
      </dd>
    </div>
  );
}
