//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import {
  type QuestionInitFunction,
  type QuestionInitFunctionResult,
  type MultipleChoiceQuestion
} from '@intabiafusion/questions'
import { type Hierarchy } from '@intabiafusion/core'
import { translate } from '@intabiafusion/platform'
import type { ThemeOptions } from '@intabiafusion/theme'
import questions from '../plugin'

export const MultipleChoiceQuestionInit: QuestionInitFunction<MultipleChoiceQuestion> = async (
  language: ThemeOptions['language'],
  hierarchy: Hierarchy
): Promise<QuestionInitFunctionResult<MultipleChoiceQuestion>> => {
  return {
    title: await translate(questions.string.MultipleChoice, {}, language),
    questionData: {
      options: [{ label: '' }]
    }
  }
}
