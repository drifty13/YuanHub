<template>
  <div class="page-stronghold">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header page-header--mobile-context">
        <div class="wrap">
          <h1 class="page-header-title">据点速查</h1>
          <p class="page-header-description">总览各据点每小时产出，查看建筑收益、升级材料与游历奖励。</p>
        </div>
      </header>

      <div class="wrap stronghold-content">
        <section aria-labelledby="stronghold-production">
          <div class="production-overview">
            <div class="section-heading production-heading">
              <h2 id="stronghold-production">每小时合计</h2>
              <p>已建 <b>{{ productionTotals.builtCount }} / {{ cities.length }}</b> 座据点</p>
            </div>
            <dl v-if="productionTotals.products.length" class="production-stats">
              <div v-for="{ product, unit, rateText } in productionTotals.products" :key="product">
                <dt>{{ product }}</dt>
                <dd class="production-rate"><strong>{{ rateText }}</strong> <small>{{ unit }}/时</small></dd>
              </div>
            </dl>
            <p v-else class="section-note">选择据点后点「设为在建」即可计入。</p>
          </div>
          <div class="city-picker" role="group" aria-label="选择据点">
            <button
              v-for="{ city: item, building } in cityOverview"
              :key="item.name"
              type="button"
              :class="{ 'is-unbuilt': !building }"
              :aria-label="cityOptionLabel(item, building)"
              :aria-pressed="item === city"
              @click="selectCity(item)"
            >
              <span class="city-heading">
                <strong>{{ item.name }}</strong>
                <small v-if="building">{{ building.name }} <span>{{ building.level }} 级</span></small>
              </span>
              <template v-if="building">
                <small class="product-label">{{ building.product }}</small>
                <span class="production-rate"><strong>{{ building.rateText }}</strong> <small>{{ building.unit }}/时</small></span>
              </template>
              <small v-else class="city-unbuilt">未建造</small>
            </button>
          </div>
        </section>

        <section class="stronghold-section" aria-labelledby="stronghold-city">
          <div class="section-heading">
            <h2 id="stronghold-city">{{ city.name }}据点</h2>
            <p>等级记在本机浏览器</p>
          </div>
          <p v-if="saveFailed" class="section-note save-note" role="status">无法读取或保存本机记录，刷新页面后本次调整可能丢失。</p>
          <div class="building-picker" role="group" aria-label="查看建筑">
            <button
              v-for="name in cityBuildingNames(city)"
              :key="name"
              type="button"
              :aria-pressed="selectedBuildingName === name"
              aria-controls="stronghold-building"
              @click="selectedBuildingName = name"
            >
              <span>{{ name }} <small>{{ buildingLevel(city, name) }} 级</small></span>
              <small v-if="activeBuilding?.name === name" class="current-badge">在建</small>
            </button>
          </div>
          <article id="stronghold-building" class="stronghold-card building-card" aria-labelledby="stronghold-building-title">
            <div class="building-heading">
              <div>
                <h3 id="stronghold-building-title">{{ selectedBuilding.name }}</h3>
                <small class="product-label">产出 {{ selectedBuilding.product }}</small>
              </div>
              <div class="building-actions">
                <div class="building-action-row">
                  <small v-if="isSelectedBuildingActive" class="current-badge">在建</small>
                  <button
                    type="button"
                    class="building-action"
                    :class="{ 'building-action-primary': !isSelectedBuildingActive }"
                    :aria-describedby="showReplacement ? 'stronghold-replacement' : undefined"
                    @click="setActiveBuilding(isSelectedBuildingActive ? null : selectedBuilding.name)"
                  >{{ isSelectedBuildingActive ? '改为未建造' : '设为在建' }}</button>
                </div>
                <p v-if="showReplacement" id="stronghold-replacement" class="section-note">
                  将替换 {{ activeBuilding.name }}，原建筑停产，等级保留
                </p>
              </div>
            </div>
            <div class="building-details">
              <div class="building-summary">
                <p v-if="!isSelectedBuildingActive" class="section-note">未在建，不计入产出</p>
                <div class="building-rate-row">
                  <div>
                    <p class="building-rate"><strong>{{ hourlyRate(selectedBuilding, selectedBuilding.row) }}</strong> {{ selectedBuilding.unit }}/小时</p>
                    <p class="section-note">{{ productionInterval(selectedBuilding) }}</p>
                  </div>
                  <div class="level-stepper" role="group" :aria-label="`${selectedBuilding.name}等级`">
                    <button type="button" :aria-label="`${selectedBuilding.name}降一级`" :disabled="selectedBuilding.level === 1" @click="changeLevel(-1)">−</button>
                    <output>{{ selectedBuilding.level }} 级</output>
                    <button type="button" :aria-label="`${selectedBuilding.name}升一级`" :disabled="selectedBuilding.level === maxLevel" @click="changeLevel(1)">+</button>
                  </div>
                </div>
                <dl class="building-metrics">
                  <div><dt>存积上限</dt><dd>{{ selectedBuilding.row.storageHours }} 小时</dd></div>
                  <div><dt>满仓可领</dt><dd>{{ fullStorage(selectedBuilding.row) }} {{ selectedBuilding.unit }}</dd></div>
                </dl>
                <div class="building-cost">
                  <template v-if="selectedBuilding.row.nextCost">
                    <div class="upgrade-heading">
                      <strong>升到 {{ selectedBuilding.level + 1 }} 级</strong>
                      <div class="upgrade-materials">
                        <span>乌木 <b>×{{ selectedBuilding.row.nextCost[0] }}</b></span>
                        <span>{{ selectedBuilding.material }} <b>×{{ selectedBuilding.row.nextCost[1] }}</b></span>
                      </div>
                    </div>
                    <p v-if="selectedBuilding.nextRow.storageHours > selectedBuilding.row.storageHours" class="section-note storage-increase">
                      升级后存积上限提高到 {{ selectedBuilding.nextRow.storageHours }} 小时
                    </p>
                    <p class="section-note">升满还需 {{ materialText(selectedBuilding, selectedBuilding.remainingCost) }}</p>
                  </template>
                  <strong v-else>已满级</strong>
                </div>
              </div>
              <div class="level-card">
                <div class="level-scroll" role="region" :aria-label="`${selectedBuilding.name}全部等级`" tabindex="0">
                  <table>
                    <colgroup>
                      <col class="level-column">
                      <col span="3" class="value-column">
                    </colgroup>
                    <colgroup>
                      <col span="2" class="value-column">
                    </colgroup>
                    <thead>
                      <tr>
                        <th rowspan="2" scope="col" class="level-label">等级</th>
                        <th rowspan="2" scope="col">每小时（{{ selectedBuilding.unit }}）</th>
                        <th rowspan="2" scope="col">存积上限（小时）</th>
                        <th rowspan="2" scope="col">满仓可领（{{ selectedBuilding.unit }}）</th>
                        <th colspan="2" scope="colgroup" class="material-group">升到下一级需要</th>
                      </tr>
                      <tr>
                        <th scope="col">乌木</th>
                        <th scope="col">{{ selectedBuilding.material }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(row, index) in selectedBuilding.levels"
                        :key="index"
                        :class="{ 'is-current': index + 1 === selectedBuilding.level, 'is-completed': index + 1 < selectedBuilding.level }"
                      >
                        <th scope="row" class="level-label">
                          {{ index + 1 }} <span v-if="index + 1 === selectedBuilding.level" class="current-badge">当前</span>
                        </th>
                        <td>{{ hourlyRate(selectedBuilding, row) }}</td>
                        <td>
                          <strong v-if="row.storageHours > selectedBuilding.levels[index - 1]?.storageHours" class="storage-increase">
                            {{ row.storageHours }}<span aria-hidden="true">↑</span>
                          </strong>
                          <template v-else>{{ row.storageHours }}</template>
                        </td>
                        <td>{{ fullStorage(row) }}</td>
                        <template v-if="row.nextCost">
                          <td>{{ row.nextCost[0] }}</td>
                          <td>{{ row.nextCost[1] }}</td>
                        </template>
                        <td v-else colspan="2" class="max-level">已满级</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="section-note level-note">
                  满仓可领按配置推算 · 初建需要 乌木 <span>{{ buildCost[0] }}</span>、{{ selectedBuilding.material }} <span>{{ buildCost[1] }}</span>
                </p>
              </div>
            </div>
          </article>
        </section>

        <section class="stronghold-section" aria-labelledby="stronghold-travel">
          <div class="section-heading">
            <h2 id="stronghold-travel">游历奖励</h2>
            <p aria-live="polite">
              <template v-if="activeBuilding">在建 {{ activeBuilding.name }} {{ activeBuilding.level }} 级 · {{ currentTier + 1 }} 星档</template>
              <template v-else>未建造，暂无当前档位</template>
              <template v-if="sameRewards"> · 本城三档奖励相同</template>
            </p>
          </div>
          <div class="reward-grid">
            <article
              v-for="(rewards, index) in city.rewards"
              :key="index"
              class="stronghold-card reward-card"
              :class="{ 'is-current': index === currentTier }"
            >
              <h3>
                {{ index + 1 }} 星
                <span class="reward-stars" aria-hidden="true">{{ '★'.repeat(index + 1) }}<span>{{ '☆'.repeat(2 - index) }}</span></span>
                <small v-if="index === currentTier" class="current-badge">当前档位</small>
              </h3>
              <p class="section-note">在建建筑 {{ tierRanges[index] }} 级</p>
              <ul>
                <li v-for="item in rewards" :key="item"><span>{{ item }}</span><span>×1</span></li>
              </ul>
            </article>
          </div>
          <p class="section-note">每次游历消耗 10 体力，体力足够即可继续游历。</p>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, shallowRef } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { buildings, buildCost, cities } from '../../data/stronghold.js'

