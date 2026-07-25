import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { LoadingBlock } from './Common'
export function ProtectedRoute({ roles }: { roles?: Role[] }) { const { user, initializing } = useAuth(); const location = useLocation(); if (initializing) return <LoadingBlock label="Restoring your secure session…" />; if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />; if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />; return <Outlet /> }
export function PublicOnlyRoute() { const { user, initializing } = useAuth(); if (initializing) return <LoadingBlock />; return user ? <Navigate to="/dashboard" replace /> : <Outlet /> }
