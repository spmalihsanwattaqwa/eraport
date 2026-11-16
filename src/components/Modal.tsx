import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  hideCloseButton?: boolean;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-2xl',
  hideCloseButton = false,
}: ModalProps) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#042f24]/55 p-4 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !hideCloseButton) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[90vh] flex flex-col overflow-hidden rounded-xl border border-[#d4af37]/40 bg-[#fdfaf3] shadow-2xl`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[#e6dcc6] bg-[#f7f1e3]/70 px-5 py-4">
          <h3 className="text-base font-bold tracking-tight text-[#042f24]">{title}</h3>
          {!hideCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-[#eee5d3] hover:text-[#042f24]"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-[#e6dcc6] bg-[#f7f1e3]/75 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Konfirmasi',
  variant = 'danger',
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      maxWidthClass="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#064e3b] ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c]'
            }`}
          >
            {busy ? 'Memproses...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-700">{message}</p>
    </Modal>
  );
}
