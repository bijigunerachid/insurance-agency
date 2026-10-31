import { useCallback, useState } from 'react';

/** Runs an async form action, tracking "submitting" and the last error. */
export function useSubmit(action) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = useCallback(
    async (...args) => {
      setSubmitting(true);
      setError(null);
      try {
        return await action(...args);
      } catch (err) {
        setError(err);
        return undefined;
      } finally {
        setSubmitting(false);
      }
    },
    [action],
  );

  return { submit, submitting, error, setError };
}
