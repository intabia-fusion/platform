import type { MeasureContext, WorkspaceUuid } from '@hcengineering/core'

export enum QueueTopic {
  // Topic with partitions to split workspace transactions into
  Tx = 'tx',

  // Topic to send workspace information into
  Workspace = 'workspace',

  // A fulltext topic to hold extra fulltext request, like re-indexing requests etc, private to fulltext service.
  Fulltext = 'fulltext',

  // A topic about user activity.
  Users = 'users',

  TelegramBot = 'telegramBot',

  // A topic about calendar events.
  CalendarEventCUD = 'calendarEventCUD',

  // A topic about process events
  Process = 'process',

  // Queue for AI requests
  AIQueue = 'ai-queue',

  // Queue for audio transcription tasks
  TranscriptionQueue = 'transcription-queue',

  // All OTP and notifications to mail/notify services are goes here first
  // And services will take them and send to a proper places.
  NotificationQueue = 'notifications'
}

export interface ConsumerHandle {
  close: () => Promise<void>
  isConnected: () => boolean
}

export interface ConsumerMessage<T> {
  workspace: WorkspaceUuid
  value: T
}

export interface ConsumerControl {
  pause: () => void
  heartbeat: () => Promise<void>
}

export interface PlatformQueue {
  getProducer: <T>(ctx: MeasureContext, topic: QueueTopic | string) => PlatformQueueProducer<T>

  /**
   * Create a consumer for a topic.
   * Return a function to close the receiver.
   *
   * This is the single-message consumer API (original behaviour).
   * For batch processing use `createBatchConsumer`.
   */
  createConsumer: <T>(
    ctx: MeasureContext,
    topic: QueueTopic | string,
    groupId: string,
    onMessage: (ctx: MeasureContext, msg: ConsumerMessage<T>, queue: ConsumerControl) => Promise<void>,
    options?: {
      fromBegining?: boolean
      retryDelay?: number // Initial retry delay in milliseconds (default 1000)
      maxRetryDelay?: number // Maximum retry delay in seconds (default 10)
      sessionTimeout?: number // Maximum time in milliseconds between heartbeats/processing (optional)
    }
  ) => ConsumerHandle

  /**
   * Create a consumer that receives batches of messages.
   * The handler gets an array of messages (in order for a partition).
   * The batch will be retried as a whole in case of processing failures.
   */
  createBatchConsumer: <T>(
    ctx: MeasureContext,
    topic: QueueTopic | string,
    groupId: string,
    onMessage: (ctx: MeasureContext, msgs: ConsumerMessage<T>[], queue: ConsumerControl) => Promise<void>,
    options?: {
      fromBegining?: boolean
      retryDelay?: number // Initial retry delay in milliseconds (default 1000)
      maxRetryDelay?: number // Maximum retry delay in seconds (default 10)
      batchSize?: number // Number of messages to accumulate before flushing
      batchTimeout?: number // Maximum time in milliseconds to wait for batch to fill before flushing
      sessionTimeout?: number // Maximum time in milliseconds between heartbeats/processing (optional)
    }
  ) => ConsumerHandle

  createTopic: (topics: string | string[], partitions: number) => Promise<void>

  createTopics: (tx: number) => Promise<void>

  // If not passed will delete all topica from QueueTopic enum
  deleteTopics: (topics?: (QueueTopic | string)[]) => Promise<void>

  getClientId: () => string

  // Will close all producers and consumers
  shutdown: () => Promise<void>
}

/**
 * Create a producer for a topic.
 */
export interface PlatformQueueProducer<T> {
  send: (ctx: MeasureContext, workspace: WorkspaceUuid, msgs: T[], partitionKey?: string) => Promise<void>
  close: () => Promise<void>

  getQueue: () => PlatformQueue
}
