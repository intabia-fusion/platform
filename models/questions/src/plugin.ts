//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import { questionsId } from '@intabiafusion/questions'
import questions from '@intabiafusion/questions-resources/src/plugin'
import type { Ref } from '@intabiafusion/core'
import { mergeIds } from '@intabiafusion/platform'
import type { ActionCategory } from '@intabiafusion/view'

export default mergeIds(questionsId, questions, {
  actionCategory: {
    Questions: '' as Ref<ActionCategory>
  }
})
