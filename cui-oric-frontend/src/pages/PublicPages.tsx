import { useQuery } from '@tanstack/react-query'
import { BookOpenText, ChevronDown, GraduationCap, LoaderCircle, Search, SlidersHorizontal, UsersRound, LogOut, LayoutDashboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, displayName } from '../components/Common'
import { PublicationCard } from '../components/PublicationComponents'
import { useDebounce } from '../hooks/useDebounce'
import { compactQueryParams, departmentApi, getErrorMessage, profileApi, searchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { Publication } from '../types'

const typeText = (value: string) => value.replaceAll('_', ' ')

export function PublicSearchPage() {
  const { user, logout, initializing } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [advanced, setAdvanced] = useState(false)
  const [filters, setFilters] = useState<Record<string, string>>({})
  // Local input state for citation to avoid firing on every keystroke
  const [citationInput, setCitationInput] = useState('')

  const debouncedQuery = useDebounce(query, 400)
  const debouncedFilters = useDebounce(filters, 600)
  const debouncedCitation = useDebounce(citationInput, 600)

  // Merge debounced citation into filters when it stabilizes
  useEffect(() => {
    setFilters((old) => {
      const next = { ...old }
      if (debouncedCitation === '') delete next.citationCount
      else next.citationCount = debouncedCitation
      // Only update if changed to avoid loop
      if (old.citationCount === next.citationCount) return old
      return next
    })
  }, [debouncedCitation])

  const suggestions = useQuery({
    queryKey: ['suggestions', debouncedQuery],
    queryFn: () => searchApi.suggestions(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60 * 5,
  })

  const filterOptions = useQuery({
    queryKey: ['search-filters'],
    queryFn: searchApi.filters,
    staleTime: 1000 * 60 * 10,
  })

  const search = useQuery({
    queryKey: ['public-search', debouncedQuery, debouncedFilters, page, advanced],
    queryFn: () =>
      advanced
        ? searchApi.advanced({
            page,
            limit: 12,
            title: debouncedQuery || undefined,
            yearFrom: debouncedFilters.yearFrom ? Number(debouncedFilters.yearFrom) : undefined,
            yearTo: debouncedFilters.yearTo ? Number(debouncedFilters.yearTo) : undefined,
            citationCountMin: debouncedFilters.citationCount ? Number(debouncedFilters.citationCount) : undefined,
            departmentId: debouncedFilters.departmentId || undefined,
            publicationType: debouncedFilters.publicationType || undefined,
            author: debouncedFilters.author || undefined,
            venue: debouncedFilters.venue || undefined,
            keyword: debouncedFilters.keyword || undefined,
          })
        : searchApi.publications(
            compactQueryParams({
              ...(page > 1 ? { page } : {}),
              q: debouncedQuery,
              year: debouncedFilters.year,
              citationCount: debouncedFilters.citationCount,
              departmentId: debouncedFilters.departmentId,
              researchInterest: debouncedFilters.researchInterest,
              publicationType: debouncedFilters.publicationType,
              sortBy: debouncedFilters.sortBy,
            })
          ),
    // Keep previous data while debouncing to avoid flicker
    placeholderData: (prev) => prev,
  })

  const setFilter = (key: string, value: string) => {
    setPage(1)
    setFilters((old) => {
      const next = { ...old }
      if (!value) delete next[key]
      else next[key] = value
      return next
    })
  }

  const suggestionData = suggestions.data?.data as
    | { titles?: string[]; authors?: string[]; venues?: string[]; keywords?: string[] }
    | undefined

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-800">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Brand />
          <div className="flex items-center gap-2">
            <Link to="/departments" className="text-sm font-semibold text-brand-100 hover:text-white">
              Departments
            </Link>
            {initializing ? (
              <span className="text-xs text-brand-100">Loading…</span>
            ) : user ? (
              <>
                <Link to="/dashboard" className="hidden items-center gap-1.5 text-sm font-semibold text-white hover:text-brand-100 sm:flex">
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Link>
                <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 sm:flex">
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-bold text-brand-800">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate text-sm font-medium text-white">{user.name}</span>
                </div>
                <button
                  onClick={async () => {
                    await logout()
                    navigate('/')
                  }}
                  className="btn-secondary min-h-10 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-secondary min-h-10 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-br from-brand-800 via-brand-700 to-cui-blue px-4 py-12 text-white sm:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-bold tracking-[.14em] text-brand-100">COMSATS UNIVERSITY ISLAMABAD</p>
          <h1 className="mt-4 font-sans text-3xl font-bold leading-tight sm:text-5xl">Research & publications repository</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-brand-100 sm:text-base">
            Discover ORIC-verified research from CUI faculty, MS and PhD scholars.
          </p>
          <div className="relative mx-auto mt-7 max-w-3xl">
            <div className="flex rounded-xl bg-white p-1.5 shadow-xl">
              <Search className="ml-3 mt-2.5 h-5 w-5 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                className="min-h-11 w-full border-0 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-0"
                placeholder="Search titles, abstracts and keywords"
              />
              <button className="btn-primary shrink-0">Search</button>
            </div>
            {suggestions.isFetching && <LoaderCircle className="absolute right-28 top-4 h-4 w-4 animate-spin text-brand-700" />}
            {debouncedQuery.length >= 2 &&
            (suggestionData?.titles?.length || suggestionData?.authors?.length || suggestionData?.venues?.length || suggestionData?.keywords?.length) ? (
              <div className="absolute z-10 mt-2 w-full rounded-xl bg-white p-3 text-left shadow-xl">
                <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Suggestions</p>
                {[...(suggestionData.titles || []), ...(suggestionData.authors || []), ...(suggestionData.venues || []), ...(suggestionData.keywords || [])]
                  .slice(0, 8)
                  .map((item) => (
                    <button
                      key={item}
                      className="block w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-brand-50"
                      onClick={() => {
                        setQuery(item)
                        setPage(1)
                      }}
                    >
                      {item}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="panel h-fit">
            <div className="flex items-center justify-between border-b p-4">
              <div className="flex gap-2">
                <SlidersHorizontal className="h-4 w-4 text-brand-700" />
                <h2 className="font-semibold text-slate-900">Filters</h2>
              </div>
              <button
                onClick={() => {
                  setFilters({})
                  setCitationInput('')
                  setPage(1)
                }}
                className="text-xs font-semibold text-brand-700 hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="label">Department</label>
                <select
                  className="field"
                  value={filters.departmentId || ''}
                  onChange={(e) => setFilter('departmentId', e.target.value)}
                >
                  <option value="">All departments</option>
                  {filterOptions.data?.data.departments.map((department) => (
                    <option key={department._id} value={department._id}>
                      {department.name} ({department.count})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Publication type</label>
                <select
                  className="field"
                  value={filters.publicationType || ''}
                  onChange={(e) => setFilter('publicationType', e.target.value)}
                >
                  <option value="">All types</option>
                  {filterOptions.data?.data.types.map((type) => (
                    <option key={type._id} value={type._id}>
                      {typeText(type._id)} ({type.count})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <select className="field" value={filters.year || ''} onChange={(e) => setFilter('year', e.target.value)}>
                  <option value="">Any year</option>
                  {filterOptions.data?.data.years.map((year) => (
                    <option key={year._id} value={year._id}>
                      {year._id} ({year.count})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Minimum citations</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  placeholder="e.g. 5"
                  value={citationInput}
                  onChange={(e) => {
                    setCitationInput(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <div>
                <label className="label">Research interest</label>
                <select
                  className="field"
                  value={filters.researchInterest || ''}
                  onChange={(e) => setFilter('researchInterest', e.target.value)}
                >
                  <option value="">All interests</option>
                  {filterOptions.data?.data.interests.map((interest) => (
                    <option key={interest.tag} value={interest.tag}>
                      {interest.tag} ({interest.followerCount})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </aside>

          <section>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-sans text-2xl font-bold text-slate-900">Explore research</h2>
                <p className="mt-1 text-sm text-slate-500">Only ORIC-verified publications are available publicly.</p>
              </div>
              <button
                className={`btn-secondary ${advanced ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
                onClick={() => {
                  setAdvanced(!advanced)
                  setPage(1)
                }}
              >
                Advanced search <ChevronDown className={`h-4 w-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {advanced && (
              <div className="panel mt-4 grid gap-3 p-4 sm:grid-cols-2">
                <input
                  className="field"
                  placeholder="Author name"
                  value={filters.author || ''}
                  onChange={(e) => setFilter('author', e.target.value)}
                />
                <input
                  className="field"
                  placeholder="Venue"
                  value={filters.venue || ''}
                  onChange={(e) => setFilter('venue', e.target.value)}
                />
                <input
                  className="field"
                  placeholder="Keyword"
                  value={filters.keyword || ''}
                  onChange={(e) => setFilter('keyword', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="field"
                    type="number"
                    placeholder="Year from"
                    value={filters.yearFrom || ''}
                    onChange={(e) => setFilter('yearFrom', e.target.value)}
                  />
                  <input
                    className="field"
                    type="number"
                    placeholder="Year to"
                    value={filters.yearTo || ''}
                    onChange={(e) => setFilter('yearTo', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="panel mt-5 overflow-hidden">
              {search.isLoading ? (
                <LoadingBlock label="Searching verified research…" />
              ) : search.isError ? (
                <div className="p-4">
                  <ErrorBlock message={getErrorMessage(search.error)} variant={String((search.error as any)?.response?.status) === '429' ? 'warning' : 'error'} />
                </div>
              ) : !search.data?.items.length ? (
                <EmptyBlock title="No verified publications found" text="Try broadening your search terms or removing a filter." />
              ) : (
                <>
                  <div className="grid gap-4 p-4 md:grid-cols-2">
                    {search.data.items.map((publication: Publication) => (
                      <PublicationCard key={publication._id} publication={publication} showDepartment />
                    ))}
                  </div>
                  <Pagination meta={search.data.pagination} onPageChange={setPage} />
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="mt-8 border-t bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-slate-600 sm:grid-cols-3 sm:px-6 lg:px-8">
          <div>
            <BookOpenText className="h-5 w-5 text-brand-700" />
            <p className="mt-2 font-semibold text-slate-800">Institutional repository</p>
            <p className="mt-1">Verified scholarly research at CUI.</p>
          </div>
          <div>
            <GraduationCap className="h-5 w-5 text-brand-700" />
            <p className="mt-2 font-semibold text-slate-800">Faculty & scholars</p>
            <p className="mt-1">Research profiles, citations and collaboration.</p>
          </div>
          <div>
            <UsersRound className="h-5 w-5 text-brand-700" />
            <p className="mt-2 font-semibold text-slate-800">ORIC workflow</p>
            <p className="mt-1">Responsible review from draft to verified record.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function PublicAuthorProfilePage() {
  const { id = '' } = useParams()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const profile = useQuery({ queryKey: ['author-profile', id], queryFn: () => profileApi.profile(id) })
  const coAuthors = useQuery({ queryKey: ['author-coauthors', id], queryFn: () => profileApi.coAuthors(id), enabled: !!id })
  const network = useQuery({ queryKey: ['author-network', id], queryFn: () => profileApi.network(id), enabled: !!id })

  if (profile.isLoading) return <div className="page-shell"><LoadingBlock /></div>
  if (profile.isError || !profile.data?.data) return <div className="page-shell"><ErrorBlock message={getErrorMessage(profile.error)} /></div>
  const person = profile.data.data
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-800">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <Link to="/" className="btn-secondary min-h-10 border-white/30 bg-white/10 text-white hover:bg-white/20">Search research</Link>
            {user ? (
              <>
                <Link to="/dashboard" className="btn-secondary min-h-10 border-white/30 bg-white/10 text-white hover:bg-white/20">Dashboard</Link>
                <button onClick={async () => { await logout(); navigate('/') }} className="text-sm text-brand-100 hover:text-white">Sign out</button>
              </>
            ) : (
              <Link to="/login" className="btn-secondary min-h-10 border-white/30 bg-white/10 text-white hover:bg-white/20">Sign in</Link>
            )}
          </div>
        </div>
      </header>
      <main className="page-shell">
        <section className="panel overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-brand-700 to-cui-blue" />
          <div className="relative p-5 sm:p-7">
            <div className="absolute -top-12 grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-white bg-brand-100 text-3xl font-bold text-brand-700 shadow-sm">
              {person.photoUrl ? <img className="h-full w-full object-cover" src={person.photoUrl} alt={person.userId.name} /> : person.userId.name.slice(0, 1)}
            </div>
            <div className="ml-28 min-h-14">
              <h1 className="font-sans text-2xl font-bold text-slate-900">{person.userId.name}</h1>
              <p className="mt-1 text-sm text-slate-600">{person.designation || person.userId.role.replace('_', ' ')} · {displayName(person.departmentId)}</p>
            </div>
            <p className="mt-6 max-w-2xl text-sm text-slate-600">{person.affiliation}</p>
            {person.researchInterests?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {person.researchInterests.map((interest) => (
                  <span key={interest} className="badge bg-brand-50 text-brand-700">{interest}</span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="panel panel-pad">
            <h2 className="font-sans text-lg font-bold">Research metrics</h2>
            <dl className="mt-4 space-y-3 text-sm">
              {Object.entries(person.metrics || {}).filter(([key]) => key !== 'lastCalculatedAt').slice(0, 3).map(([label, value]) => (
                <div className="flex justify-between" key={label}>
                  <dt className="text-slate-500">{label.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd className="font-bold text-slate-900">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel panel-pad lg:col-span-2">
            <h2 className="font-sans text-lg font-bold">Co-author network</h2>
            {network.isLoading ? (
              <LoadingBlock />
            ) : (
              <div className="mt-4 rounded-lg bg-cui-pale p-4 text-sm text-cui-blue">
                <p className="font-semibold">{network.data?.data.nodes.length || 0} connected researchers · {network.data?.data.edges.length || 0} collaboration links</p>
                <p className="mt-1 text-xs">Network relationships are derived from verified co-authored publications.</p>
              </div>
            )}
          </section>
          <section className="panel panel-pad lg:col-span-3">
            <h2 className="font-sans text-lg font-bold">Collaborators</h2>
            {coAuthors.isLoading ? (
              <LoadingBlock />
            ) : !coAuthors.data?.data.length ? (
              <EmptyBlock title="No co-authors recorded" />
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {coAuthors.data.data.slice(0, 12).map((entry, index) => (
                  <div className="rounded-lg border p-3 text-sm" key={index}>
                    <p className="font-semibold text-slate-900">{displayName((entry as { authorProfile?: { userId?: unknown } }).authorProfile?.userId) || 'Research collaborator'}</p>
                    <p className="mt-1 text-slate-500">{String((entry as { collaborationCount?: number }).collaborationCount || 0)} shared publications</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

// Public read-only Departments view — no add/edit/delete
export function PublicDepartmentsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const list = useQuery({ queryKey: ['public-departments'], queryFn: () => departmentApi.list({ limit: 100 }) })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-800">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Brand />
          <div className="flex items-center gap-2">
            <Link to="/" className="btn-secondary min-h-10 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20">Search research</Link>
            {user ? (
              <>
                <Link to="/dashboard" className="btn-secondary min-h-10 bg-white text-brand-800">Dashboard</Link>
                <button onClick={async () => { await logout(); navigate('/') }} className="text-sm text-brand-100 hover:text-white">Sign out</button>
              </>
            ) : (
              <Link to="/login" className="btn-secondary min-h-10 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20">Sign in</Link>
            )}
          </div>
        </div>
      </header>
      <main className="page-shell">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="page-title">Departments</h1>
            <p className="page-subtitle">Browse CUI departments.</p>
          </div>
        </div>
        <section className="panel mt-6 overflow-hidden">
          {list.isLoading ? <LoadingBlock /> : list.isError ? <div className="p-4"><ErrorBlock message={getErrorMessage(list.error)} /></div> : !list.data?.items.length ? <EmptyBlock title="No departments found" /> : (
            <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
              {list.data.items.map((department) => (
                <article className="p-5" key={department._id}>
                  <h2 className="font-sans text-lg font-bold text-slate-900">{department.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{department.campus} campus</p>
                  <p className="mt-4 text-sm text-slate-700">HOD: {displayName(department.hodId) || 'Not assigned'}</p>
                  <p className="mt-2 text-xs text-slate-400">This is a public read-only view. Contact ORIC admin for changes.</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
