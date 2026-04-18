import { makeLocalesTest } from '@intabiafusion/platform'

it(
  'Locales are equale',
  makeLocalesTest((lang) => import(`../../lang/${lang}.json`))
)