const levelsStorageKey = 'yuanhub:stronghold:levels'
const activeStorageKey = 'yuanhub:stronghold:active'
const maxLevel = 10
const tierRanges = ['1–3', '4–6', '7–10']
const productionOrder = ['商行', '书馆', '歌楼', '驿馆', '织户']
const numberFormat = new Intl.NumberFormat('zh-CN')
const city = shallowRef(cities[1])
const saveFailures = ref({})
const saveFailed = computed(() => saveFailures.value[levelsStorageKey] || saveFailures.value[activeStorageKey])

function readRecord(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored
  } catch {
    saveFailures.value[key] = true
  }
  return {}
}

function saveRecord(key, record) {
  try {
    localStorage.setItem(key, JSON.stringify(record))
    saveFailures.value[key] = false
  } catch {
    saveFailures.value[key] = true
  }
}

const levels = ref(readRecord(levelsStorageKey))
const storedActiveBuildings = readRecord(activeStorageKey)
const activeBuildings = ref({})
for (const item of cities) {
  const name = storedActiveBuildings[item.name]
  if (cityBuildingNames(item).includes(name)) activeBuildings.value[item.name] = name
}

function cityBuildingNames(item) {
  return ['商行', '书馆', item.specialty]
}

function buildingLevel(item, name) {
  const stored = levels.value[item.name]?.[name]
  return Number.isInteger(stored) && stored >= 1 && stored <= maxLevel ? stored : 1
}

