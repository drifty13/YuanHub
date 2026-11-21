import { ITEM_CATALOG } from './inventory/catalog.js'
import { TRAINING_DAILY_LIMIT } from './operatorTraining.js'

const format = value => value.toLocaleString('zh-CN')

export function formatXiuweiTrainingAdvice({ name, stages, runs, days, blocked }, showGroup = false) {
  const advice = []
  if (runs) {
    const layers = [...stages].sort((a, b) => b.level - a.level)
      .map(stage => `第 ${format(stage.level)} 层 ${format(stage.runs)} 次`).join('、')
    const total = days == null ? '' : `，约 ${format(days)} 天`
    const daily = days != null && !showGroup ? `（每日 ${format(TRAINING_DAILY_LIMIT)} 次）` : ''
    let label = showGroup ? '' : '历练补齐：'
    if (blocked.length) label = showGroup ? '当前可刷' : '当前可刷：'
    advice.push(`${label}${layers}，共 ${format(runs)} 次${total}${daily}。`)
  }
  if (blocked.length) {
    const materials = blocked.map(id => ITEM_CATALOG.find(item => item.id === id)?.name || id).join('、')
    advice.push(`${materials} 所需历练层数未开放，可在养成计划的历练设置中调整。`)
  }
  return (showGroup ? `${name}：` : '') + advice.join('')
}
