'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { authClient } from '@/lib/auth-client'
import { authErrorKey } from '@/lib/auth-errors'
import {
  MIN_PASSWORD_LENGTH,
  validateAuthForm,
  type AuthFormErrors,
  type AuthFormValues,
  type AuthMode,
} from '@/lib/auth-form'

interface AuthFormProps {
  mode: AuthMode
  /** Same-site path to continue to afterwards (already validated). */
  next?: string
}

const MODE_KEYS = { 'sign-up': 'signUp', 'sign-in': 'signIn' } as const
const SWITCH_HREF = { 'sign-up': '/sign-in', 'sign-in': '/sign-up' } as const

export function AuthForm({ mode, next = '/' }: AuthFormProps) {
  const router = useRouter()
  const t = useTranslations('auth')
  const modeKey = MODE_KEYS[mode]
  const [values, setValues] = useState<AuthFormValues>({ name: '', email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<AuthFormErrors>({})
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
      setFormError(t(`errors.${authErrorKey(error)}`))
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <div className="rise w-full max-w-sm">
      <h1 className="text-3xl font-semibold tracking-tight">{t(`${modeKey}.title`)}</h1>
      <p className="mt-2 text-muted">{t(`${modeKey}.subtitle`)}</p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-4">
        {mode === 'sign-up' && (
          <Field
            label={t('fields.name')}
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={update('name')}
            error={fieldErrors.name && t(`validation.${fieldErrors.name}`)}
          />
        )}
        <Field
          label={t('fields.email')}
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={update('email')}
          error={fieldErrors.email && t(`validation.${fieldErrors.email}`)}
        />
        <Field
          label={t('fields.password')}
          name="password"
          type="password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          value={values.password}
          onChange={update('password')}
          error={
            fieldErrors.password &&
            t(`validation.${fieldErrors.password}`, { min: MIN_PASSWORD_LENGTH })
          }
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
          {isSubmitting ? t('submitting') : t(`${modeKey}.submit`)}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {t(`${modeKey}.switchText`)}{' '}
        <Link
          href={
            next === '/'
              ? SWITCH_HREF[mode]
              : `${SWITCH_HREF[mode]}?next=${encodeURIComponent(next)}`
          }
          className="font-medium text-fg underline decoration-accent decoration-2 underline-offset-4 transition-colors hover:text-accent"
        >
          {t(`${modeKey}.switchLabel`)}
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
