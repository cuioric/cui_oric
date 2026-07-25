import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Brand({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  // If logged in, brand navigates to dashboard, otherwise to public home
  const target = user ? '/dashboard' : '/'

  return (
    <Link to={target} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:ring-white" aria-label="CUI ORIC home">
      <img src="/cui-logo.jpg" alt="COMSATS University Islamabad" className="h-10 w-10 shrink-0 rounded-full bg-white object-cover ring-1 ring-white/40" />
      {!compact && (
        <span className="min-w-0 leading-tight text-white">
          <span className="block truncate text-sm font-bold tracking-wide">CUI ORIC</span>
          <span className="block truncate text-[10px] font-medium tracking-[.11em] text-brand-100">RESEARCH & PUBLICATIONS</span>
        </span>
      )}
    </Link>
  )
}
