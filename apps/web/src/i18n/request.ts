import { LOCALE_COOKIE, resolveLocale } from '@weft/i18n'
import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

// No locale in the URL: the explicit choice (cookie) wins, then the browser's languages.
export default getRequestConfig(async () => {
  const locale = resolveLocale({
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get('accept-language'),
  })

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