const cityOverview = computed(() => cities.map(item => {
  const name = activeBuildings.value[item.name]
  if (!name) return { city: item, building: null }

  const { product, unit, levels: rows } = buildings[name]
  const level = buildingLevel(item, name)
  const rate = productionRate(rows[level - 1])
  const rateText = formatHourlyRate(rate, unit)
  return { city: item, building: { name, level, product, unit, rate, rateText } }
}))
const productionTotals = computed(() => {
  const totals = new Map()
  let builtCount = 0
  for (const { building } of cityOverview.value) {
    if (!building) continue
    totals.set(building.name, (totals.get(building.name) ?? 0) + building.rate)
    builtCount += 1
  }
  const products = productionOrder.filter(name => totals.get(name) > 0).map(name => {
    const { product, unit } = buildings[name]
    return { product, unit, rateText: formatHourlyRate(totals.get(name), unit) }
  })
  return { products, builtCount }
})

const activeBuilding = computed(() => cityOverview.value.find(item => item.city === city.value).building)
const selectedBuildingName = ref(activeBuilding.value?.name ?? '商行')
const isSelectedBuildingActive = computed(() => activeBuilding.value?.name === selectedBuildingName.value)
const showReplacement = computed(() => Boolean(activeBuilding.value) && !isSelectedBuildingActive.value)
const selectedBuilding = computed(() => {
  const name = selectedBuildingName.value
  const building = buildings[name]
  const level = buildingLevel(city.value, name)
  const remainingCost = [0, 0]
  for (const { nextCost } of building.levels.slice(level - 1, maxLevel - 1)) {
    remainingCost[0] += nextCost[0]
    remainingCost[1] += nextCost[1]
  }
  return { ...building, name, level, row: building.levels[level - 1], nextRow: building.levels[level], remainingCost }
})
const currentTier = computed(() => {
  if (!activeBuilding.value) return null
  const { level } = activeBuilding.value
  return level >= 7 ? 2 : level >= 4 ? 1 : 0
})
const sameRewards = computed(() => {
  const [first, ...others] = city.value.rewards
  return others.every(items => items.length === first.length && items.every((item, index) => item === first[index]))
})

