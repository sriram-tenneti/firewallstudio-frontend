import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmVariant = 'danger' }: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
              confirmVariant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}>{confirmLabel}</button>
        </>
      }>
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-amber-100 p-2">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </div>
        <p className="text-sm text-slate-600 pt-1">{message}</p>
      </div>
    </Modal>
  );
}
