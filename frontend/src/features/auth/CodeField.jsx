import { TextField } from '../../components/TextField.jsx';
import { fr } from '../../i18n/fr.js';

/** Six-digit one-time code input (numeric keypad on phones, OTP autofill). */
export function CodeField({ value, onChange, ...props }) {
  return (
    <TextField
      label={fr.totp.code}
      hint={fr.totp.codeHint}
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      {...props}
    />
  );
}
