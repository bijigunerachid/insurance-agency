import { useState } from 'react';
import { useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TextLink } from '../../components/TextLink.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { ScanPreview } from '../../features/documents/ScanPreview.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost, apiSend } from '../../services/api.js';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';

const t = fr.capture;

/** The fields printed on each document, in the order of the form (server: documents/fields.js). */
const FIELDS = {
  ATTESTATION: [
    ['seriesCode', 'text'],
    ['number', 'digits'],
    ['usage', 'text'],
    ['holderName', 'text'],
    ['holderIdNumber', 'text'],
    ['holderAddress', 'text'],
    ['policyNumber', 'text'],
    ['intermediary', 'text'],
    ['registration', 'text'],
    ['vin', 'text'],
    ['makeAndType', 'text'],
    ['bodyType', 'text'],
    ['seats', 'digits'],
    ['validFrom', 'date'],
    ['validTo', 'date'],
  ],
  CONDITIONS_PARTICULIERES: [
    ['policyNumber', 'text'],
    ['holderName', 'text'],
    ['registration', 'text'],
    ['effectDate', 'date'],
    ['endDate', 'date'],
    ['premiumNet', 'money'],
    ['taxes', 'money'],
    ['premiumTotal', 'money'],
    ['crm', 'text'],
  ],
  QUITTANCE: [
    ['quittanceNumber', 'text'],
    ['policyNumber', 'text'],
    ['periodFrom', 'date'],
    ['periodTo', 'date'],
    ['premiumTotal', 'money'],
  ],
  NOTE_DE_COUVERTURE: [
    ['coverNoteNumber', 'text'],
    ['policyNumber', 'text'],
    ['registration', 'text'],
    ['validFrom', 'date'],
    ['validTo', 'date'],
  ],
};
const MONEY_FIELDS = new Set(['premiumNet', 'taxes', 'premiumTotal']);
const DATE_FIELDS = new Set([
  'validFrom',
  'validTo',
  'effectDate',
  'endDate',
  'periodFrom',
  'periodTo',
]);
const TONES = {
  MATCH: 'ok',
  DIFFERENT: 'error',
  MISSING_IN_APP: 'warning',
  NOT_ON_CONTRACT: 'warning',
};
const LINKS = {
  customer: (id) => `/clients/${id}`,
  vehicle: (id) => `/vehicules/${id}`,
  attestations: (id) => `/contrats/${id}`,
};

/** A value as the employee reads it: dates as DD/MM/YYYY, amounts in MAD. */
function shown(field, value) {
  if (value === null || value === undefined || value === '') return t.none;
  if (DATE_FIELDS.has(field)) return formatDate(value);
  if (MONEY_FIELDS.has(field)) return formatMoney(value);
  return value;
}

/** Typing what an insurer document prints, beside its scan, and comparing it with the records. */
export function DocumentCapturePage() {
  const { id } = useParams();
  const { state, reload } = useApiQuery(`/documents/${id}/capture`);
  // Kept here: the form below starts again from the server after each save.
  const [notice, setNotice] = useState(null);

  if (state.status === 'loading') return <SkeletonDetail />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={errorMessage(state.error)}
        body={fr.common.genericError}
        requestId={state.error.requestId}
      />
    );
  }
  // Keyed by the capture's version: after a save or a correction the form starts from the server.
  return (
    <CaptureView
      key={`${state.data.capture?.version ?? 0}-${state.data.contract.version}`}
      data={state.data}
      reload={reload}
      notice={notice}
      setNotice={setNotice}
    />
  );
}

function CaptureView({ data, reload, notice, setNotice }) {
  const { can } = useAuth();
  const { document, contract, capture, checks } = data;
  const fields = FIELDS[document.type];
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map(([name]) => [name, String(capture?.fields?.[name] ?? '')])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const fileUrl = `/api/documents/${document.id}/file`;
  const canCapture = can('documents.capture');

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        fields: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== '')),
      };
      if (capture) body.version = capture.version;
      await apiSend('PUT', `/documents/${document.id}/capture`, body);
      setFieldErrors({});
      setNotice(t.saved);
      reload({ silent: true });
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, t.rules[d.rule] ?? t.rules.invalid_format]),
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function apply(field) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/documents/${document.id}/capture/apply`, {
        field,
        version: contract.version,
      });
      setNotice(t.applied);
      reload({ silent: true });
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, t.rules[d.rule] ?? t.rules.invalid_format]),
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: `/contrats/${contract.id}`, label: t.back }}
        title={t.title(fr.documents.types[document.type])}
        description={t.intro}
        meta={
          <p className="break-all text-sm text-ink-muted">
            <span className="font-mono font-medium text-ink-soft">{contract.ref}</span> ·{' '}
            {document.originalName}
          </p>
        }
      />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <ScanPreview
          url={fileUrl}
          mimeType={document.mimeType}
          name={document.originalName}
          openLabel={t.openScan}
        />

        <div className="space-y-6">
          <Card
            title={t.form}
            description={
              capture &&
              t.savedBy(capture.capturedBy.displayName, formatDateTime(capture.capturedAt))
            }
          >
            <form onSubmit={save} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map(([name, kind]) => (
                  <TextField
                    key={name}
                    label={t.fields[name]}
                    type={kind === 'date' ? 'date' : 'text'}
                    inputMode={
                      kind === 'money' ? 'decimal' : kind === 'digits' ? 'numeric' : undefined
                    }
                    maxLength={200}
                    value={values[name]}
                    onChange={(event) => {
                      setValues({ ...values, [name]: event.target.value });
                      setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
                    }}
                    error={fieldErrors[name]}
                    disabled={!canCapture}
                  />
                ))}
              </div>
              {canCapture && (
                <div className="flex justify-end">
                  <Button type="submit" loading={busy}>
                    {t.save}
                  </Button>
                </div>
              )}
            </form>
          </Card>

          <Card title={t.checks} flush>
            {checks.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-muted sm:px-5">{t.noChecks}</p>
            ) : (
              <ul className="divide-y divide-line">
                {checks.map((check) => (
                  <li
                    key={check.field}
                    className={`space-y-2 px-4 py-3 text-sm sm:px-5 ${
                      check.status === 'DIFFERENT' ? 'border-l-4 border-l-danger' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{t.fields[check.field]}</p>
                      <StatusBadge tone={TONES[check.status]}>
                        {t.statuses[check.status]}
                      </StatusBadge>
                    </div>
                    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">{t.document}</dt>
                        <dd className="break-words text-ink">
                          {shown(check.field, check.captured)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">{t.app}</dt>
                        <dd className="break-words text-ink">
                          {shown(check.field, check.recorded)}
                        </dd>
                      </div>
                    </dl>
                    {check.status !== 'MATCH' && (check.apply || check.link) && (
                      <div className="flex flex-wrap items-center gap-3">
                        {check.apply &&
                          can('contracts.write') &&
                          canCapture &&
                          (contract.correctable ? (
                            <Button size="sm" disabled={busy} onClick={() => apply(check.apply)}>
                              {t.apply}
                            </Button>
                          ) : (
                            <p className="text-xs text-ink-muted">{t.notCorrectable}</p>
                          ))}
                        {check.link && (
                          <TextLink to={LINKS[check.link.kind](check.link.id)} className="text-sm">
                            {t.links[check.link.kind]}
                          </TextLink>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
