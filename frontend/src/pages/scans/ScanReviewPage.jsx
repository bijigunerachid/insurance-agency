import { CheckCircleIcon, CheckIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { FormActions } from '../../components/FormActions.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { SkeletonDetail } from '../../components/Skeleton.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TextLink, textLinkClasses } from '../../components/TextLink.jsx';
import { ScanPreview } from '../../features/documents/ScanPreview.jsx';
import {
  insurerUsageFits,
  insurerUsageOptions,
  legalUsageFor,
} from '../../features/vehicles/insurerUsages.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { errorMessage, fr } from '../../i18n/fr.js';
import { apiPost } from '../../services/api.js';
import { formatDate, formatMoney } from '../../utils/format.js';

// The agency takes three provisional attestations in a row for a vehicle, then the next must be
// definitive (owner, 29/10/2026). Not in arrêté 213-05: the review only warns, it never refuses.
const PROVISIONALS_IN_A_ROW = 3;

const t = fr.scans;
const RULES = {
  ...fr.customers.rules,
  ...fr.vehicles.rules,
  ...fr.contracts.rules,
  ...t.rules,
};
const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
// The legal forms in a company's name, compared without accents (« STÉ » → « ste »).
const COMPANY = /\b(sarl|sarlau|sa|snc|scs|ste|societe)\b/;
// A legal usage as the insurer-usage rules read it.
const asUsage = (usage) => usage && { id: usage.id, modelCode: usage.model?.code ?? null };

