import type { Locale } from '@weft/i18n'
import type messages from '../../messages/en.json'

// Type-checks every translation key against the English catalog.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof messages
  }
}
