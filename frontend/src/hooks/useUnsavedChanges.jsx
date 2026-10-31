import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { fr } from '../i18n/fr.js';

/**
 * Warns before leaving a form with unsaved changes: in-app navigation shows a dialog,
 * closing or reloading the tab shows the browser's own warning. Render the returned element.
 */
export function useUnsavedChanges(dirty) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (blocker.state !== 'blocked') return null;
  return (
    <ConfirmDialog
      title={fr.customers.unsavedTitle}
      message={fr.customers.unsavedIntro}
      confirmLabel={fr.customers.leave}
      tone="danger"
      onConfirm={() => blocker.proceed()}
      onCancel={() => blocker.reset()}
    />
  );
}
