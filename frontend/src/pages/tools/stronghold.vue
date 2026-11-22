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
            <small>爵位 {{ item.rank }}</small>
          </button>
        </div>

        <section class="stronghold-card city-summary" aria-labelledby="stronghold-city" aria-live="polite">
          <h2 id="stronghold-city">{{ city.name }} <small v-if="city.alias">又作 {{ city.alias }}</small></h2>
          <dl>
            <div>
              <dt>解锁条件</dt>
              <dd>
                爵位 {{ city.rank }} 级
                <template v-if="city.prerequisites.length"> · 需{{ city.prerequisites.join('、') }}建立据点</template>
              </dd>
            </div>
            <div>
              <dt>重建道具</dt>
              <dd>{{ city.rebuild.join('、') }}</dd>
            </div>
          </dl>
        </section>

        <section class="stronghold-section" aria-labelledby="stronghold-yields">
          <div class="section-heading">
            <h2 id="stronghold-yields">建筑收益</h2>
            <p>调整等级可立即查看变化，等级保存在当前浏览器。</p>
          </div>
          <p v-if="saveFailed" class="section-note" role="status">无法保存等级，刷新页面后本次调整可能丢失。</p>
          <div class="stronghold-cards">
            <article v-for="building in cityBuildings" :key="building.name" class="stronghold-card building-card">
              <div class="building-heading">
                <div>
                  <h3>{{ building.name }}</h3>
                  <small>产出 {{ building.product }}</small>
                </div>
                <div class="level-stepper" role="group" :aria-label="`${building.name}等级`">
                  <button type="button" :aria-label="`${building.name}降一级`" :disabled="building.level === 1" @click="changeLevel(building, -1)">−</button>
                  <output>{{ building.level }} 级</output>
                  <button type="button" :aria-label="`${building.name}升一级`" :disabled="building.level === maxLevel" @click="changeLevel(building, 1)">+</button>
                </div>
              </div>
              <div class="building-production">
                <p class="building-rate"><strong>{{ hourlyRate(building, building.row) }}</strong> {{ building.unit }}/小时</p>
                <p class="section-note">{{ productionInterval(building) }}</p>
              </div>
              <dl class="building-metrics">
                <div><dt>存积上限</dt><dd>{{ building.row.storageHours }} 小时</dd></div>
                <div>
                  <dt>满仓可领</dt>
                  <dd>{{ fullStorage(building.row) }} {{ building.unit }} <small>按配置推算</small></dd>
                </div>
              </dl>
              <div class="building-cost">
                <template v-if="building.row.nextCost">
                  <p>升到 {{ building.level + 1 }} 级</p>
                  <strong>{{ materialText(building, building.row.nextCost) }}</strong>
                  <p v-if="building.nextRow.storageHours > building.row.storageHours" class="section-note">
                    升级后存积上限提高到 {{ building.nextRow.storageHours }} 小时
                  </p>
                </template>
                <strong v-else>已满级</strong>
              </div>
            </article>
          </div>
        </section>

        <section class="stronghold-section" aria-labelledby="stronghold-levels">
          <div class="section-heading">
            <h2 id="stronghold-levels">全部等级</h2>
          </div>
          <div class="stronghold-card level-card">
            <div class="building-picker" role="group" aria-label="选择建筑">
              <button
                v-for="building in cityBuildings"
                :key="building.name"
                type="button"
                :aria-pressed="tableBuilding === building.name"
                @click="tableBuilding = building.name"
              >{{ building.name }}</button>
            </div>
            <div class="level-scroll" role="region" :aria-label="`${selectedBuilding.name}全部等级`" tabindex="0">
              <table>
                <thead>
                  <tr>
                    <th scope="col">等级</th>
                    <th scope="col">每小时（{{ selectedBuilding.unit }}）</th>
                    <th scope="col">存积上限</th>
                    <th scope="col">满仓可领（{{ selectedBuilding.unit }}）</th>
                    <th scope="col">升到下一级需要</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in selectedBuilding.levels" :key="index" :class="{ 'is-current': index + 1 === selectedBuilding.level }">
                    <th scope="row">{{ index + 1 }} 级<span v-if="index + 1 === selectedBuilding.level">（当前）</span></th>
                    <td>{{ hourlyRate(selectedBuilding, row) }}</td>
                    <td>{{ row.storageHours }} 小时</td>
                    <td>{{ fullStorage(row) }}</td>
                    <td>{{ row.nextCost ? materialText(selectedBuilding, row.nextCost) : '已满级' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="section-note">满仓可领按配置推算。初建需要 {{ materialText(selectedBuilding, buildCost) }}。</p>
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
              <h3>{{ index + 1 }} 星 <small v-if="index === currentTier">当前档位</small></h3>
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
  return { ...building, name, level, row: building.levels[level - 1], nextRow: building.levels[level] }
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
  return `乌木 ×${wood}　${building.material} ×${material}`
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
.stronghold-content h3 { font-size: 16px; }

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

.stronghold-content button:hover:not(:disabled),
.stronghold-content button[aria-pressed="true"],
.reward-card.is-current {
  border-color: var(--theme-focus, var(--accent));
}

.reward-card.is-current,
tr.is-current {
  background: var(--theme-highlight, var(--paper));
  color: var(--theme-strong-text, var(--tea));
}

.stronghold-content button[aria-pressed="true"] { font-weight: 700; }
.stronghold-content button:disabled { opacity: .45; cursor: default; }

.stronghold-content :is(button, .level-scroll):focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 2px;
}

.city-picker button {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 2px;
  min-height: 54px;
  padding: 6px 2px;
}

.stronghold-content small,
.section-note,
.section-heading p {
  color: var(--ink-60);
  font: 400 12px/1.6 var(--font-b);
}

.city-picker button[aria-pressed="true"] {
  background: var(--theme-control-bg, var(--tea));
  color: var(--on-strong);
}

.city-picker button[aria-pressed="true"] small { color: inherit; }

.stronghold-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}

