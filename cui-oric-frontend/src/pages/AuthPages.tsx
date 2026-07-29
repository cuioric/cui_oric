import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Brand } from '../components/Brand'
import { ErrorBlock } from '../components/Common'
import { useAuth } from '../contexts/AuthContext'
import { applyServerFieldErrors, authApi, getErrorMessage } from '../lib/api'

const facultyDomain = import.meta.env.VITE_FACULTY_EMAIL_DOMAIN || 'cuisahiwal.edu.pk'
const studentDomain = import.meta.env.VITE_STUDENT_EMAIL_DOMAIN || 'students.cuisahiwal.edu.pk'
const campuses = ['Sahiwal', 'Islamabad', 'Lahore', 'Wah', 'Attock', 'Vehari', 'Virtual'] as const
const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/

function AuthFrame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-800 to-brand-700 px-4 pb-8 pt-20 sm:grid sm:place-items-center sm:pt-8">
      {/* Fixed to viewport's top-left corner on every device */}
      <Link
        to="/"
        className="fixed left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>
      <div className="w-full max-w-md">
        <div className="mb-7 flex justify-center">
          <Brand />
        </div>
        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-6">
            <h1 className="font-sans text-2xl font-bold text-slate-900">{title}</h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">{lead}</p>
          </div>
          <div className="p-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-xs text-brand-100">COMSATS University Islamabad · Office of Research, Innovation & Commercialization</p>
      </div>
    </div>
  )
}

function FieldError({ error }: { error?: unknown }) {
  const message =
    typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : ''
  return message ? <p className="error">{message}</p> : null
}

// Reusable stylish eye toggle
function PasswordField({
  label = 'Password',
  error,
  autoComplete,
  register,
  placeholder,
}: {
  label?: string
  error?: unknown
  autoComplete?: string
  register: any
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={`field pr-11 ${error ? 'field-error' : ''}`}
          autoComplete={autoComplete}
          placeholder={placeholder}
          {...register}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <FieldError error={error} />
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(
      z.object({ email: z.string().email('Enter a valid email address'), password: z.string().min(1, 'Password is required') })
    ),
  })

  return (
    <AuthFrame title="Sign in" lead="Use your approved CUI account to continue.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => {
          setServerError('')
          try {
            await login(values.email, values.password)
            navigate('/dashboard')
          } catch (error) {
            setServerError(getErrorMessage(error))
          }
        })}
      >
        {serverError && <ErrorBlock message={serverError} />}
        <div>
          <label className="label">University email</label>
          <input className={`field ${errors.email ? 'field-error' : ''}`} autoComplete="email" {...register('email')} />
          <FieldError error={errors.email?.message} />
        </div>
        <PasswordField label="Password" error={errors.password?.message} autoComplete="current-password" register={register('password')} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">Forgot password?</Link>
        </div>
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}Sign in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">New to the system? <Link className="font-semibold text-brand-700 hover:underline" to="/register">Create your account</Link></p>
    </AuthFrame>
  )
}

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters').regex(passwordRule, 'Include uppercase, lowercase, a number and a special character'),
    role: z.enum(['faculty', 'ms_student', 'phd_student']),
    campus: z.enum(campuses),
  })
  .refine(
    (values) => {
      const domain = values.role === 'faculty' ? facultyDomain : studentDomain
      return values.email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)
    },
    { path: ['email'], message: 'Email must use the domain for the selected role' }
  )

type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const {
    register,
    watch,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'faculty', campus: 'Sahiwal' },
  })
  const role = watch('role')
  const domain = role === 'faculty' ? facultyDomain : studentDomain

  return (
    <AuthFrame title="Create an account" lead="Registration is for faculty, MS students and PhD students. ORIC verifies each account.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => {
          setServerError('')
          try {
            await authApi.register(values)
            navigate(`/verification-pending?email=${encodeURIComponent(values.email)}`)
          } catch (error) {
            applyServerFieldErrors(error, (field, issue) => setError(field as keyof RegisterValues, issue))
            setServerError(getErrorMessage(error))
          }
        })}
      >
        {serverError && <ErrorBlock message={serverError} />}
        <div>
          <label className="label">Full name</label>
          <input className="field" autoComplete="name" {...register('name')} />
          <FieldError error={errors.name?.message} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="field" {...register('role')}>
            <option value="faculty">Faculty member</option>
            <option value="ms_student">MS student</option>
            <option value="phd_student">PhD student</option>
          </select>
        </div>
        <div>
          <label className="label">University email</label>
          <input className="field" type="email" autoComplete="email" {...register('email')} />
          <p className="help">For {role === 'faculty' ? 'faculty' : 'students'}, use an address ending in <strong>@{domain}</strong>.</p>
          <FieldError error={errors.email?.message} />
        </div>
        <div>
          <label className="label">Campus</label>
          <select className="field" {...register('campus')}>{campuses.map((campus) => <option key={campus}>{campus}</option>)}</select>
          <FieldError error={errors.campus?.message} />
        </div>
        <PasswordField label="Password" error={errors.password?.message} autoComplete="new-password" register={register('password')} />
        <p className="help">At least 8 characters with uppercase, lowercase, number and special character.</p>
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}Create account
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">Already approved? <Link className="font-semibold text-brand-700 hover:underline" to="/login">Sign in</Link></p>
    </AuthFrame>
  )
}

