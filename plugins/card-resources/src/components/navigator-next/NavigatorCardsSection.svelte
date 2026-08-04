<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
-->

<script lang="ts">
  import { Card, CardSpace, FavoriteCard, MasterTag } from '@hcengineering/card'
  import { Ref, SortingOrder, Timestamp } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import ui, { ModernButton } from '@hcengineering/ui'

  import type { CardsNavigatorConfig } from '../../types'
  import NavigatorType from './NavigatorType.svelte'
  import NavigatorCard from './NavigatorCard.svelte'

  export let type: MasterTag
  export let config: CardsNavigatorConfig
  export let applicationId: string
  export let favorites: FavoriteCard[]
  export let space: CardSpace | undefined = undefined
  export let selectedType: Ref<MasterTag> | undefined = undefined
  export let selectedCard: Ref<Card> | undefined = undefined

  const cardsQuery = createQuery()

  let cards: Card[] = []
  let isLoading: boolean = true
  let hasMore = false

  let sort: 'alphabetical' | 'recent' | undefined
  $: sort = config.specialSorting?.[type._id] ?? config.defaultSorting ?? 'alphabetical'

  let limit = config.limit

  function parseLookbackDuration (input: string): Timestamp {
    if (input.length < 2) throw new Error('Invalid duration format')

    const unit = input.slice(-1)
    const numberPart = input.slice(0, -1)
    const value = Number(numberPart)

    if (isNaN(value) || value <= 0) throw new Error('Invalid numeric value')

    const multipliers: Record<string, number> = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000
    }

    const multiplier = multipliers[unit]

    if (!multiplier) throw new Error(`Unsupported time unit: ${unit}`)

    return value * multiplier
  }

  $: cardsQuery.query<Card>(
    type._id,
    {
      ...(space !== undefined ? { space: space._id } : {}),
      ...(config.lookback !== undefined
        ? { modifiedOn: { $gte: Date.now() - parseLookbackDuration(config.lookback) } }
        : {})
    },
    (res) => {
      const cardsResult = res
      hasMore = res.length === limit + 1
      if (hasMore) {
        cardsResult.pop()
      }
      cards = cardsResult
      isLoading = false
    },
    {
      limit: limit + 1,
      sort: sort === 'alphabetical' ? { title: SortingOrder.Ascending } : { modifiedOn: SortingOrder.Descending }
    }
  )

  $: filteredCards = filterCards(cards, favorites)
  $: sortedCards = filteredCards
  $: empty = sortedCards.length === 0

  function filterCards (cards: Card[], favorites: FavoriteCard[]): Card[] {
    return cards.filter((it) => !favorites.some((fav) => fav.attachedTo === it._id))
  }
</script>

{#if !isLoading}
  {#if !empty || config.hideEmpty !== true || config.fixedTypes?.includes(type._id)}
    <NavigatorType
      {type}
      {config}
      {space}
      {selectedType}
      {empty}
      active={sortedCards.some((it) => it._id === selectedCard)}
      on:selectType
      on:selectCard
    >
      {#each sortedCards as card (card._id)}
        {@const favorite = favorites.find((fav) => fav.attachedTo === card._id)}
        <NavigatorCard type={type._id} {card} {favorite} {applicationId} {selectedCard} {config} on:selectCard />
      {/each}

      <svelte:fragment slot="visible" let:isOpen>
        {@const visibleItem = sortedCards.find(({ _id }) => _id === selectedCard)}
        {#if visibleItem !== undefined && !isOpen}
          {@const favorite = favorites.find((fav) => fav.attachedTo === visibleItem._id)}
          <NavigatorCard card={visibleItem} {favorite} {applicationId} {selectedCard} {config} on:selectCard />
        {/if}
      </svelte:fragment>

      {#if hasMore}
        <div class="show-more">
          <ModernButton
            label={ui.string.ShowMore}
            kind="tertiary"
            inheritFont
            size="extra-small"
            on:click={(e) => {
              e.stopPropagation()
              e.preventDefault()
              limit += config.limit
            }}
          />
        </div>
      {/if}
    </NavigatorType>
  {/if}
{/if}

<style lang="scss">
  .show-more {
    margin: var(--spacing-1);
    font-size: 0.75rem;
  }
</style>