.city-summary { margin-top: 12px; }
.city-summary dl { display: grid; gap: 4px; }
.city-summary dl div { display: flex; gap: 4px 12px; flex-wrap: wrap; }
.city-summary dt { font-weight: 700; }
.city-summary dd { color: var(--ink-60); }

.stronghold-section { margin-top: 24px; }

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

.level-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.level-stepper button {
  padding: 0;
  font-size: 20px;
}

.building-rate strong {
  font: 800 28px/1.2 var(--font-d);
  font-variant-numeric: tabular-nums;
  color: var(--theme-strong-text, var(--tea));
}

.building-metrics {
  display: grid;
  gap: 4px;
  font-size: 13px;
}

.building-metrics div { display: flex; flex-wrap: wrap; gap: 2px 12px; }
.building-metrics dd { font-weight: 700; }
.building-metrics dd small { white-space: nowrap; }

.building-cost {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  font-size: 13px;
}

.building-picker {
  display: flex;
  gap: 8px;
  padding: 4px;
  margin-bottom: 8px;
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
  box-shadow: 0 1px 3px rgba(var(--theme-shadow-rgb, 73, 59, 44), .2);
}

.level-scroll { overflow-x: auto; overscroll-behavior-inline: contain; }

.level-scroll table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.level-scroll :is(th, td) {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}

.level-scroll :is(th, td):nth-child(n+2):nth-child(-n+4) { text-align: right; }
.level-scroll thead { background: var(--cream); }
.level-scroll tbody th { font-weight: 400; }
.level-scroll .is-current th {
  font-weight: 700;
  box-shadow: inset 3px 0 var(--theme-focus, var(--accent));
}
.level-card > .section-note,
.stronghold-cards + .section-note { margin-top: 8px; }

.reward-card ul {
  display: grid;
  gap: 4px;
  padding: 0;
  margin-top: 8px;
  list-style: none;
}

.reward-card li { display: flex; justify-content: space-between; gap: 8px; }
.reward-card li span:last-child { flex: none; }
.reward-card.is-current h3 small { color: inherit; font-weight: 700; }
</style>

<style scoped src="./strongholdPageDesktop.css"></style>
<style scoped src="./strongholdPageMobile.css"></style>
