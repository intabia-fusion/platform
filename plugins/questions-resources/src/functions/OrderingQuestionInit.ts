//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import {
  type QuestionInitFunction,
  type QuestionInitFunctionResult,
  type OrderingQuestion
} from '@intabiafusion/questions'
import { type Hierarchy } from '@intabiafusion/core'
import { translate } from '@intabiafusion/platform'
import type { ThemeOptions } from '@intabiafusion/theme'
import questions from '../plugin'

export const OrderingQuestionInit: QuestionInitFunction<OrderingQuestion> = async (
  language: ThemeOptions['language'],
  hierarchy: Hierarchy
): Promise<QuestionInitFunctionResult<OrderingQuestion>> => {
  return {
    title: await translate(questions.string.Ordering, {}, language),
    questionData: {
      options: [{ label: '' }]
    }
  }
}
