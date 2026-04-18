//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import {
  type QuestionInitFunction,
  type QuestionInitFunctionResult,
  type MultipleChoiceAssessment
} from '@intabiafusion/questions'
import { type Hierarchy } from '@intabiafusion/core'
import type { ThemeOptions } from '@intabiafusion/theme'
import { MultipleChoiceQuestionInit } from './MultipleChoiceQuestionInit'

export const MultipleChoiceAssessmentInit: QuestionInitFunction<MultipleChoiceAssessment> = async (
  language: ThemeOptions['language'],
  hierarchy: Hierarchy
): Promise<QuestionInitFunctionResult<MultipleChoiceAssessment>> => {
  return {
    ...(await MultipleChoiceQuestionInit(language, hierarchy)),
    assessmentData: {
      correctIndices: [0]
    }
  }
}