/** One year of cover from `start`, the last day included ("2026-11-01" → "2027-10-31"). */
function oneYearFrom(start) {
  if (!start) return '';
  const [year, month, day] = start.split('-').map(Number);
  return new Date(Date.UTC(year + 1, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** Checking a scanned attestation beside it, then filing it to follow the insurance. */
export function ScanReviewPage() {
  const { id } = useParams();
  const { state, reload } = useApiQuery(`/scans/${id}`);
  const series = useApiQuery('/attestation-series');
  const usages = useApiQuery('/vehicle-usages');
  const insurerUsages = useApiQuery('/insurer-usages');
  const states = [state, series.state, usages.state, insurerUsages.state];

  if (states.some((s) => s.status === 'loading')) {
    return <SkeletonDetail />;
  }
  const failed = states.find((s) => s.status === 'error');
  if (failed) {
    return (
      <ErrorState
        title={errorMessage(failed.error)}
        body={fr.common.genericError}
        requestId={failed.error.requestId}
      />
    );
  }
  return (
    <Review
      scan={state.data}
      allSeries={series.state.data.items.filter((s) => s.status === 'CONFIRMED' && s.active)}
      allUsages={usages.state.data.items.filter((u) => u.status === 'CONFIRMED' && u.active)}
      insurerUsages={insurerUsages.state.data.items}
      reload={reload}
    />
  );
}

function initialValues(scan, allSeries, allUsages, insurerUsages) {
  const p = scan.proposed;
  const chosenSeries = allSeries.find((s) => s.id === p.seriesId);
  const provisional = chosenSeries?.model.provisional;
  const words = String(p.holderName ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const [make = '', ...model] = String(p.makeAndType ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const seriesUsage = (() => {
    const same = allUsages.filter((u) => u.model?.code === chosenSeries?.model.code);
    return same.length === 1 ? same[0] : null;
  })();
  // The usage printed on the attestation: the legal one of the insurer's usage it names, else as
  // named in the catalogue. An electric vehicle on a white D sheet stays Divers, whatever moped
  // usage was chosen on the platform.
  const electricOnDivers = p.fuel === 'ELECTRIC' && chosenSeries?.model.code === 'D';
  const usage =
    (electricOnDivers ? seriesUsage : null) ??
    allUsages.find((u) => u.id === p.insurerUsageUsageId) ??
    allUsages.find((u) => plain(u.label) === plain(p.usage)) ??
    seriesUsage;
  const printedInsurerUsage = insurerUsages.find((u) => u.id === p.insurerUsageId);
  return {
    seriesId: chosenSeries?.id ?? '',
    number: p.number ?? '',
    validFrom: p.validFrom ?? '',
    validTo: p.validTo ?? '',
    policyNumber: p.policyNumber ?? '',
    quittanceNumber: p.quittanceNumber ?? '',
    coverNoteRef: '',
    customer: {
      // A company printed as the holder (« STALLON VOYAGES SARL » on the CAT sheet of 29/10/2026).
      type: COMPANY.test(plain(p.holderName)) ? 'BUSINESS' : 'INDIVIDUAL',
      lastName: words[0] ?? '',
      firstName: words.slice(1).join(' '),
      legalName: p.holderName ?? '',
      identityType: 'CIN',
      identityNumber: p.holderIdNumber ?? '',
      addressLine: p.holderAddress ?? '',
      city: '',
    },
    vehicle: {
      registration: p.registration ?? '',
      make,
      model: model.join(' '),
      usageId: usage?.id ?? '',
      insurerUsageId:
        printedInsurerUsage && insurerUsageFits(printedInsurerUsage, asUsage(usage), p.fuel)
          ? printedInsurerUsage.id
          : '',
      // "2.R" / "3.R" printed in the genre box: two or three wheels. The attestation model C
      // (arrêté 213-05) is only for utility vehicles, model A (Tourisme) for cars, and so is the
      // usage Tourisme of a provisional sheet (model P says nothing); the employee can always
      // choose another.
      category:
        { '2.R': 'MOTORCYCLE', '3.R': 'TRIPORTEUR' }[p.bodyType] ??
        { A: 'CAR', C: 'COMMERCIAL' }[chosenSeries?.model.code] ??
        // A coach (« CAR DE LIGNE » on the CAT sheet of 29/10/2026).
        (/\b(CAR DE LIGNE|AUTOCAR|AUTOBUS|MINIBUS)\b/i.test(p.usage ?? '')
          ? 'PASSENGER_TRANSPORT'
          : null) ??
        (p.provisional && usage?.label === 'Tourisme' ? 'CAR' : ''),
      vin: p.vin ?? '',
      fiscalPowerCv: p.fiscalPowerCv ? String(p.fiscalPowerCv) : '',
      engineCc: p.engineCc ? String(p.engineCc) : '',
      seats: p.seats ? String(p.seats) : '',
      fuel: p.fuel ?? '',
      firstRegistrationDate: p.firstRegistrationDate ?? '',
    },
    contract: {
      productId: '',
      startDate: p.effectDate ?? p.validFrom ?? '',
      endDate: p.endDate ?? (provisional ? oneYearFrom(p.validFrom) : (p.validTo ?? '')),
      // An avenant's total is its own amount, never the contract's premium.
      premiumTotal: p.amendmentKind ? '' : (p.premiumTotal ?? ''),
    },
    // The PDF is an avenant (rule L28): its attestation is recorded with it on the contract.
    amendment: {
      on: Boolean(p.amendmentKind),
      kind: ['VEHICLE_CHANGE', 'REGISTRATION_CHANGE'].includes(p.amendmentKind)
        ? p.amendmentKind
        : '',
      number: p.amendmentNumber ?? '',
      effectiveDate: p.validFrom ?? '',
      amount: p.amendmentKind ? (p.premiumTotal ?? '') : '',
      previousVehicleId: '',
    },
  };
}

/** The products that fit the attestation first, under their own heading, then the others. */
function productOptions(state) {
  if (state.status !== 'done') return [];
  const { items } = state.data;
  const fits = items.some((pr) => pr.fits);
  return [...items.filter((pr) => pr.fits), ...items.filter((pr) => !pr.fits)].map((pr) => ({
    value: pr.id,
    label: pr.name,
    ...(fits ? { group: pr.fits ? t.productsFit : t.productsOther } : {}),
  }));
}

function Review({ scan, allSeries, allUsages, insurerUsages, reload }) {
  const navigate = useNavigate();
  const [initial] = useState(() => initialValues(scan, allSeries, allUsages, insurerUsages));
  const [values, setValues] = useState(initial);
  // Existing record or a new one; null until the employee chooses (a match is then proposed).
  const [modes, setModes] = useState({ customer: null, vehicle: null, contract: null });
  const [chosen, setChosen] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The employee checked the similar customers and this one is another person.
  const [notDuplicate, setNotDuplicate] = useState(false);
  // Usage chosen for a vehicle already recorded (null: keep its own).
  const [usageFix, setUsageFix] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [discarding, setDiscarding] = useState(false);
  // The full form, when the employee wants to check or correct a value.
  const [detailed, setDetailed] = useState(false);
  // Every insurer's usage, when the ones a label cut short may be are not enough.
  const [allInsurerUsages, setAllInsurerUsages] = useState(false);
  const p = scan.proposed;
  const pending = scan.status === 'PENDING';
  const selectedSeries = allSeries.find((s) => s.id === values.seriesId);
  const provisional = Boolean(selectedSeries?.model.provisional);
  const insurerId = selectedSeries?.insurer.id;

  const params = new URLSearchParams();
  if (values.customer.identityNumber) params.set('identityNumber', values.customer.identityNumber);
  if (values.vehicle.registration) params.set('registration', values.vehicle.registration);
  // The same chassis under another plate: a registration change.
  if (values.vehicle.vin) params.set('vin', values.vehicle.vin);
  if (values.policyNumber) params.set('policyNumber', values.policyNumber);
  // « REMPLACEMENT DE POLICE N … »: the contract of the replaced policy, when the agency follows it.
  if (p.replacesPolicy) params.set('replacesPolicy', p.replacesPolicy);
  if (values.seriesId) params.set('seriesId', values.seriesId);
  if (values.number) params.set('number', values.number);
  const matches = useApiQuery(pending ? `/scans/${scan.id}/matches?${params}` : null);
  const found = matches.state.status === 'done' ? matches.state.data : {};
  // The insurer's products, those that fit the sheet first, and the one to propose.
  const products = useApiQuery(
    values.seriesId ? `/scans/${scan.id}/products?seriesId=${values.seriesId}` : null,
  );
  const [productTouched, setProductTouched] = useState(false);

  // What a previous filing already recorded is used again, never created twice.
  const done = scan.progress;
  // The scanned period starts where the contract found ends: it is its next year. A new policy
  // that replaces the one found is its next contract too, whatever the dates.
  const nextPeriod =
    Boolean(found.contract) &&
    (Boolean(found.contract.replacedPolicy) ||
      (Boolean(values.contract.startDate) && values.contract.startDate >= found.contract.endDate));
  const mode = (kind) => {
    if (done[`${kind}Id`]) return 'done';
    if (modes[kind]) return modes[kind];
    if (!found[kind]) return 'new';
    return kind === 'contract' && nextPeriod ? 'renew' : 'existing';
  };
  const existingId = (kind) => chosen[kind] ?? found[kind]?.id;
  // Proposed for a new contract until the employee chooses (a renewal keeps last year's).
  const suggestion =
    products.state.status === 'done' && mode('contract') === 'new'
      ? products.state.data.suggestion
      : null;
  const productId = productTouched ? values.contract.productId : (suggestion?.productId ?? '');
  // The vehicle already recorded (found by its plate or chassis, or created by an earlier try).
  const knownVehicle =
    found.vehicle && (!done.vehicleId || found.vehicle.id === done.vehicleId)
      ? found.vehicle
      : null;
  const avenant = values.amendment;
  const avenantOn = avenant.on;
  // The contract's vehicles an avenant may replace or renumber (the contract already recorded).
  const amendable =
    avenantOn && mode('contract') === 'existing' && found.contract
      ? (found.contract.vehicles ?? []).filter((v) => v.id !== knownVehicle?.id)
      : [];
  // A registration change keeps the vehicle: the one of the contract, under its new plate.
  const renumbering = avenantOn && avenant.kind === 'REGISTRATION_CHANGE';
  const previousVehicleId =
    avenant.previousVehicleId ||
    (renumbering ? (found.contract?.vehicles?.[0]?.id ?? '') : (amendable[0]?.id ?? ''));
  const onExistingContract = mode('contract') === 'existing' && Boolean(found.contract);
  // A plate changes on a vehicle the app already covers: the contract must be recorded.
  const renumberBlocked = renumbering && !onExistingContract;
  // Shown when the PDF says it is an avenant, or when the scan falls inside a contract recorded.
  const avenantPossible = Boolean(p.amendmentKind) || onExistingContract;
  const vehicleUsageId = usageFix ?? knownVehicle?.usageId ?? '';
  // A usage cut short on the sheet: only the insurer's usages it may be, unless all are asked for.
  const insurerUsageChoices =
    p.insurerUsageChoices?.length > 1 && !allInsurerUsages ? p.insurerUsageChoices : null;
  // The insurer's own usages are those of the series' insurer (RMA's list; none for CAT yet).
  const seriesInsurerUsages = insurerUsages.filter((u) => !insurerId || u.insurer.id === insurerId);
  // The insurer's usage printed on the sheet, given to a vehicle already recorded when it belongs
  // to the vehicle's usage.
  const printedInsurerUsage = insurerUsages.find((u) => u.id === p.insurerUsageId);
  const insurerUsageFix =
    knownVehicle &&
    printedInsurerUsage &&
    printedInsurerUsage.id !== knownVehicle.insurerUsageId &&
    insurerUsageFits(
      printedInsurerUsage,
      asUsage(allUsages.find((u) => u.id === vehicleUsageId)),
      knownVehicle.fuel,
    )
      ? printedInsurerUsage.id
      : null;
  const vehicleUsageModel = allUsages.find((u) => u.id === vehicleUsageId)?.model?.code;
  const usageMismatch =
    Boolean(knownVehicle) &&
    Boolean(selectedSeries) &&
    !selectedSeries.model.provisional &&
    vehicleUsageModel !== selectedSeries.model.code;

  // Everything is already known: the short confirmation is enough (owner, 24/10/2026: an easy
  // app). Any doubt (a number to check, another usage, a missing record) opens the full form.
  const quick =
    pending &&
    !detailed &&
    matches.state.status === 'done' &&
    Boolean(selectedSeries && values.number && values.validFrom && values.validTo) &&
    !p.numberToCheck &&
    !found.attestation &&
    ['existing', 'done'].includes(mode('customer')) &&
    ['existing', 'done'].includes(mode('vehicle')) &&
    ['existing', 'renew', 'done'].includes(mode('contract')) &&
    Boolean(knownVehicle) &&
    !usageMismatch &&
    // An avenant changes the contract's vehicles: always checked on the full form.
    !avenantOn &&
    (provisional || Boolean(values.policyNumber));

  const set = (path) => (event) => {
    const value = event.target.value;
    const [group, key] = path.split('.');
    setValues((v) =>
      key ? { ...v, [group]: { ...v[group], [key]: value } } : { ...v, [group]: value },
    );
    setFieldErrors(({ [path]: _cleared, [`${group}.create.${key}`]: _server, ...rest }) => rest);
  };
  // Read exactly from the insurer's PDF: what is still as read is marked, so the eye goes to the rest.
  const exact = p.source === 'PLATFORM_PDF';
  const field = (path, label, props = {}) => {
    const [group, key] = path.split('.');
    const value = key ? values[group][key] : values[group];
    const read = key ? initial[group]?.[key] : initial[group];
    const errorKey = key ? `${group}.create.${key}` : path;
    const asRead = exact && pending && value !== '' && value === read;
    return (
      <div className="relative">
        <TextField
          label={label}
          value={value}
          onChange={set(path)}
          error={fieldErrors[errorKey] ?? fieldErrors[path] ?? fieldErrors[key]}
          disabled={!pending}
          {...props}
        />
        {asRead && (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-success-ink"
          >
            <CheckIcon className="size-3.5" />
            {t.readOnSheet}
          </span>
        )}
      </div>
    );
  };

  function printed() {
    const fields = {
      seriesCode: selectedSeries?.code,
      number: values.number,
      usage: p.usage,
      holderName: p.holderName,
      holderIdNumber: values.customer.identityNumber,
      holderAddress: values.customer.addressLine,
      policyNumber: values.policyNumber,
      intermediary: p.intermediary,
      registration: values.vehicle.registration,
      makeAndType: [values.vehicle.make, values.vehicle.model].filter(Boolean).join(' '),
      bodyType: p.bodyType,
      validFrom: values.validFrom,
      validTo: values.validTo,
    };
    return Object.fromEntries(Object.entries(fields).filter(([, v]) => v && String(v).trim()));
  }

  function body(confirmNotDuplicate = notDuplicate) {
    const c = values.customer;
    const customer =
      mode('customer') === 'new'
        ? {
            create: {
              type: c.type,
              ...(c.type === 'INDIVIDUAL'
                ? { firstName: c.firstName, lastName: c.lastName }
                : { legalName: c.legalName }),
              ...(c.identityNumber
                ? { identityType: c.identityType, identityNumber: c.identityNumber }
                : {}),
              ...(c.addressLine ? { addressLine: c.addressLine } : {}),
              ...(c.city ? { city: c.city } : {}),
              ...(confirmNotDuplicate ? { confirmNotDuplicate: true } : {}),
            },
          }
        : { id: done.customerId ?? existingId('customer') };
    const v = values.vehicle;
    const vehicle =
      renumbering && !done.vehicleId
        ? { id: previousVehicleId }
        : mode('vehicle') === 'new'
          ? {
              create: {
                registration: v.registration,
                category: v.category,
                make: v.make,
                ...(v.model.trim() ? { model: v.model } : {}),
                ...(v.usageId ? { usageId: v.usageId } : {}),
                ...(v.insurerUsageId ? { insurerUsageId: v.insurerUsageId } : {}),
                ...(v.vin ? { vin: v.vin } : {}),
                ...(v.fiscalPowerCv ? { fiscalPowerCv: v.fiscalPowerCv } : {}),
                ...(v.engineCc ? { engineCc: v.engineCc } : {}),
                ...(v.seats ? { seats: v.seats } : {}),
                ...(v.fuel ? { fuel: v.fuel } : {}),
                ...(v.firstRegistrationDate
                  ? { firstRegistrationDate: v.firstRegistrationDate }
                  : {}),
              },
            }
          : {
              id: done.vehicleId ?? existingId('vehicle'),
              ...(usageFix && usageFix !== knownVehicle?.usageId ? { usageId: usageFix } : {}),
              ...(insurerUsageFix ? { insurerUsageId: insurerUsageFix } : {}),
            };
    const k = values.contract;
    const contract =
      mode('contract') === 'renew'
        ? {
            renew: {
              id: found.contract.id,
              ...(productId ? { productId } : {}),
              startDate: k.startDate,
              endDate: k.endDate,
              ...(k.premiumTotal ? { premiumTotal: k.premiumTotal } : {}),
            },
          }
        : mode('contract') === 'new'
          ? {
              create: {
                productId,
                startDate: k.startDate,
                endDate: k.endDate,
                ...(k.premiumTotal ? { premiumTotal: k.premiumTotal } : {}),
              },
            }
          : { id: done.contractId ?? existingId('contract') };
    return {
      version: scan.version,
      seriesId: values.seriesId,
      number: values.number,
      validFrom: values.validFrom,
      validTo: values.validTo,
      ...(values.policyNumber ? { policyNumber: values.policyNumber } : {}),
      ...(values.coverNoteRef ? { coverNoteRef: values.coverNoteRef } : {}),
      ...(values.quittanceNumber ? { quittanceNumber: values.quittanceNumber } : {}),
      customer,
      vehicle,
      contract,
      ...(avenantOn
        ? {
            amendment: {
              kind: avenant.kind,
              ...(avenant.number ? { number: avenant.number } : {}),
              effectiveDate: avenant.effectiveDate,
              ...(avenant.amount ? { amount: avenant.amount } : {}),
              ...(!renumbering && previousVehicleId && mode('contract') === 'existing'
                ? { previousVehicleId }
                : {}),
              ...(renumbering ? { registration: values.vehicle.registration } : {}),
            },
          }
        : {}),
      printed: printed(),
    };
  }

  async function file(event, confirmNotDuplicate = notDuplicate) {
    event?.preventDefault();
    // A new vehicle needs these (the model is optional: the platform PDF prints the make alone,
    // "TATA -"). Said on the fields themselves: the server would refuse the whole vehicle without
    // naming one.
    if (mode('vehicle') === 'new' && !(renumbering && !done.vehicleId)) {
      const missing = ['registration', 'category', 'make'].filter(
        (key) => !String(values.vehicle[key] ?? '').trim(),
      );
      if (missing.length) {
        setFieldErrors(
          Object.fromEntries(missing.map((key) => [`vehicle.create.${key}`, fr.common.required])),
        );
        setError({ code: 'VALIDATION_ERROR' });
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost(`/scans/${scan.id}/file`, body(confirmNotDuplicate));
      navigate(`/contrats/${result.contractId}`);
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [d.path, RULES[d.rule] ?? RULES.invalid_format]),
          ),
        );
      }
      // What was recorded before the error is kept on the scan: show it.
      reload({ silent: true });
      setBusy(false);
    }
  }

  async function discard(reason) {
    setBusy(true);
    try {
      await apiPost(`/scans/${scan.id}/discard`, { reason, version: scan.version });
      navigate('/scans');
    } catch (err) {
      setError(err);
      setBusy(false);
      setDiscarding(false);
    }
  }

  const fileUrl = `/api/scans/${scan.id}/file`;
  const candidates = error?.code === 'DUPLICATE_SUSPECTED' ? (error.details?.candidates ?? []) : [];
  const seriesOptions = [
    { value: '', label: t.chooseSeries },
    ...allSeries.map((s) => ({
      value: s.id,
      label: `${s.insurer.code} ${s.code} · ${s.model.label}`,
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/scans', label: t.back }}
        title={t.review}
        description={pending ? t.reviewIntro : undefined}
        meta={
          <p className="break-all text-sm text-ink-muted">
            {scan.originalName}
            {scan.read ? ` · ${t.confidence(scan.confidence)}` : ` · ${t.notRead}`}
          </p>
        }
      />
      {(p.source === 'PLATFORM_PDF' ||
        scan.status !== 'PENDING' ||
        error ||
        candidates.length > 0 ||
        (pending && provisional && knownVehicle?.provisionalsInARow >= PROVISIONALS_IN_A_ROW) ||
        (pending && Object.values(done).some(Boolean))) && (
        <div className="space-y-3">
          {p.source === 'PLATFORM_PDF' && (
            <p className="flex items-start gap-1.5 text-sm font-medium text-success-ink">
              <CheckCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              {t.fromPlatform}
            </p>
          )}
          {p.source === 'PLATFORM_PDF' && p.provisional && pending && (
            <Alert tone="info">{t.provisionalNumber}</Alert>
          )}
          {pending && provisional && knownVehicle?.provisionalsInARow >= PROVISIONALS_IN_A_ROW && (
            <Alert tone="warning">{t.manyProvisionals(knownVehicle.provisionalsInARow)}</Alert>
          )}
          {scan.status === 'DISCARDED' && (
            <Alert tone="info">{t.discarded(scan.closed.reason)}</Alert>
          )}
          {scan.status === 'FILED' && (
            <Alert tone="success">
              {t.filed}{' '}
              <TextLink to={`/contrats/${done.contractId}`} className="underline">
                {t.openContract}
              </TextLink>
            </Alert>
          )}
          {error && <Alert>{errorMessage(error)}</Alert>}
          {candidates.length > 0 && (
            <div className="space-y-2 rounded-card border border-warning/30 bg-warning-soft px-3.5 py-3 text-sm">
              <p className="font-medium text-warning-ink">{t.duplicate}</p>
              <div className="flex flex-wrap gap-2">
                {candidates.map((candidate) => (
                  <Button
                    key={candidate.id}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setModes((m) => ({ ...m, customer: 'existing' }));
                      setChosen((c) => ({ ...c, customer: candidate.id }));
                      setError(null);
                    }}
                  >
                    {t.useCandidate(`${candidate.ref} ${candidate.displayName ?? ''}`.trim())}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setNotDuplicate(true);
                    file(null, true);
                  }}
                >
                  {fr.customers.notDuplicate}
                </Button>
              </div>
            </div>
          )}
          {pending && Object.values(done).some(Boolean) && <Alert tone="info">{t.progress}</Alert>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ScanPreview
          url={fileUrl}
          mimeType={scan.mimeType}
          name={scan.originalName}
          openLabel={t.open}
          tall
        />

        {quick ? (
          <section
            aria-labelledby="quick-heading"
            className="order-first space-y-5 self-start rounded-card border border-success/30 bg-surface p-5 shadow-raised lg:order-none"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft">
                <CheckIcon aria-hidden="true" className="size-5 text-success" />
              </span>
              <div>
                <h2 id="quick-heading" className="text-section text-ink">
                  {t.quickTitle}
                </h2>
                <p className="text-sm text-ink-muted">{t.quickIntro}</p>
              </div>
            </div>
            <dl className="divide-y divide-line rounded-control border border-line text-sm">
              <QuickLine label={t.customer} value={found.customer?.displayName} />
              <QuickLine
                label={t.vehicle}
                value={`${knownVehicle.registration} · ${knownVehicle.makeAndModel}`}
              />
              <QuickLine
                label={t.attestation}
                value={
                  <>
                    {t.quickAttestation(selectedSeries.code, values.number)}
                    <span className="block font-normal text-ink-muted">
                      {t.quickPeriod(formatDate(values.validFrom), formatDate(values.validTo))}
                    </span>
                  </>
                }
              />
              <QuickLine
                label={t.contract}
                value={
                  found.contract
                    ? mode('contract') === 'renew'
                      ? found.contract.replacedPolicy
                        ? t.quickReplacement(found.contract.ref)
                        : t.quickRenewal(found.contract.ref)
                      : t.quickContract(found.contract.ref)
                    : t.progress
                }
              />
              {values.policyNumber && (
                <QuickLine label={t.policyNumber} value={values.policyNumber} />
              )}
              {/* The premium is recorded with a renewal (a new contract), not on an existing one. */}
              {mode('contract') === 'renew' && values.contract.premiumTotal && (
                <QuickLine
                  label={t.quickPremium}
                  value={formatMoney(values.contract.premiumTotal)}
                />
              )}
            </dl>
            <div className="flex flex-wrap-reverse items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setDetailed(true)}
                className={`${textLinkClasses} text-sm`}
              >
                {t.showDetails}
              </button>
              <Button size="lg" loading={busy} onClick={() => file()}>
                {busy ? t.filing : t.save}
              </Button>
            </div>
          </section>
        ) : (
          <form onSubmit={file} className="space-y-6" noValidate>
            <Part title={t.attestation}>
              {p.seriesUnknown && <Alert>{t.seriesUnknown(p.seriesCode)}</Alert>}
              {found.attestation && <Alert>{t.alreadyRecorded(found.attestation.ref)}</Alert>}
              <SelectField
                label={t.series}
                value={values.seriesId}
                onChange={set('seriesId')}
                options={seriesOptions}
                error={fieldErrors.seriesId}
                disabled={!pending}
              />
              {field('number', t.number, { inputMode: 'numeric', maxLength: 20 })}
              {p.numberToCheck && (
                <div className="space-y-2 rounded-control bg-warning-soft px-3 py-2.5 text-sm">
                  <p className="text-warning-ink">{t.numberToCheck}</p>
                  <div className="flex flex-wrap gap-2">
                    {p.numberCandidates.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={!pending}
                        aria-pressed={values.number === n}
                        onClick={() => set('number')({ target: { value: n } })}
                        className={`focus-ring rounded-control border px-2.5 py-1 font-mono ${values.number === n ? 'border-primary bg-primary-soft text-ink ring-1 ring-primary' : 'border-line-strong/60 bg-surface text-ink-soft hover:bg-canvas'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {p.numberFromStock && <p className="text-xs text-ink-muted">{t.numberFromStock}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {field('validFrom', t.validFrom, { type: 'date' })}
                {field('validTo', t.validTo, { type: 'date' })}
              </div>
              {field('policyNumber', t.policyNumber, { hint: t.policyHint, maxLength: 40 })}
              {provisional && field('coverNoteRef', t.coverNoteRef, { maxLength: 60 })}
              {(p.quittanceNumber || values.quittanceNumber) &&
                field('quittanceNumber', t.quittanceNumber, {
                  inputMode: 'numeric',
                  maxLength: 30,
                })}
              {p.premiumTotal && (
                <p className="rounded-control bg-sunken px-3 py-2 text-sm tabular-nums text-ink-soft">
                  {t.premiums(
                    formatMoney(p.premiumNet),
                    formatMoney(p.taxes),
                    formatMoney(p.cnpac),
                    formatMoney(p.premiumTotal),
                    // CAT's « taxe parafiscale FSEC » (sample of 29/10/2026), when printed.
                    p.fsec ? formatMoney(p.fsec) : null,
                  )}
                </p>
              )}
            </Part>

            <Part title={t.customer}>
              {p.holderName && (
                <p className="text-xs text-ink-muted">{t.printedHolder(p.holderName)}</p>
              )}
              <Choice
                kind="customer"
                mode={mode('customer')}
                existing={found.customer && `${found.customer.ref} · ${found.customer.displayName}`}
                chosenId={chosen.customer}
                onChange={(m) => setModes((s) => ({ ...s, customer: m }))}
                disabled={!pending}
              />
              {mode('customer') === 'new' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label={fr.customers.typeLabel}
                    value={values.customer.type}
                    onChange={set('customer.type')}
                    options={Object.entries(fr.customers.types).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    disabled={!pending}
                  />
                  {values.customer.type === 'INDIVIDUAL' ? (
                    <>
                      {field('customer.lastName', fr.customers.fields.lastName, { maxLength: 80 })}
                      {field('customer.firstName', fr.customers.fields.firstName, {
                        maxLength: 80,
                      })}
                    </>
                  ) : (
                    field('customer.legalName', fr.customers.fields.legalName, { maxLength: 160 })
                  )}
                  <SelectField
                    label={fr.customers.fields.identityType}
                    value={values.customer.identityType}
                    onChange={set('customer.identityType')}
                    options={Object.entries(fr.customers.identityTypes).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    disabled={!pending}
                  />
                  {field('customer.identityNumber', fr.customers.fields.identityNumber, {
                    maxLength: 40,
                  })}
                  {field('customer.addressLine', fr.customers.fields.addressLine, {
                    maxLength: 200,
                  })}
                  {field('customer.city', fr.customers.fields.city, { maxLength: 80 })}
                </div>
              )}
            </Part>

            <Part title={t.vehicle}>
              {renumbering && onExistingContract ? (
                <p className="text-sm text-ink-soft">{t.avenant.renumbered}</p>
              ) : (
                <>
                  {selectedSeries &&
                    !provisional &&
                    !allUsages.some((u) => u.model?.code === selectedSeries.model.code) && (
                      <Alert>{t.noUsageForModel(selectedSeries.model.code)}</Alert>
                    )}
                  <Choice
                    kind="vehicle"
                    mode={mode('vehicle')}
                    existing={
                      found.vehicle &&
                      `${found.vehicle.registration} · ${found.vehicle.makeAndModel}`
                    }
                    onChange={(m) => setModes((s) => ({ ...s, vehicle: m }))}
                    disabled={!pending}
                  />
                  {knownVehicle && ['existing', 'done'].includes(mode('vehicle')) && (
                    <>
                      <SelectField
                        label={t.vehicleUsage}
                        value={vehicleUsageId}
                        onChange={(event) => setUsageFix(event.target.value)}
                        options={[
                          { value: '', label: t.chooseUsage },
                          ...allUsages.map((u) => ({ value: u.id, label: u.label })),
                        ]}
                        error={fieldErrors.seriesId ?? fieldErrors.vehicleId}
                        disabled={!pending}
                      />
                      {usageMismatch && (
                        <p className="text-sm text-warning-ink">
                          {t.usageMismatch(selectedSeries.model.code)}
                        </p>
                      )}
                    </>
                  )}
                  {mode('vehicle') === 'existing' &&
                    found.vehicle &&
                    found.customer &&
                    found.vehicle.owner.id !== found.customer.id && (
                      <p className="text-xs text-warning-ink">
                        {t.otherOwner(found.vehicle.owner.displayName)}
                      </p>
                    )}
                  {mode('vehicle') === 'new' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field('vehicle.registration', fr.vehicles.fields.registration, {
                        maxLength: 20,
                      })}
                      <SelectField
                        label={fr.vehicles.categoryLabel}
                        value={values.vehicle.category}
                        onChange={set('vehicle.category')}
                        options={[
                          { value: '', label: t.chooseCategory },
                          ...Object.entries(fr.vehicles.categories).map(([value, label]) => ({
                            value,
                            label,
                          })),
                        ]}
                        error={fieldErrors['vehicle.create.category']}
                        disabled={!pending}
                      />
                      {field('vehicle.make', fr.vehicles.fields.make, { maxLength: 40 })}
                      {field('vehicle.model', fr.vehicles.fields.model, { maxLength: 60 })}
                      {field('vehicle.vin', fr.vehicles.fields.vin, { maxLength: 30 })}
                      {field('vehicle.fiscalPowerCv', fr.vehicles.fields.fiscalPowerCv, {
                        inputMode: 'numeric',
                        maxLength: 3,
                      })}
                      {field('vehicle.engineCc', fr.vehicles.fields.engineCc, {
                        inputMode: 'numeric',
                        maxLength: 5,
                      })}
                      {field('vehicle.seats', fr.vehicles.fields.seats, {
                        inputMode: 'numeric',
                        maxLength: 3,
                      })}
                      <SelectField
                        label={fr.vehicles.fields.fuel}
                        value={values.vehicle.fuel}
                        onChange={set('vehicle.fuel')}
                        options={[
                          { value: '', label: t.chooseFuel },
                          ...Object.entries(fr.vehicles.fuels).map(([value, label]) => ({
                            value,
                            label,
                          })),
                        ]}
                        disabled={!pending}
                      />
                      {field(
                        'vehicle.firstRegistrationDate',
                        fr.vehicles.fields.firstRegistrationDate,
                        {
                          type: 'date',
                        },
                      )}
                      {seriesInsurerUsages.length > 0 && (
                        <SelectField
                          label={fr.vehicles.fields.insurerUsageId}
                          value={values.vehicle.insurerUsageId}
                          onChange={(event) => {
                            const picked = insurerUsages.find((u) => u.id === event.target.value);
                            // The insurer's usage decides the usage of the attestation.
                            setValues((v) => ({
                              ...v,
                              vehicle: {
                                ...v.vehicle,
                                insurerUsageId: event.target.value,
                                ...(picked
                                  ? {
                                      usageId: legalUsageFor(
                                        picked,
                                        asUsage(allUsages.find((u) => u.id === v.vehicle.usageId)),
                                        v.vehicle.fuel,
                                      ),
                                    }
                                  : {}),
                              },
                            }));
                          }}
                          options={[
                            { value: '', label: fr.vehicles.notSpecified },
                            ...insurerUsageOptions(
                              seriesInsurerUsages,
                              allUsages.map((u) => ({ value: u.id })),
                              values.vehicle.insurerUsageId,
                              insurerUsageChoices,
                            ),
                          ]}
                          hint={
                            insurerUsageChoices
                              ? t.insurerUsageChoices(p.usage, insurerUsageChoices.length)
                              : undefined
                          }
                          error={fieldErrors['vehicle.create.insurerUsageId']}
                          disabled={!pending}
                        />
                      )}
                      {p.insurerUsageChoices?.length > 1 && pending && (
                        <div className="-mt-2 sm:col-span-2">
                          <button
                            type="button"
                            className={`${textLinkClasses} text-sm`}
                            onClick={() => setAllInsurerUsages((all) => !all)}
                          >
                            {allInsurerUsages ? t.fewerInsurerUsages : t.allInsurerUsages}
                          </button>
                        </div>
                      )}
                      <SelectField
                        // The legal usage's label is long (« Transport public de voyageurs »).
                        className="sm:col-span-2"
                        label={fr.capture.fields.usage}
                        value={values.vehicle.usageId}
                        onChange={(event) => {
                          const kept = insurerUsages.find(
                            (u) => u.id === values.vehicle.insurerUsageId,
                          );
                          const next = allUsages.find((u) => u.id === event.target.value);
                          // Another usage: the insurer's usage chosen before may no longer fit it.
                          setValues((v) => ({
                            ...v,
                            vehicle: {
                              ...v.vehicle,
                              usageId: event.target.value,
                              ...(kept && !insurerUsageFits(kept, asUsage(next), v.vehicle.fuel)
                                ? { insurerUsageId: '' }
                                : {}),
                            },
                          }));
                          setFieldErrors(({ 'vehicle.create.usageId': _cleared, ...rest }) => rest);
                        }}
                        options={[
                          { value: '', label: t.chooseUsage },
                          ...allUsages.map((u) => ({ value: u.id, label: u.label })),
                        ]}
                        error={fieldErrors['vehicle.create.usageId'] ?? fieldErrors.vehicleId}
                        disabled={!pending}
                      />
                    </div>
                  )}
                </>
              )}
            </Part>

            {avenantPossible && (
              <Part title={t.avenant.title}>
                {p.amendmentKind && (
                  <p className="text-sm text-ink-soft">
                    {t.avenant.found(p.amendmentLabel ?? t.avenant.title, p.amendmentNumber)}
                  </p>
                )}
                <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={avenantOn}
                    disabled={!pending}
                    onChange={(event) =>
                      setValues((v) => ({
                        ...v,
                        amendment: { ...v.amendment, on: event.target.checked },
                      }))
                    }
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  {t.avenant.isAvenant}
                </label>
                {avenantOn && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label={t.avenant.kind}
                      value={avenant.kind}
                      onChange={set('amendment.kind')}
                      error={fieldErrors['amendment.kind']}
                      disabled={!pending}
                      options={[
                        { value: '', label: t.avenant.chooseKind },
                        ...Object.entries(fr.contracts.amendments.kinds).map(([value, label]) => ({
                          value,
                          label,
                        })),
                      ]}
                    />
                    {field('amendment.number', fr.contracts.amendments.number, {
                      inputMode: 'numeric',
                      maxLength: 20,
                    })}
                    {field('amendment.effectiveDate', fr.contracts.amendments.effectiveDate, {
                      type: 'date',
                    })}
                    {field('amendment.amount', fr.contracts.amendments.amount, {
                      inputMode: 'decimal',
                      maxLength: 20,
                      hint: t.avenant.amountHint,
                    })}
                    {renumberBlocked && (
                      <div className="sm:col-span-2">
                        <Alert>{t.avenant.renumberNeedsContract}</Alert>
                      </div>
                    )}
                    {avenant.kind && !renumberBlocked && (
                      <div className="sm:col-span-2">
                        {onExistingContract ? (
                          <SelectField
                            label={t.avenant.previousVehicle[avenant.kind]}
                            value={previousVehicleId}
                            onChange={set('amendment.previousVehicleId')}
                            error={fieldErrors.previousVehicleId ?? fieldErrors.vehicleId}
                            hint={
                              renumbering
                                ? t.avenant.registrationHint(values.vehicle.registration)
                                : fr.contracts.amendments.hints.replaced
                            }
                            disabled={!pending}
                            options={(renumbering
                              ? (found.contract.vehicles ?? [])
                              : amendable
                            ).map((v) => ({
                              value: v.id,
                              label: `${v.registration} · ${[v.make, v.model].filter(Boolean).join(' ')}`,
                            }))}
                          />
                        ) : (
                          <p className="text-sm text-ink-soft">
                            {t.avenant.previousVehicle[avenant.kind]} : {t.avenant.notRecorded}.{' '}
                            {t.avenant.newContractHint}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Part>
            )}

            <Part title={t.contract}>
              <Choice
                kind="contract"
                mode={mode('contract')}
                existing={
                  found.contract &&
                  `${found.contract.ref} · ${formatDate(found.contract.startDate)} – ${formatDate(found.contract.endDate)}`
                }
                renew={
                  nextPeriod && found.contract
                    ? found.contract.replacedPolicy
                      ? t.replacementOf(found.contract.ref, found.contract.policyNumber)
                      : t.renewOf(found.contract.ref)
                    : null
                }
                onChange={(m) => setModes((s) => ({ ...s, contract: m }))}
                disabled={!pending}
              />
              {['new', 'renew'].includes(mode('contract')) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label={t.product}
                    value={productId}
                    onChange={(event) => {
                      setProductTouched(true);
                      set('contract.productId')(event);
                    }}
                    hint={
                      !productTouched && suggestion ? t.productSuggested[suggestion.reason] : null
                    }
                    options={[
                      {
                        value: '',
                        label: mode('contract') === 'renew' ? t.sameProduct : t.chooseProduct,
                      },
                      ...productOptions(products.state),
                    ]}
                    error={fieldErrors['contract.create.productId'] ?? fieldErrors.productId}
                    disabled={!pending || !insurerId}
                  />
                  {!avenantOn &&
                    field('contract.premiumTotal', t.premium, {
                      inputMode: 'decimal',
                      maxLength: 20,
                    })}
                  {field('contract.startDate', fr.contracts.fields.startDate, { type: 'date' })}
                  {field('contract.endDate', fr.contracts.fields.endDate, { type: 'date' })}
                </div>
              )}
            </Part>

            {pending && (
              <FormActions hint={<span className="hidden sm:inline">{t.checkThenSave}</span>}>
                <Button variant="secondary" disabled={busy} onClick={() => setDiscarding(true)}>
                  {t.discard}
                </Button>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={
                    !values.seriesId ||
                    !values.number ||
                    (avenantOn && (!avenant.kind || renumberBlocked))
                  }
                >
                  {busy ? t.filing : t.save}
                </Button>
              </FormActions>
            )}
          </form>
        )}
      </div>
      {discarding && (
        <ReasonDialog
          title={t.discard}
          intro={t.discardIntro}
          confirmLabel={t.discard}
          busy={busy}
          error={null}
          onCancel={() => setDiscarding(false)}
          onConfirm={discard}
        />
      )}
    </div>
  );
}

function QuickLine({ label, value }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3.5 py-2.5">
      <dt className="w-28 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words font-medium text-ink">{value}</dd>
    </div>
  );
}

/** A part of the form: a titled card (a region named by its title). */
function Part({ title, children }) {
  return (
    <Card title={title}>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

const TILE =
  'flex cursor-pointer items-center gap-3 rounded-control border border-line-strong/50 px-3.5 py-3 text-sm text-ink hover:bg-sunken/60 has-checked:border-primary has-checked:bg-primary-soft has-checked:ring-1 has-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-not-allowed has-disabled:opacity-70';

/** Existing record found by the scan's values, or a new one; "done" once a filing created it. */
function Choice({ kind, mode, existing, chosenId, renew, onChange, disabled }) {
  if (mode === 'done') {
    return (
      <p className="flex items-start gap-2 text-sm text-ink-soft">
        <CheckCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
        {t.progress}
      </p>
    );
  }
  if (!existing && !chosenId) return null;
  const options = [
    ['existing', t.useExisting(existing ?? chosenId)],
    ...(renew ? [['renew', renew]] : []),
    ['new', t.createNew],
  ];
  return (
    <fieldset>
      <legend className="sr-only">{t[kind]}</legend>
      <div className="grid gap-2">
        {options.map(([value, label]) => (
          <label key={value} className={TILE}>
            <input
              type="radio"
              name={`${kind}-mode`}
              checked={mode === value}
              onChange={() => onChange(value)}
              disabled={disabled}
              className="size-4 shrink-0 accent-primary focus:outline-none"
            />
            <span className="min-w-0 break-words">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
