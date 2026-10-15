'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { authClient } from '@/lib/auth-client'
import { validateAuthForm, type AuthFormValues, type AuthMode } from '@/lib/auth-form'

interface AuthFormProps {
  mode: AuthMode
}

type FieldErrors = Partial<Record<keyof AuthFormValues, string>>

const COPY = {
  'sign-up': {
    title: 'Start weaving',
    subtitle: 'Create an account and get a personal workspace for your videos.',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchHref: '/sign-in',
    switchLabel: 'Sign in',
  },
  'sign-in': {
    title: 'Welcome back',
    subtitle: 'Sign in to record and share.',
    submit: 'Sign in',
    switchText: 'New to Weft?',
    switchHref: '/sign-up',
    switchLabel: 'Create an account',
  },
} as const

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const copy = COPY[mode]
  const [values, setValues] = useState<AuthFormValues>({ name: '', email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = (field: keyof AuthFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateAuthForm(mode, values)
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    const { error } =
      mode === 'sign-up'
        ? await authClient.signUp.email({ name: values.name.trim(), email: values.email.trim(), password: values.password })
        : await authClient.signIn.email({ email: values.email.trim(), password: values.password })
    setIsSubmitting(false)

    if (error) {
      setFormError(error.message ?? 'Something went wrong. Please try again.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="rise w-full max-w-sm">
      <h1 className="font-display text-4xl leading-tight tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-ink-soft">{copy.subtitle}</p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {mode === 'sign-up' && (
          <Field label="Name" name="name" autoComplete="name" value={values.name} onChange={update('name')} error={fieldErrors.name} />
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" value={values.email} onChange={update('email')} error={fieldErrors.email} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          value={values.password}
          onChange={update('password')}
          error={fieldErrors.password}
        />

        {formError && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="group relative w-full overflow-hidden rounded-full bg-ink px-5 py-3 font-medium text-paper transition-transform duration-150 hover:-translate-y-px active:translate-y-0 disabled:opacity-60"
        >
          <span className="relative z-10">{isSubmitting ? 'One moment…' : copy.submit}</span>
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-full origin-left scale-x-0 bg-thread transition-transform duration-300 ease-(--ease-out-expo) group-hover:scale-x-100"
          />
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        {copy.switchText}{' '}
        <Link href={copy.switchHref} className="font-medium text-ink underline decoration-thread decoration-2 underline-offset-4">
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  )
}

interface FieldProps {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  error?: string | undefined
}

function Field({ label, name, value, onChange, type = 'text', autoComplete, error }: FieldProps) {
  const errorId = `${name}-error`
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-1.5 block w-full rounded-lg border border-ink/15 bg-white/70 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgb(0_0_0/0.03)] transition-colors placeholder:text-ink-soft/60 hover:border-ink/30 focus:border-thread focus:outline-none aria-invalid:border-danger"
      />
      {error && (
        <span id={errorId} className="mt-1 block text-sm text-danger">
          {error}
        </span>
      )}
    </label>
  )
}
