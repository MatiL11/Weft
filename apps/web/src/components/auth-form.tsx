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
    title: 'Create your account',
    subtitle: 'Record your screen and share the link the moment you stop.',
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
        ? await authClient.signUp.email({
            name: values.name.trim(),
            email: values.email.trim(),
            password: values.password,
          })
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
      <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-muted">{copy.subtitle}</p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-4">
        {mode === 'sign-up' && (
          <Field
            label="Name"
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={update('name')}
            error={fieldErrors.name}
          />
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={update('email')}
          error={fieldErrors.email}
        />
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
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
          >
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-11 cursor-pointer rounded-xl bg-primary px-5 font-medium text-on-primary transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? 'One moment…' : copy.submit}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {copy.switchText}{' '}
        <Link
          href={copy.switchHref}
          className="font-medium text-fg underline decoration-accent decoration-2 underline-offset-4 transition-colors hover:text-accent"
        >
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
  const inputId = `field-${name}`
  const errorId = `${inputId}-error`
  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-fg transition-colors placeholder:text-muted hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none aria-invalid:border-danger"
      />
      {error && (
        <span id={errorId} className="text-sm text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
