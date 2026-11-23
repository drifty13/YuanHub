import { ITEM_CATALOG } from './inventory/catalog.js'
import { cities } from './stronghold.js'

const excludedRewards = new Set(['突破材料包', '突破材料自选包'])
const itemIdByName = new Map(ITEM_CATALOG.map(item => [item.name, item.id]))
const citiesById = new Map()

for (const city of cities) {
  for (const reward of new Set(city.rewards.flat())) {
    const id = itemIdByName.get(reward)
    if (!id || excludedRewards.has(reward)) continue
    if (!citiesById.has(id)) citiesById.set(id, [])
    citiesById.get(id).push(city.name)
  }
}

export function strongholdMaterialCities(id) {
  return citiesById.get(id) || []
}
