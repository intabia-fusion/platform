//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import {
  type QuestionInitFunction,
  type QuestionInitFunctionResult,
  type SingleChoiceQuestion
} from '@intabiafusion/questions'
import { type Hierarchy } from '@intabiafusion/core'
import { translate } from '@intabiafusion/platform'
import type { ThemeOptions } from '@intabiafusion/theme'
import questions from '../plugin'

export const SingleChoiceQuestionInit: QuestionInitFunction<SingleChoiceQuestion> = async (
  language: ThemeOptions['language'],
  hierarchy: Hierarchy
): Promise<QuestionInitFunctionResult<SingleChoiceQuestion>> => {
  return {
    title: await translate(questions.string.SingleChoice, {}, language),
    questionData: {
      options: [{ label: '' }]
    }
  }
}
