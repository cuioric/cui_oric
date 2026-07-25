import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards'
import { AuthProvider } from './contexts/AuthContext'
import { AdminUsersPage, AnalyticsPage, DepartmentsPage, ReviewQueuePage } from './pages/AdminPages'
import {
  ForgotPasswordPage,
  LoginPage,
  PendingApprovalPage,
  RegisterPage,
  ResetPasswordPage,
  VerificationPendingPage,
  VerifyEmailPage,
} from './pages/AuthPages'
import { DashboardPage } from './pages/DashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import { PublicationDetailPage, PublicationEditorPage, PublicationsPage } from './pages/PublicationPages'
import { PublicAuthorProfilePage, PublicDepartmentsPage, PublicSearchPage } from './pages/PublicPages'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (attempt, error: unknown) => {
        const status = (error as { response?: { status?: number } }).response?.status
        // Don't retry auth errors or rate-limit
        if (status === 401 || status === 403 || status === 429) return false
        return attempt < 1
      },
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<PublicSearchPage />} />
            <Route path="/author-profile/:id" element={<PublicAuthorProfilePage />} />
            <Route path="/publications/:id" element={<PublicationDetailPage />} />
            <Route path="/departments" element={<PublicDepartmentsPage />} />

            {/* Auth - public only */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verification-pending" element={<VerificationPendingPage />} />
              <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
              <Route path="/pending-approval" element={<PendingApprovalPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            </Route>

            {/* Protected - AppShell */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/publications" element={<PublicationsPage />} />

                <Route element={<ProtectedRoute roles={['faculty', 'ms_student', 'phd_student']} />}>
                  <Route path="/publications/new" element={<PublicationEditorPage />} />
                  <Route path="/publications/:id/edit" element={<PublicationEditorPage />} />
                </Route>

                <Route element={<ProtectedRoute roles={['hod', 'oric_admin']} />}>
                  <Route path="/review-queue" element={<ReviewQueuePage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                </Route>

                <Route element={<ProtectedRoute roles={['faculty', 'ms_student', 'phd_student', 'hod']} />}>
                  <Route path="/profile" element={<ProfilePage />} />
                </Route>

                <Route element={<ProtectedRoute roles={['oric_admin']} />}>
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  {/* Fixed: admin departments inside shell keeps sidebar consistent*/}
                  <Route path="/admin/departments" element={<DepartmentsPage />} />
                  {/* Legacy /departments inside shell also allowed for backward compatibility, redirects to admin version */}
                  <Route path="/departments/admin" element={<Navigate to="/admin/departments" replace />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
