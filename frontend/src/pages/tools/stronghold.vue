<template>
  <div class="page-stronghold">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header page-header--mobile-context">
        <div class="wrap">
          <h1 class="page-header-title">据点速查</h1>
          <p class="page-header-description">按城市查看建筑产量、存积上限、升级材料与游历奖励。</p>
        </div>
      </header>

      <div class="wrap stronghold-content">
        <div class="city-picker" role="group" aria-label="选择城市">
          <button
            v-for="item in cities"
            :key="item.name"
            type="button"
            :aria-label="`${item.name}${item.alias ? `，又作${item.alias}` : ''}，爵位 ${item.rank} 级解锁`"
            :aria-pressed="item === city"
            @click="selectCity(item)"
          >
            <strong>{{ item.name }}</strong>
            <small>爵位 <b>{{ item.rank }}</b></small>
          </button>
        </div>

        <section class="stronghold-section" aria-labelledby="stronghold-yields">
          <div class="section-heading">
            <h2 id="stronghold-yields">建筑收益</h2>
            <p>等级记在本机浏览器</p>
          </div>
          <p v-if="saveFailed" class="section-note" role="status">无法保存等级，刷新页面后本次调整可能丢失。</p>
          <div class="stronghold-cards">
            <article v-for="building in cityBuildings" :key="building.name" class="stronghold-card building-card">
              <div class="building-heading">
                <div>
                  <h3>{{ building.name }}</h3>
                  <small class="product-label">产出 {{ building.product }}</small>
                </div>
                <div class="level-stepper" role="group" :aria-label="`${building.name}等级`">
                  <button type="button" :aria-label="`${building.name}降一级`" :disabled="building.level === 1" @click="changeLevel(building, -1)">−</button>
                  <output>{{ building.level }} 级</output>
                  <button type="button" :aria-label="`${building.name}升一级`" :disabled="building.level === maxLevel" @click="changeLevel(building, 1)">+</button>
                </div>
              </div>
              <div class="building-stats">
                <div>
                  <p class="building-rate"><strong>{{ hourlyRate(building, building.row) }}</strong> {{ building.unit }}/小时</p>
                  <p class="section-note">{{ productionInterval(building) }}</p>
                </div>
                <dl class="building-metrics">
                  <div><dt>存积上限</dt><dd>{{ building.row.storageHours }} 小时</dd></div>
                  <div><dt>满仓可领</dt><dd>{{ fullStorage(building.row) }} {{ building.unit }}</dd></div>
                </dl>
              </div>
              <div class="building-cost">
                <template v-if="building.row.nextCost">
                  <div class="upgrade-heading">
                    <strong>升到 {{ building.level + 1 }} 级</strong>
                    <div class="upgrade-materials">
                      <span>乌木 <b>×{{ building.row.nextCost[0] }}</b></span>
                      <span>{{ building.material }} <b>×{{ building.row.nextCost[1] }}</b></span>
                    </div>
                  </div>
                  <p v-if="building.nextRow.storageHours > building.row.storageHours" class="section-note storage-increase">
                    升级后存积上限提高到 {{ building.nextRow.storageHours }} 小时
                  </p>
                  <p class="section-note">升满还需 {{ materialText(building, building.remainingCost) }}</p>
                </template>
                <strong v-else>已满级</strong>
              </div>
            </article>
          </div>
        </section>

        <section class="stronghold-section" aria-labelledby="stronghold-levels">
          <div class="section-heading level-heading">
            <h2 id="stronghold-levels">全部等级</h2>
            <div class="building-picker" role="group" aria-label="选择建筑">
              <button
                v-for="building in cityBuildings"
                :key="building.name"
                type="button"
                :aria-pressed="tableBuilding === building.name"
                @click="tableBuilding = building.name"
              >{{ building.name }}</button>
            </div>
          </div>
          <div class="stronghold-card level-card">
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
        </section>

        <section class="stronghold-section" aria-labelledby="stronghold-travel">
          <div class="section-heading">
            <h2 id="stronghold-travel">游历奖励</h2>
            <p aria-live="polite">
              最高建筑 {{ highestLevel }} 级 · {{ currentTier + 1 }} 星档
              <template v-if="sameRewards"> · 本城三档奖励相同</template>
            </p>
          </div>
          <div class="stronghold-cards reward-grid">
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
              <p class="section-note">最高建筑 {{ tierRanges[index] }} 级</p>
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

