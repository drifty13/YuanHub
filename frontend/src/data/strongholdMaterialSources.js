import { ITEM_CATALOG } from './inventory/catalog.js'
import { cities } from './stronghold.js'

const excludedRewards = new Set(['突破材料包', '突破材料自选包'])
const itemIdByName = new Map(ITEM_CATALOG.map(item => [item.name, item.id]))
const sourcesById = new Map()

for (const city of cities) {
  for (const reward of new Set(city.rewards.flat())) {
    const id = itemIdByName.get(reward)
    if (!id || excludedRewards.has(reward)) continue
    if (!sourcesById.has(id)) sourcesById.set(id, [])
    sourcesById.get(id).push(`据点·${city.name}游历`)
  }
}

export function strongholdMaterialSource(id) {
  return sourcesById.get(id)?.join('、') || '获取途径待补充'
}
