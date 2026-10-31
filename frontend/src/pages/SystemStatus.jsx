import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { Button } from '../components/Button.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Spinner } from '../components/Spinner.jsx';
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
    <section aria-labelledby="status-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="status-title" className="text-2xl font-semibold">
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={state.status === 'loading'}>
          <ArrowPathIcon aria-hidden="true" className="size-4" />
          {t.refresh}
        </Button>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && <Spinner label={t.loading} />}

        {state.status === 'error' && (
          <ErrorState title={t.errorTitle} body={t.errorBody} requestId={state.error.requestId} />
        )}

        {state.status === 'done' && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <dl className="divide-y divide-slate-200">
              <StatusRow label={t.server} ok />
              <StatusRow label={t.database} ok={state.data?.checks?.database === 'ok'} />
              {state.data?.serverTime && (
                <ClockRow serverTime={state.data.serverTime} checkedAt={state.checkedAt} />
              )}
              {state.data?.backup && (
                <BackupRow backup={state.data.backup} checkedAt={state.checkedAt} />
              )}
            </dl>
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <dt className="text-sm font-medium">
        {t.clock}
        <span className="block text-xs font-normal text-slate-600">
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <dt className="text-sm font-medium">
        {t.backup}
        <span className="block text-xs font-normal text-slate-600">
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <dt className="text-sm font-medium">{label}</dt>
      <dd>
        <StatusBadge tone={ok ? 'ok' : 'error'}>{ok ? t.ok : t.unavailable}</StatusBadge>
      </dd>
    </div>
  );
}
