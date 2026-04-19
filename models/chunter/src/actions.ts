//
// Copyright © 2024 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { type Builder } from '@hcengineering/model'
import view, { createAction } from '@hcengineering/model-view'
import activity from '@hcengineering/activity'
import core from '@hcengineering/model-core'

import chunter from './plugin'

export function defineActions (builder: Builder): void {
  builder.createDoc(
    view.class.ActionCategory,
    core.space.Model,
    { label: chunter.string.Chat, visible: true },
    chunter.category.Chunter
  )
  defineMessageActions(builder)
  defineChannelActions(builder)
}

function defineMessageActions (builder: Builder): void {
  createAction(
    builder,
    {
      action: chunter.actionImpl.ReplyToThread,
      label: chunter.string.ReplyToThread,
      icon: chunter.icon.Thread,
      input: 'focus',
      category: chunter.category.Chunter,
      target: activity.class.ActivityMessage,
      visibilityTester: chunter.function.CanReplyToThread,
      inline: true,
      context: {
        mode: 'context',
        group: 'edit'
      }
    },
    activity.action.Reply
  )

  createAction(
    builder,
    {
      action: view.actionImpl.CopyTextToClipboard,
      actionProps: {
        textProvider: chunter.function.GetLink
      },
      label: chunter.string.CopyLink,
      icon: chunter.icon.Copy,
      input: 'none',
      category: chunter.category.Chunter,
      target: activity.class.ActivityMessage,
      visibilityTester: chunter.function.CanCopyMessageLink,
      context: {
        mode: ['context', 'browser'],
        application: chunter.app.Chunter,
        group: 'copy'
      },
      override: [view.action.CopyLink]
    },
    chunter.action.CopyChatMessageLink
  )

  createAction(
    builder,
    {
      action: chunter.actionImpl.DeleteChatMessage,
      label: view.string.Delete,
      icon: view.icon.Delete,
      input: 'focus',
      keyBinding: ['Backspace'],
      category: chunter.category.Chunter,
      target: chunter.class.ChatMessage,
      visibilityTester: chunter.function.CanDeleteMessage,
      context: { mode: ['context', 'browser'], group: 'remove' }
    },
    chunter.action.DeleteChatMessage
  )

  createAction(
    builder,
    {
      action: chunter.actionImpl.SummarizeMessages,
      label: chunter.string.SummarizeMessages,
      icon: view.icon.Feather,
      input: 'focus',
      category: chunter.category.Chunter,
      target: core.class.Doc,
      context: { mode: ['context', 'browser'], group: 'tools' },
      visibilityTester: chunter.function.CanSummarizeMessages
    },
    chunter.action.SummarizeMessages
  )

  createAction(
    builder,
    {
      action: chunter.actionImpl.TranslateMessage,
      label: chunter.string.Translate,
      icon: view.icon.Translate,
      input: 'focus',
      category: chunter.category.Chunter,
      target: chunter.class.ChatMessage,
      visibilityTester: chunter.function.CanTranslateMessage,
      inline: true,
      context: {
        mode: 'context',
        group: 'edit'
      }
    },
    chunter.action.TranslateMessage
  )
  createAction(
    builder,
    {
      action: chunter.actionImpl.ShowOriginalMessage,
      label: chunter.string.ShowOriginal,
      icon: view.icon.Undo,
      input: 'focus',
      category: chunter.category.Chunter,
      target: chunter.class.ChatMessage,
      visibilityTester: chunter.function.CanTranslateMessage,
      inline: true,
      context: {
        mode: 'context',
        group: 'edit'
      }
    },
    chunter.action.ShowOriginalMessage
  )
}

function defineChannelActions (builder: Builder): void {
  createAction(
    builder,
    {
      action: chunter.actionImpl.UnarchiveChannel,
      label: chunter.string.UnarchiveChannel,
      icon: view.icon.Archive,
      input: 'focus',
      category: chunter.category.Chunter,
      target: chunter.class.Channel,
      query: {
        archived: true
      },
      context: {
        mode: 'context',
        group: 'tools'
      }
    },
    chunter.action.UnarchiveChannel
  )

  createAction(
    builder,
    {
      action: chunter.actionImpl.ArchiveChannel,
      label: chunter.string.ArchiveChannel,
      icon: view.icon.Archive,
      input: 'focus',
      category: chunter.category.Chunter,
      target: chunter.class.Channel,
      query: {
        archived: false
      },
      override: [view.action.Archive],
      visibilityTester: view.function.CanArchiveSpace,
      context: {
        mode: 'context',
        group: 'remove'
      }
    },
    chunter.action.ArchiveChannel
  )
}