export function VerificationPendingPage() {
  const [params] = useSearchParams()
  const email = params.get('email') || ''
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <AuthFrame title="Check your email" lead="We sent a verification link to your university email address.">
      <div className="rounded-lg bg-cui-pale p-4 text-center">
        <Mail className="mx-auto h-7 w-7 text-cui-blue" />
        <p className="mt-2 text-sm font-semibold text-slate-800">{email || 'Your CUI email'}</p>
        <p className="mt-1 text-sm text-slate-600">Open the link to verify your email. Your account will then be sent to ORIC for approval.</p>
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}
      <button
        className="btn-secondary mt-5 w-full"
        disabled={pending || !email}
        onClick={async () => {
          setPending(true)
          setError('')
          try {
            const r = await authApi.resendVerification(email)
            setMessage(r.message)
          } catch (e) {
            setError(getErrorMessage(e))
          } finally {
            setPending(false)
          }
        }}
      >
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}Resend verification email
      </button>
      <Link className="btn-quiet mt-2 w-full" to="/login">Back to sign in</Link>
    </AuthFrame>
  )
}

export function VerifyEmailPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  useEffect(() => {
    authApi.verifyEmail(token).then(() => navigate('/pending-approval', { replace: true })).catch((e) => setError(getErrorMessage(e)))
  }, [token, navigate])

  return (
    <AuthFrame title="Verifying your email" lead="Please wait while we confirm your university email.">
      {error ? (
        <>
          <ErrorBlock message={error} />
          <Link className="btn-secondary mt-5 w-full" to="/register">Register again</Link>
        </>
      ) : (
        <div className="flex flex-col items-center py-6 text-sm text-slate-600">
          <LoaderCircle className="mb-3 h-7 w-7 animate-spin text-brand-700" />Checking your verification link…
        </div>
      )}
    </AuthFrame>
  )
}

export function PendingApprovalPage() {
  return (
    <AuthFrame title="Awaiting ORIC approval" lead="Your email has been verified.">
      <div className="rounded-lg border border-brand-100 bg-brand-50 p-5 text-center">
        <ShieldCheck className="mx-auto h-9 w-9 text-brand-700" />
        <h2 className="mt-3 font-semibold text-slate-900">Your account is in the approval queue</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">An ORIC administrator will assign your department and approve your access. You will receive an email when your account becomes active.</p>
      </div>
      <Link className="btn-secondary mt-5 w-full" to="/login">Back to sign in</Link>
    </AuthFrame>
  )
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email address') })) })

  return (
    <AuthFrame title="Reset your password" lead="Enter your active university email and we will send a reset link.">
      {sent ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 text-sm text-slate-600">If the email exists, a password-reset link has been sent.</p>
          <Link to="/login" className="btn-primary mt-6 w-full">Return to sign in</Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            setServerError('')
            try {
              await authApi.forgotPassword(email)
              setSent(true)
            } catch (e) {
              setServerError(getErrorMessage(e))
            }
          })}
        >
          {serverError && <ErrorBlock message={serverError} />}
          <div>
            <label className="label">University email</label>
            <input className="field" type="email" autoComplete="email" {...register('email')} />
            <FieldError error={errors.email?.message} />
          </div>
          <button className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}Send reset link
          </button>
          <Link to="/login" className="btn-quiet w-full">Cancel</Link>
        </form>
      )}
    </AuthFrame>
  )
}

export function ResetPasswordPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(
      z.object({
        password: z.string().min(8, 'Use at least 8 characters').regex(passwordRule, 'Include uppercase, lowercase, a number and a special character'),
        confirm: z.string(),
      }).refine((data) => data.password === data.confirm, { path: ['confirm'], message: 'Passwords do not match' })
    ),
  })

  return (
    <AuthFrame title="Set a new password" lead="Choose a strong password for your account.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async ({ password }) => {
          setServerError('')
          try {
            await authApi.resetPassword(token, password)
            navigate('/login', { state: { reset: true } })
          } catch (e) {
            setServerError(getErrorMessage(e))
          }
        })}
      >
        {serverError && <ErrorBlock message={serverError} />}
        <PasswordField label="New password" error={errors.password?.message} autoComplete="new-password" register={register('password')} placeholder="New strong password" />
        <PasswordField label="Confirm password" error={errors.confirm?.message} autoComplete="new-password" register={register('confirm')} placeholder="Repeat password" />
        <button className="btn-primary w-full" disabled={isSubmitting}>
          <KeyRound className="h-4 w-4" />
          {isSubmitting ? 'Saving…' : 'Reset password'}
        </button>
      </form>
    </AuthFrame>
  )
}
