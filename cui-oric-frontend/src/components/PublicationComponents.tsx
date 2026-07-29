import { CalendarDays, ChevronRight, FileText, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Publication, Review } from '../types'
import { displayName, StatusBadge } from './Common'

function getTitle(pub: any): string {
  return pub?.title || pub?.name || pub?.publicationTitle || pub?.metadata?.title || ''
}
function getVenue(pub: any): string {
  const v = pub?.venue
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.name || v.title || ''
}

export function PublicationCard({ publication, showDepartment = false }: { publication: Publication; showDepartment?: boolean }) {
  const authors = (publication.authors || [])
    .map((author) => author.externalName || displayName(author.authorId))
    .filter(Boolean)
    .join(', ')

  const title = getTitle(publication) || 'Untitled publication'
  const venue = getVenue(publication) || 'Unknown venue'

  return (
    <article className="panel p-4 transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={publication.status || 'draft'} />
        <span className="shrink-0 text-xs font-medium text-slate-500">{publication.citationCount || 0} citations</span>
      </div>
      <Link to={`/publications/${publication._id}`} className="mt-3 block font-sans text-lg font-bold leading-snug text-slate-900 hover:text-brand-700 line-clamp-2" title={title}>
        {title}
      </Link>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
        {publication.abstract ? publication.abstract.slice(0, 160) : `${(publication.publicationType || '').replaceAll('_', ' ')} · ${venue}`}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" />
          {authors || 'Authors not listed'}
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {publication.year || '—'}
        </span>
        {showDepartment && <span className="truncate max-w-[100px]">{displayName(publication.departmentId) || ''}</span>}
      </div>
      <Link className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline" to={`/publications/${publication._id}`}>
        View publication <ChevronRight className="h-4 w-4" />
      </Link>
    </article>
  )
}

export function ReviewTimeline({ reviews }: { reviews?: Review[] }) {
  if (!reviews?.length) return <p className="text-sm text-slate-500">No review activity has been recorded yet.</p>
  return (
    <ol className="relative ml-2 border-l border-slate-200 pl-5">
      {reviews.map((review) => {
        const date = (() => {
          try {
            return new Date(review.reviewedAt).toLocaleString()
          } catch {
            return 'Unknown date'
          }
        })()
        return (
          <li key={review._id} className="relative pb-6 last:pb-0">
            <span
              className={`absolute -left-[1.65rem] top-1 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ring-white ${
                review.decision === 'rejected' ? 'bg-red-500' : review.decision === 'approved' || (review.decision as string) === 'verified' ? 'bg-emerald-500' : 'bg-brand-600'
              }`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold capitalize text-slate-900">{String(review.decision || '').replaceAll('_', ' ')}</span>
              <span className="text-xs text-slate-500">{date}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{review.remarks || 'No remarks'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {displayName(review.reviewedBy) || 'System'} · {String(review.stage || '').replace('_', ' ')}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

export function PublicationStatusPath({ status }: { status: string }) {
  const safeStatus = status || 'draft'
  const steps = [
    { id: 'draft', name: 'Draft' },
    { id: 'submitted_to_hod', name: 'HOD review' },
    { id: 'sent_to_oric', name: 'ORIC review' },
    { id: 'oric_verified', name: 'Verified' },
  ]
  const position: Record<string, number> = { draft: 0, hod_rejected: 1, submitted_to_hod: 1, sent_to_oric: 2, oric_rejected: 2, oric_verified: 3 }
  const current = position[safeStatus] ?? 0

  return (
    <div className="grid grid-cols-4 gap-1">
      {steps.map((step, index) => (
        <div key={step.id} className="min-w-0">
          <div
            className={`h-1.5 rounded-full ${
              index <= current && !safeStatus.includes('rejected')
                ? 'bg-brand-700'
                : index === current && safeStatus.includes('rejected')
                ? 'bg-red-500'
                : 'bg-slate-200'
            }`}
          />
          <span className="mt-2 block text-center text-[11px] font-medium leading-tight text-slate-500">
            {index === current && safeStatus.includes('rejected') ? 'Returned' : step.name}
          </span>
        </div>
      ))}
    </div>
  )
}

export function PdfNotice({ hasPdf }: { hasPdf: boolean }) {
  return (
    <div className={`flex gap-3 rounded-lg border p-3 text-sm ${hasPdf ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <FileText className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{hasPdf ? 'A PDF has been uploaded and is ready for the next review step.' : 'A PDF must be uploaded before this publication can be submitted for review.'}</p>
    </div>
  )
}
