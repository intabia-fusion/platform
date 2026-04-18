//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import type {
  AnswerDataAssessFunction,
  SingleChoiceAssessment,
  SingleChoiceAssessmentAnswer
} from '@intabiafusion/questions'

/** @public */
export const SingleChoiceAssessmentAssess: AnswerDataAssessFunction<
SingleChoiceAssessment,
SingleChoiceAssessmentAnswer
> = async (answerData, assessmentData) => {
  return {
    score: answerData.selectedIndex === assessmentData.correctIndex ? 100 : 0
  }
}