const storageKey = 'yuanhub:stronghold:levels'
const maxLevel = 10
const tierRanges = ['1–3', '4–6', '7–10']
const numberFormat = new Intl.NumberFormat('zh-CN')
const city = shallowRef(cities[1])
const tableBuilding = ref('商行')
const saveFailed = ref(false)

function readLevels() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored
  } catch {
    // 无法读取时使用默认等级。
  }
  return {}
}

const levels = ref(readLevels())
const cityBuildings = computed(() => ['商行', '书馆', city.value.specialty].map(name => {
  const building = buildings[name]
  const stored = levels.value[city.value.name]?.[name]
  const level = Number.isInteger(stored) && stored >= 1 && stored <= maxLevel ? stored : 1
  const remainingCost = [0, 0]
  for (const { nextCost } of building.levels.slice(level - 1, maxLevel - 1)) {
    remainingCost[0] += nextCost[0]
    remainingCost[1] += nextCost[1]
  }
  return { ...building, name, level, row: building.levels[level - 1], nextRow: building.levels[level], remainingCost }
}))
const selectedBuilding = computed(() => cityBuildings.value.find(building => building.name === tableBuilding.value))
const highestLevel = computed(() => Math.max(...cityBuildings.value.map(building => building.level)))
const currentTier = computed(() => highestLevel.value >= 7 ? 2 : highestLevel.value >= 4 ? 1 : 0)
const sameRewards = computed(() => {
  const [first, ...others] = city.value.rewards
  return others.every(items => items.length === first.length && items.every((item, index) => item === first[index]))
})

function selectCity(item) {
  if (item === city.value) return
  tableBuilding.value = '商行'
  city.value = item
}

function changeLevel(building, delta) {
  const nextLevel = building.level + delta
  if (nextLevel < 1 || nextLevel > maxLevel) return

  const cityName = city.value.name
  levels.value[cityName] = { ...levels.value[cityName], [building.name]: nextLevel }
  tableBuilding.value = building.name
  try {
    localStorage.setItem(storageKey, JSON.stringify(levels.value))
    saveFailed.value = false
  } catch {
    saveFailed.value = true
  }
}

function hourlyRate(building, row) {
  const rate = row.yieldAmount * 3600 / row.secondsPerYield
  return building.unit === '枚' ? numberFormat.format(rate) : rate.toFixed(1)
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
  align-content: center;
  justify-items: center;
  gap: 2px;
  min-height: 54px;
  padding: 6px 2px;
}

.city-picker strong { font-family: var(--font-s); }

.stronghold-content small,
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

.city-picker button[aria-pressed="true"] small { color: inherit; }

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

.stronghold-cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.building-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.building-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.stronghold-content .product-label {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--yellow) 40%, var(--surface));
  color: var(--theme-strong-text, var(--tea));
}

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

.city-picker b,
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
}

.building-rate strong {
  font: 800 28px/1.2 var(--font-d);
  font-variant-numeric: tabular-nums;
  color: var(--theme-strong-text, var(--tea));
}

.building-stats {
  display: grid;
  gap: 12px;
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
  margin-top: auto;
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
  padding: 4px;
  border-radius: 10px;
  background: var(--paper);
}

.building-picker button {
  padding-inline: 12px;
  border-color: transparent;
  background: transparent;
}

.building-picker button[aria-pressed="true"] {
  background: var(--theme-highlight, var(--surface));
  color: var(--theme-strong-text, var(--tea));
}

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
.stronghold-cards + .section-note { margin-top: 8px; }

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
