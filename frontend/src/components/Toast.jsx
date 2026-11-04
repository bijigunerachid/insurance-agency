import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fr } from '../i18n/fr.js';

const ToastContext = createContext(null);
/** How long a message stays: long enough to read; an error stays until it is closed. */
const DURATION_MS = 6000;

const tones = {
  success: { Icon: CheckCircleIcon, icon: 'text-success' },
  info: { Icon: InformationCircleIcon, icon: 'text-primary' },
  error: { Icon: ExclamationCircleIcon, icon: 'text-danger' },
};

function ToastItem({ toast, close }) {
  const { Icon, icon } = tones[toast.tone];
  useEffect(() => {
    if (toast.tone === 'error') return undefined;
    const timer = setTimeout(() => close(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, close]);
  return (
    <div className="pointer-events-auto flex w-full animate-enter items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink shadow-raised">
      <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${icon}`} />
      <p className="min-w-0 flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => close(toast.id)}
        className="focus-ring -m-1 rounded-control p-1 text-ink-muted hover:bg-sunken hover:text-ink"
      >
        <XMarkIcon aria-hidden="true" className="size-4" />
        <span className="sr-only">{fr.common.dismiss}</span>
      </button>
    </div>
  );
}

/**
 * Short messages after an action (« Paiement enregistré. »), shown over the page without
 * pushing it down. Read by screen readers: politely for success and information, at once for
 * an error. Above the phone's menu bar, at the bottom right on a computer.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const close = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((message, { tone = 'success' } = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  const polite = toasts.filter((t) => t.tone !== 'error');
  const urgent = toasts.filter((t) => t.tone === 'error');
  // Both areas exist before any message, so screen readers announce what is added.
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-[5.5rem] z-50 flex flex-col gap-2 md:inset-x-auto md:bottom-5 md:right-5 md:w-96 print:hidden">
        <div aria-live="assertive" className="flex flex-col gap-2">
          {urgent.map((toast) => (
            <ToastItem key={toast.id} toast={toast} close={close} />
          ))}
        </div>
        <div aria-live="polite" className="flex flex-col gap-2">
          {polite.map((toast) => (
            <ToastItem key={toast.id} toast={toast} close={close} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast.show('Client enregistré.')`. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
