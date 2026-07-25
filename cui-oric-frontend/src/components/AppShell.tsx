import { BarChart3, Building2, FilePlus2, FileText, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Brand } from './Brand'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types'

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; roles?: Role[] }
const nav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/publications', label: 'Publications', icon: FileText },
  { to: '/publications/new', label: 'New publication', icon: FilePlus2, roles: ['faculty', 'ms_student', 'phd_student'] },
  { to: '/review-queue', label: 'Review queue', icon: ShieldCheck, roles: ['hod', 'oric_admin'] },
  { to: '/admin/users', label: 'User approvals', icon: Users, roles: ['oric_admin'] },
  { to: '/admin/departments', label: 'Departments', icon: Building2, roles: ['oric_admin'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['hod', 'oric_admin'] },
  { to: '/profile', label: 'My profile', icon: UserRound, roles: ['faculty', 'ms_student', 'phd_student', 'hod'] },
]
function Sidebar({ close }: { close?: () => void }) { const { user, logout } = useAuth(); const navigate = useNavigate(); const allowed = nav.filter((item) => !item.roles || (user && item.roles.includes(user.role))); return <aside className="flex h-full w-72 flex-col bg-brand-800 text-white"><div className="flex h-20 items-center justify-between px-5"><Brand />{close && <button onClick={close} className="rounded-lg p-2 text-brand-100 hover:bg-white/10 lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>}</div><div className="mx-4 border-t border-white/15" /><nav className="flex-1 space-y-1 p-3 pt-5">{allowed.map(({ to, label, icon: Icon }) => {
    // Exact matching for list pages to avoid both /publications and /publications/new being active
    const exact = ['/publications', '/dashboard', '/admin/users', '/admin/departments', '/analytics', '/profile', '/review-queue'].includes(to)
    return <NavLink onClick={close} key={to} to={to} end={exact} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-white text-brand-800 shadow-sm' : 'text-brand-100 hover:bg-white/10 hover:text-white'}`}><Icon className="h-5 w-5" />{label}</NavLink>
  })}</nav><div className="m-3 rounded-lg bg-white/10 p-3"><p className="truncate text-sm font-semibold">{user?.name}</p><p className="mt-0.5 text-xs capitalize text-brand-100">{user?.role.replace('_', ' ')}</p><button onClick={async () => { await logout(); navigate('/login') }} className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-semibold text-brand-100 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button></div></aside> }
export function AppShell() { const [open, setOpen] = useState(false); const { user } = useAuth(); return <div className="min-h-screen bg-slate-50"><div className="fixed inset-y-0 left-0 z-30 hidden lg:block"><Sidebar /></div>{open && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full bg-slate-950/45" /><div className="relative h-full shadow-2xl"><Sidebar close={() => setOpen(false)} /></div></div>}<div className="lg:pl-72"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6"><button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu className="h-6 w-6" /></button><div className="hidden items-center gap-2 text-sm font-medium text-slate-500 sm:flex"><Search className="h-4 w-4" /><span>Institutional Research Repository</span></div><div className="flex items-center gap-2"><span className="hidden text-right text-xs text-slate-500 sm:block"><span className="block font-semibold text-slate-700">{user?.name}</span><span className="capitalize">{user?.role.replace('_', ' ')}</span></span><div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{user?.name.slice(0, 1).toUpperCase()}</div></div></header><main><Outlet /></main></div></div> }
