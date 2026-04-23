import { type Doc, type DocumentQuery, type Rank } from '@hcengineering/core'
import { type Asset } from '@hcengineering/platform'

/**
 * @public
 */
export interface DocWithRank extends Doc {
  rank: Rank
}

export type StateType = any

/**
 * @public
 */
export interface TypeState {
  _id: StateType
  title: string
  color: number
  icon?: Asset
}
/**
 * @public
 */
export type Item = DocWithRank

/**
 * @public
 */
export type CardDragEvent = DragEvent & { currentTarget: EventTarget & HTMLDivElement }

/**
 * @public
 * SwimLane groups kanban rows horizontally, creating a 2D grid categories x swimLanes.
 * `value` is the raw field value used to filter documents and to update on drop.
 */
export interface SwimLane {
  _id: string
  title: string
  color?: number
  icon?: Asset
  value: unknown
}

/**
 * @public
 * Query fragment to filter items that belong to a specific swim lane.
 */
export type SwimLaneQuery = DocumentQuery<DocWithRank>
