import { FormEvent, ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'narrow' | 'default' | 'wide';
  /** When set, body and footer are wrapped in a <form> so Enter submits. */
  onSubmit?: () => void;
}

const Modal = ({ title, subtitle, onClose, children, footer, size = 'default', onSubmit }: ModalProps) => {
  const panel = useRef<HTMLDivElement>(null);
  const downOnOverlay = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // focus the first field so the keyboard works straight away
    (panel.current?.querySelector<HTMLElement>('[data-autofocus]')
      ?? panel.current?.querySelector<HTMLElement>('input:not([type=hidden]):not(:disabled), select, textarea'))?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inner = (
    <>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </>
  );

  return (
    <div
      className="overlay"
      onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnOverlay.current && e.target === e.currentTarget) onClose(); downOnOverlay.current = false; }}
    >
      <div ref={panel} className={`modal ${size === 'wide' ? 'wide' : size === 'narrow' ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fermer"><X /></button>
        </div>
        {onSubmit
          ? <form style={{ display: 'contents' }} onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }} noValidate>{inner}</form>
          : inner}
      </div>
    </div>
  );
};

export default Modal;
