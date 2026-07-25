import { AlertCircle, ChevronLeft, ChevronRight, FileText, LoaderCircle, SearchX } from 'lucide-react'
import type { PaginationMeta, PublicationStatus } from '../types'
import { Link } from 'react-router-dom'

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) { return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-brand-700" />{label}</div> }
export function ErrorBlock({ message, variant = 'error' }: { message: string; variant?: 'error' | 'warning' | 'info' }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-brand-200 bg-brand-50 text-brand-900',
  }
  return (
    <div className={`rounded-lg border p-4 text-sm shadow-sm ${styles[variant]}`}>
      <div className="flex gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium leading-6">{message}</p>
        </div>
      </div>
    </div>
  )
}
export function SuccessBlock({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <p className="font-medium">{message}</p>
    </div>
  )
}
export function EmptyBlock({ title = 'Nothing to show yet', text }: { title?: string; text?: string }) { return <div className="flex min-h-44 flex-col items-center justify-center px-5 text-center"><SearchX className="mb-3 h-8 w-8 text-slate-300" /><h3 className="text-sm font-semibold text-slate-800">{title}</h3>{text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}</div> }
export function StatusBadge({ status }: { status: PublicationStatus | string }) { const labels: Record<string, string> = { draft: 'Draft', submitted_to_hod: 'Submitted to HOD', hod_rejected: 'Rejected by HOD', sent_to_oric: 'Sent to ORIC', oric_rejected: 'Rejected by ORIC', oric_verified: 'Verified' }; const colors: Record<string, string> = { draft: 'bg-slate-100 text-slate-700', submitted_to_hod: 'bg-amber-100 text-amber-800', hod_rejected: 'bg-red-100 text-red-800', sent_to_oric: 'bg-cui-pale text-cui-blue', oric_rejected: 'bg-red-100 text-red-800', oric_verified: 'bg-emerald-100 text-emerald-800' }; return <span className={`badge ${colors[status] || 'bg-slate-100 text-slate-700'}`}>{labels[status] || status.replaceAll('_', ' ')}</span> }
export function Pagination({ meta, onPageChange }: { meta?: PaginationMeta; onPageChange: (page: number) => void }) { if (!meta || meta.totalPages <= 1) return null; return <nav className="flex items-center justify-between border-t border-slate-200 px-4 py-3" aria-label="Pagination"><p className="text-xs text-slate-500">Showing page {meta.page} of {meta.totalPages} · {meta.total} total</p><div className="flex gap-2"><button className="btn-secondary min-h-9 px-3 py-1.5" disabled={meta.hasPrev === false || meta.page === 1} onClick={() => onPageChange(meta.page - 1)}><ChevronLeft className="h-4 w-4" />Previous</button><button className="btn-secondary min-h-9 px-3 py-1.5" disabled={meta.hasNext === false || meta.page === meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>Next<ChevronRight className="h-4 w-4" /></button></div></nav> }
export function PublicationLink({ id, title }: { id: string; title: string }) { return <Link to={`/publications/${id}`} className="group flex gap-3"><span className="mt-0.5 rounded-md bg-brand-50 p-2 text-brand-700"><FileText className="h-4 w-4" /></span><span className="font-semibold text-slate-900 group-hover:text-brand-700">{title}</span></Link> }
export const displayName = (item: unknown) => {
  try {
    if (typeof item === 'object' && item !== null && 'name' in item) return String((item as { name: string }).name)
    if (typeof item === 'string') return item
    return ''
  } catch {
    return ''
  }
}
export const objectId = (item: unknown) => {
  try {
    if (typeof item === 'object' && item !== null && '_id' in item) return String((item as { _id: string })._id)
    if (typeof item === 'string') return item
    if (typeof item === 'object' && item !== null && 'id' in item) return String((item as { id: string }).id)
    return String((item as any) || '')
  } catch {
    return ''
  }
}
