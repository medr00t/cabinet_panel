import { useState } from 'react';
import Modal from './Modal';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

const ConfirmDialog = ({ title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) => {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } catch { /* the caller already reported the error; keep the dialog open */ } finally { setBusy(false); }
  };
  return (
    <Modal
      title={title}
      size="narrow"
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : ''}`} onClick={run} disabled={busy}>{confirmLabel}</button>
      </>}
    >
      <p style={{ color: 'var(--text-2)', paddingBottom: 8 }}>{message}</p>
    </Modal>
  );
};

export default ConfirmDialog;