function selectCity(item) {
  city.value = item
  selectedBuildingName.value = activeBuilding.value?.name ?? '商行'
}

function cityOptionLabel(item, building) {
  const name = item.alias ? `${item.name}，又作${item.alias}` : item.name
  const status = building ? `在建 ${building.name} ${building.level} 级，产出 ${building.product} ${building.rateText}${building.unit}/时` : '未建造，无产出'
  return `${name}，${status}`
}

function changeLevel(delta) {
  const building = selectedBuilding.value
  const nextLevel = building.level + delta
  if (nextLevel < 1 || nextLevel > maxLevel) return

  const cityName = city.value.name
  levels.value[cityName] = { ...levels.value[cityName], [building.name]: nextLevel }
  saveRecord(levelsStorageKey, levels.value)
}

function setActiveBuilding(name) {
  const cityName = city.value.name
  if (name === null) delete activeBuildings.value[cityName]
  else activeBuildings.value[cityName] = name
  saveRecord(activeStorageKey, activeBuildings.value)
}

function productionRate(row) {
  return row.yieldAmount * 3600 / row.secondsPerYield
}

function formatHourlyRate(rate, unit) {
  return unit === '枚' ? numberFormat.format(Math.round(rate)) : rate.toFixed(1)
}

function hourlyRate(building, row) {
  return formatHourlyRate(productionRate(row), building.unit)
}

function fullStorage(row) {
  return numberFormat.format(Math.floor(row.storageHours * 3600 / row.secondsPerYield) * row.yieldAmount)
}

