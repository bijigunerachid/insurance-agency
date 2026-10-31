import { useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { SelectField } from '../../components/SelectField.jsx';
import { TextAreaField } from '../../components/TextAreaField.jsx';
import { TextField } from '../../components/TextField.jsx';
import { errorMessage, fr } from '../../i18n/fr.js';

/**
 * Small create/edit form in a dialog. `fields` = [{ name, label, type: 'text' | 'textarea' |
 * 'select' | 'checkbox', options, hint, maxLength, inputMode, required }]. `onSubmit(values)` saves and
 * throws on error; the server's field errors are shown next to their fields.
 */
export function EntryFormDialog({ title, fields, initial, submitLabel, note, onSubmit, onClose }) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const missing = fields.filter(
    (field) => field.required && field.type !== 'checkbox' && !String(values[field.name]).trim(),
  );

  async function submit() {
    setTouched(true);
    if (missing.length) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err);
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries(
            err.details.map((d) => [
              d.path,
              fr.catalogue.fieldRules[d.rule] ?? fr.common.invalidField,
            ]),
          ),
        );
      }
      setBusy(false);
    }
  }

  const set = (name, value) => {
    setValues({ ...values, [name]: value });
    setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
  };
  const errorOf = (field) =>
    fieldErrors[field.name] ??
    (touched && missing.includes(field) ? fr.common.required : undefined);

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
        noValidate
      >
        {note && <Alert tone="info">{note}</Alert>}
        {error && <Alert>{errorMessage(error)}</Alert>}
        {fields.map((field) => {
          const common = { label: field.label, hint: field.hint };
          if (field.type === 'checkbox') {
            return (
              <label key={field.name} className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300 text-blue-700"
                  checked={values[field.name]}
                  onChange={(event) => set(field.name, event.target.checked)}
                />
                {field.label}
              </label>
            );
          }
          if (field.type === 'select') {
            return (
              <SelectField
                key={field.name}
                {...common}
                value={values[field.name]}
                onChange={(event) => set(field.name, event.target.value)}
                options={field.options}
              />
            );
          }
          const Input = field.type === 'textarea' ? TextAreaField : TextField;
          return (
            <Input
              key={field.name}
              {...common}
              value={values[field.name]}
              maxLength={field.maxLength}
              inputMode={field.inputMode}
              required={field.required}
              error={errorOf(field)}
              autoComplete="off"
              onChange={(event) => set(field.name, event.target.value)}
            />
          );
        })}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {submitLabel ?? fr.common.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Only the fields that changed, plus the version, for a PATCH. */
export function changesOf(values, initial, version) {
  const body = { version };
  for (const [name, value] of Object.entries(values)) {
    if (value !== initial[name]) body[name] = value;
  }
  return body;
}
