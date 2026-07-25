import { useQuery } from '@tanstack/react-query'
import { BarChart3, FileCheck2, FileClock, FilePlus2, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock, PublicationLink } from '../components/Common'
import { useAuth } from '../contexts/AuthContext'
import { analyticsApi, profileApi, publicationApi } from '../lib/api'
import { PublicationCard } from '../components/PublicationComponents'
import { getErrorMessage } from '../lib/api'

const pretty = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

export function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'oric_admin'
  const isHod = user?.role === 'hod'

  const analytics = useQuery({
    queryKey: ['dashboard', isAdmin ? 'institution' : 'department'],
    queryFn: isAdmin ? analyticsApi.institution : analyticsApi.department,
    enabled: isAdmin || isHod,
  })

  const profile = useQuery({
    queryKey: ['profileMetrics'],
    queryFn: () => profileApi.metrics('me'),
    enabled: !isAdmin && !isHod,
  })

  const recent = useQuery({
    queryKey: ['my-publications', 'dashboard'],
    queryFn: () => publicationApi.list({ limit: 4, sortBy: 'createdAt', sortOrder: 'desc' }),
    enabled: !isAdmin && !isHod,
  })

  if ((isAdmin || isHod) && analytics.isLoading) return <div className="page-shell"><LoadingBlock label="Loading your dashboard…" /></div>
  if (!isAdmin && !isHod && (profile.isLoading || recent.isLoading)) return <div className="page-shell"><LoadingBlock label="Loading your dashboard…" /></div>

  const dashboard = analytics.data?.data
  const author = profile.data?.data as
    | { metrics?: Record<string, number>; recentPublications?: { _id: string; title: string; year: number; status: string }[]; publicationStats?: { _id: string; count: number }[] }
    | undefined

  const fallbackIcons = [BarChart3, FileCheck2, FileClock, FileCheck2, UsersRound, BarChart3]

  const cards = dashboard
    ? Object.entries(dashboard.overview || {})
        .slice(0, 6)
        .map(([label, value], i) => ({
          label: pretty(label),
          value,
          icon: fallbackIcons[i % fallbackIcons.length],
        }))
    : [
        { label: 'Total citations', value: author?.metrics?.totalCitations || 0, icon: BarChart3 },
        { label: 'h-index', value: author?.metrics?.hIndex || 0, icon: FileCheck2 },
        { label: 'i10-index', value: author?.metrics?.i10Index || 0, icon: FileClock },
        { label: 'Publications', value: (author?.publicationStats || []).reduce((sum, item) => sum + item.count, 0), icon: FileCheck2 },
      ]

  const guidanceSteps = isAdmin
    ? [
        'Review submissions awaiting ORIC verification.',
        'Approve or reject with remarks — both are recorded in the review trail.',
        'Manage departments and user approvals from the sidebar.',
      ]
    : isHod
    ? [
        "Review your department's submissions awaiting your decision.",
        'Approve or reject with remarks.',
        "Track full review history from each publication's detail page.",
      ]
    : [
        'Create and complete a publication draft — title, abstract, venue, pages validated strictly.',
        'Upload a PDF right after saving; it is scanned before it can be submitted.',
        'Track the HOD and ORIC review trail from its detail page.',
      ]

  return (
    <div className="page-shell">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-700">Welcome back, {user?.name.split(' ')[0]}</p>
          <h1 className="page-title">{isAdmin ? 'Institutional overview' : isHod ? 'Department overview' : 'Research dashboard'}</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'A current view of institutional research activity. Publications move through department and ORIC review here; drafts remain private to their authors until submitted.'
              : isHod
              ? 'A current view of institutional research activity. Publications move through department and ORIC review here; drafts remain private to their authors until submitted.'
              : 'Keep track of your research profile and publications.'}
          </p>
        </div>
        {!isAdmin && !isHod && (
          <Link to="/publications/new" className="btn-primary">
            <FilePlus2 className="h-4 w-4" />
            New publication
          </Link>
        )}
      </div>

      {analytics.isError && (
        <div className="mt-5">
          <ErrorBlock message={getErrorMessage(analytics.error) || 'The dashboard could not be loaded.'} />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <section key={label} className="panel panel-pad">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <span className="rounded-lg bg-brand-50 p-2 text-brand-700">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
              {typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : String(value ?? 0)}
            </p>
          </section>
        ))}
      </div>

      {dashboard?.reviewWorkload && (
        <section className="panel mt-6 grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <p className="text-sm font-semibold text-slate-700">Awaiting HOD review</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{dashboard.reviewWorkload.pendingHodReviews}</p>
          </div>
          <div className="p-5">
            <p className="text-sm font-semibold text-slate-700">Awaiting ORIC review</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{dashboard.reviewWorkload.pendingOricReviews}</p>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-slate-900">Recent publications</h2>
              <p className="mt-0.5 text-sm text-slate-500">{isAdmin || isHod ? 'Recently verified publications' : 'Your latest publication activity'}</p>
            </div>
            <Link to="/publications" className="text-sm font-semibold text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="p-4">
            {dashboard?.recentActivity?.length ? (
              <div className="space-y-4">
                {dashboard.recentActivity.slice(0, 5).map((item) => (
                  <PublicationLink key={item._id} id={item._id} title={item.title} />
                ))}
              </div>
            ) : recent.data?.items.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {recent.data.items.map((item) => (
                  <PublicationCard key={item._id} publication={item} />
                ))}
              </div>
            ) : (
              <EmptyBlock title="No publications yet" text="Create a draft to start your publication workflow." />
            )}
          </div>
        </section>

        <section className="panel panel-pad">
          <h2 className="font-serif text-lg font-bold text-slate-900">Quick guidance</h2>
          <ol className="mt-4 space-y-4 text-sm text-slate-600">
            {guidanceSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