function productionInterval({ row, unit }) {
  if (unit === '枚') return `每分钟 ${row.yieldAmount} 枚`
  const minutes = Math.floor(row.secondsPerYield / 60)
  const seconds = row.secondsPerYield % 60
  const interval = seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`
  return `约每 ${interval}产出 1 件`
}

function materialText(building, [wood, material]) {
  return `乌木 ×${wood} · ${building.material} ×${material}`
}
</script>

<style scoped>
.stronghold-content {
  min-width: 0;
  padding-block: 12px 48px;
}

.stronghold-content :where(h2, h3, p, dl, dd, ul) {
  margin: 0;
}

.stronghold-content :is(h2, h3) {
  font-family: var(--font-s);
}

.stronghold-content h2 { font-size: 20px; }
.stronghold-content h3 { font-size: 17px; }

.city-picker {
  display: grid;
  grid-auto-rows: 1fr;
  gap: 8px;
  padding: 4px;
  margin-inline: -4px;
}

.stronghold-content button {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.stronghold-content button[aria-pressed="true"],
.reward-card.is-current {
  border-color: var(--theme-focus, var(--accent));
}

.stronghold-content button[aria-pressed="true"] { font-weight: 700; }
.stronghold-content button:disabled { opacity: .45; cursor: default; }

.stronghold-content :is(button, .level-scroll):focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 2px;
}

.city-picker button {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(20px, auto) minmax(24px, 1fr);
  align-items: start;
  justify-items: start;
  gap: 4px;
  min-height: 44px;
  padding: 8px;
  text-align: start;
}

.city-heading {
  display: flex;
  justify-content: space-between;
  justify-self: stretch;
  align-items: baseline;
  column-gap: 4px;
}

.city-heading strong { font-family: var(--font-s); white-space: nowrap; }
.city-heading small { text-align: end; }
.city-heading small span { white-space: nowrap; }

.city-picker button.is-unbuilt { border-style: dashed; }
.city-unbuilt { grid-row: 2 / span 2; align-self: center; }

.stronghold-content small,
.production-stats dt,
.building-metrics dt,
.section-note,
.section-heading p {
  color: var(--ink-60);
  font: 400 12px/1.6 var(--font-b);
}

.city-picker button[aria-pressed="true"] {
  border-color: var(--theme-focus, var(--tea));
  background: color-mix(in srgb, var(--yellow) 45%, var(--surface));
  color: var(--theme-strong-text, var(--tea));
}

.city-picker button[aria-pressed="true"]::after {
  position: absolute;
  right: 8px;
  bottom: 0;
  left: 8px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--theme-focus, var(--tea));
  content: '';
}

@media (hover: hover) {
  .city-picker button:hover:not([aria-pressed="true"]) { background: var(--cream); }
}

.stronghold-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}

.section-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 8px;
}

.production-overview {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--cream);
}

.production-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.production-stats > div { flex: 1 1 auto; }

.production-rate {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 4px;
}

.production-rate > * { white-space: nowrap; }

.production-rate strong {
  color: var(--theme-strong-text, var(--tea));
  font: 800 19px/1.2 var(--font-d);
  font-variant-numeric: tabular-nums;
}

.production-stats .production-rate strong { font-size: 22px; }

.reward-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.building-card,
.building-details,
.building-summary {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.building-heading,
.building-rate-row,
.building-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.building-heading,
.building-rate-row { justify-content: space-between; }
.building-actions { margin-inline-start: auto; text-align: end; }
.building-action-row { justify-content: flex-end; }

.stronghold-content .building-action {
  min-height: var(--control-h-lg);
  padding-inline: 10px;
  border-color: transparent;
  background: transparent;
  color: var(--ink-60);
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.stronghold-content .building-action-primary {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--on-strong);
  font-weight: 700;
  text-decoration: none;
}

.save-note { margin-bottom: 8px; }

.stronghold-content .product-label {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--yellow) 40%, var(--surface));
  color: var(--theme-strong-text, var(--tea));
}

.city-picker .product-label { margin-top: 0; }

.level-stepper {
  display: grid;
  flex: none;
  grid-template-columns: auto 3.5em auto;
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: 10px;
  white-space: nowrap;
}

.level-stepper button {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  font-size: 20px;
}

.level-stepper button:first-child { border-radius: 9px 0 0 9px; }
.level-stepper button:last-child { border-radius: 0 9px 9px 0; }

.level-stepper output {
  display: grid;
  place-items: center;
  padding-inline: 6px;
  border-inline: 1px solid var(--line);
  font-weight: 700;
}

.production-heading b,
.building-picker small,
.level-stepper output,
.building-metrics dd,
.upgrade-materials b,
.level-scroll :is(th[scope="row"], td),
.level-note span,
.reward-card li span:last-child {
  font-family: var(--font-d);
  font-variant-numeric: tabular-nums;
}

@media (hover: hover) {
  .level-stepper button:hover:not(:disabled),
  .building-picker button:hover:not([aria-pressed="true"]) {
    background: var(--cream);
  }
  .stronghold-content .building-action:hover { color: var(--ink); }
  .stronghold-content .building-action-primary:hover {
    background: var(--tea-deep);
    color: var(--on-strong);
  }
}

.building-rate strong {
  font: 800 28px/1.2 var(--font-d);
  font-variant-numeric: tabular-nums;
  color: var(--theme-strong-text, var(--tea));
}

.building-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.building-metrics dd { font-size: 16px; font-weight: 700; }

.building-cost {
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 8px;
  background: var(--cream);
  font-size: 13px;
}

.upgrade-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 8px;
}

.upgrade-materials {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.upgrade-materials > span {
  padding-inline: 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  white-space: nowrap;
}

.storage-increase { color: var(--theme-accent-text, var(--accent-strong)); }

.building-picker {
  display: flex;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  margin-bottom: 8px;
  padding: 4px;
  border-radius: 10px;
  background: var(--paper);
}

.building-picker button {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2px 6px;
  padding-inline: 12px;
  border-color: transparent;
  background: transparent;
}

.building-picker button[aria-pressed="true"] {
  background: var(--theme-highlight, var(--surface));
  color: var(--theme-strong-text, var(--tea));
}

.building-picker button > span { white-space: nowrap; }

.level-card { min-width: 0; }
.level-scroll { overflow-x: auto; overscroll-behavior-inline: contain; }

.level-scroll table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.level-column { width: 14%; }
.value-column { width: 17.2%; }

.level-scroll :is(th, td) {
  padding: 8px 22px 8px 10px;
  border-bottom: 1px solid var(--line);
  text-align: right;
}

.level-scroll .level-label {
  padding-right: 10px;
  text-align: left;
  white-space: nowrap;
}

.level-scroll .material-group,
.level-scroll .max-level {
  padding-inline: 10px;
  text-align: center;
}

.level-scroll .storage-increase { white-space: nowrap; }
.level-scroll .storage-increase span { margin-inline-start: 2px; }
.level-scroll thead { background: var(--cream); }
.level-scroll :is(.is-completed, .max-level) { color: var(--ink-60); }
.level-scroll tbody th { font-weight: 400; }
.level-scroll .is-current th {
  font-weight: 700;
  box-shadow: inset 3px 0 var(--theme-focus, var(--accent));
}

.stronghold-content .current-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--theme-accent-bg, var(--yellow));
  color: var(--theme-strong-text, var(--tea));
  font: 700 11px/1.5 var(--font-b);
  white-space: nowrap;
}

.reward-card.is-current,
tr.is-current {
  background: var(--theme-highlight, var(--paper));
  color: var(--theme-strong-text, var(--tea));
}

.level-card > .section-note,
.reward-grid + .section-note { margin-top: 8px; }

.reward-card h3 {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
}

.reward-stars { color: var(--theme-accent-text, var(--accent)); font-size: 13px; }
.reward-stars span { color: var(--ink-60); }

.reward-card ul {
  padding: 0;
  margin-top: 8px;
  list-style: none;
}

.reward-card li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-block: 4px;
}

.reward-card li + li { border-top: 1px solid var(--line); }
.reward-card li span:last-child { flex: none; }
</style>

<style scoped src="./strongholdPageDesktop.css"></style>
<style scoped src="./strongholdPageMobile.css"></style>
