import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { useEffect } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const colors = {
    danger: 'bg-red-700 hover:bg-red-800',
    warning: 'bg-amber-600 hover:bg-amber-700',
    info: 'bg-brand-700 hover:bg-brand-800',
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button aria-label="Close" onClick={onCancel} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
      
      {/* Modal - Center aligned, branded */}
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        <button onClick={onCancel} className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>

        <div className="flex gap-4">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${variant === 'danger' ? 'bg-red-100 text-red-700' : variant === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <h3 className="font-sans text-lg font-bold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
            <p className="mt-2 text-[11px] font-medium tracking-wide text-brand-700 uppercase">CUI ORIC — Secure Action</p>
          </div>
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary" disabled={loading}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={loading} className={`btn ${colors[variant]} text-white min-w-[110px]`}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
