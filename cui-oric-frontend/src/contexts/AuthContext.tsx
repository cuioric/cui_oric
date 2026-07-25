import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'   
import { authApi, configureApiAuth, setApiAccessToken } from '../lib/api'
import type { Role, User } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  initializing: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  updateUser: (user: User) => void
  hasRole: (...roles: Role[]) => boolean
}
const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()   
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)

  const clearSession = useCallback(() => {
    setUser(null)
    setAccessToken(null)
    setApiAccessToken(null)
    queryClient.clear()   
  }, [queryClient]) 

  // Configure api auth once — fix: don't depend on accessToken to avoid re-configure loop
  useEffect(() => {
    configureApiAuth(
      () => {
        clearSession()
        // Only redirect to login if we were previously authenticated and now expired
        // Avoid redirecting public page visitors who never logged in
        if (window.location.pathname.startsWith('/dashboard') || window.location.pathname.startsWith('/publications') || window.location.pathname.startsWith('/admin')) {
          window.location.assign('/login')
        }
      },
      (token) => setAccessToken(token)
    )
  }, [clearSession])

  useEffect(() => {
    let live = true
    // Restore only through the httpOnly refresh cookie; no token is read from browser storage.
    authApi
      .refresh()
      .then(() => authApi.me())
      .then((response) => {
        if (live) setUser(response.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setInitializing(false)
      })
    return () => {
      live = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    queryClient.clear()   // ← NEW LINE — wipes any leftover cache from a previous session in this tab
    const response = await authApi.login({ email, password })
    const payload = response.data as { user: User; accessToken: string }
    setApiAccessToken(payload.accessToken)
    setAccessToken(payload.accessToken)
    setUser(payload.user)
    return payload.user
  }, [queryClient])   // ← queryClient added to deps

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      clearSession()
    }
  }, [clearSession])

  const value = useMemo(
    () => ({
      user,
      accessToken,
      initializing,
      login,
      logout,
      updateUser: setUser,
      hasRole: (...roles: Role[]) => !!user && roles.includes(user.role),
    }),
    [user, accessToken, initializing, login, logout]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}