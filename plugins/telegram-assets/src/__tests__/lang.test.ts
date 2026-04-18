import { makeLocalesTest } from '@intabiafusion/platform'

it(
  'Locales are equal',
  makeLocalesTest((lang) => import(`../../lang/${lang}.json`))
)
