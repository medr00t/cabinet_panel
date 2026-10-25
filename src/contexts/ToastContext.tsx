import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type Kind = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; kind: Kind; title: string; message?: string }

interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
let seq = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Kind, title: string, message?: string) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, kind, title, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (t, m) => push('success', t, m),
    error: (t, m) => push('error', t, m),
    warning: (t, m) => push('warning', t, m),
    info: (t, m) => push('info', t, m),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(({ id, kind, title, message }) => {
          const Icon = icons[kind];
          return (
            <div key={id} className={`toast toast-${kind}`}>
              <Icon />
              <div><div className="t">{title}</div>{message && <div className="m">{message}</div>}</div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
