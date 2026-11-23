<template>
  <div class="page-stronghold">
    <IslandSidebar />
    <main id="main-content">
      <CompactToolHeader mobile-context title="据点速查">
        <template v-if="auth.isLoggedIn && (account || accountsLoading || accountError)" #account>
          <DataAccountContextBar
            compact :accounts="accounts || []" :account-id="account?.id || ''" :game="account?.game || ''"
            :is-logged-in="auth.isLoggedIn" :loading="accountsLoading" :error="accountError"
          />
        </template>
      </CompactToolHeader>

      <div class="wrap stronghold-content">
        <section class="production-overview" aria-labelledby="stronghold-production">
          <div class="production-totals">
            <div class="totals-heading">
              <h2 id="stronghold-production">每小时合计</h2>
              <p v-if="ready">已建 {{ productionTotals.builtCount }} / {{ cities.length }} 座据点</p>
            </div>
            <ul v-if="productionTotals.products.length" class="production-stats">
              <li v-for="{ name, product, unit, rateText } in productionTotals.products" :key="name" class="production-stat">
                <img
                  v-if="strongholdIcon(product)" class="product-icon" :src="strongholdIcon(product)"
                  width="36" height="36" alt="" aria-hidden="true" loading="lazy" decoding="async"
                  @error="failedStrongholdIcons.add(product)"
                >
                <span v-else class="seal" :data-seal="name[0]" aria-hidden="true">{{ name[0] }}</span>
                <div>
                  <small>{{ product }}</small>
                  <span class="production-rate"><strong>{{ rateText }}</strong><small>{{ unit }}/时</small></span>
                </div>
              </li>
            </ul>
            <div v-else-if="ready" class="production-empty">
              <span class="seal seal-muted" aria-hidden="true">商</span>
              <div>
                <strong>还没有记录当前建筑</strong>
                <p>点一座据点，选好当前建筑，这里就会汇总每小时产出。</p>
              </div>
            </div>
            <p v-else class="section-note">读取据点记录后显示产出。</p>
          </div>

          <div class="city-picker" role="group" aria-label="选择据点">
            <button
              v-for="{ city: item, building, otherBuildings } in cityOverview"
              :key="item.name"
              class="city-card"
              :class="{ 'is-unbuilt': ready && !building }"
              type="button"
              :aria-label="cityOptionLabel(item, building, otherBuildings)"
              :aria-pressed="item === city"
              @click="selectCity(item)"
            >
              <span class="city-heading">
                <strong>{{ item.name }}</strong>
                <span v-if="building" class="city-level">
                  <span class="city-level-text" :class="{ 'max-level-badge': building.level === maxLevel }">
                    {{ building.level === maxLevel ? '满级' : `${building.level} 级` }}
                  </span>
                  <img
                    v-if="strongholdIcon(building.product)" class="product-icon" :src="strongholdIcon(building.product)"
                    width="34" height="34" alt="" aria-hidden="true" loading="lazy" decoding="async"
                    @error="failedStrongholdIcons.add(building.product)"
                  >
                  <span v-else class="seal" :data-seal="building.name[0]" aria-hidden="true">{{ building.name[0] }}</span>
                </span>
              </span>
              <span v-if="building" class="city-output">
                <img
                  v-if="strongholdIcon(building.product)" class="city-output-icon" :src="strongholdIcon(building.product)"
                  width="24" height="24" alt="" aria-hidden="true" loading="lazy" decoding="async"
                  @error="failedStrongholdIcons.add(building.product)"
                >
                <small>{{ building.product }}</small>
                <span class="production-rate"><strong>{{ building.rateText }}</strong><small>{{ building.unit }}/时</small></span>
              </span>
              <small v-else-if="ready" class="city-output">未建</small>
              <span class="city-other-buildings" aria-hidden="true">
                <span
                  v-for="{ name, level, product } in otherBuildings"
                  :key="name"
                  class="city-other-building"
                  :class="{ 'is-unbuilt': level === 0 }"
                >
                  <span v-if="level > 0" class="city-other-level" :class="{ 'max-level-badge': level === maxLevel }">
                    <span class="city-other-level-full">{{ levelLabel(level) }}</span>
                    <span class="city-other-level-short">{{ level === maxLevel ? '满' : level }}</span>
                  </span>
                  <img
                    v-if="strongholdIcon(product)" class="product-icon" :src="strongholdIcon(product)"
                    width="22" height="22" alt="" aria-hidden="true" loading="lazy" decoding="async"
                    @error="failedStrongholdIcons.add(product)"
                  >
                  <span v-else class="seal" :data-seal="name[0]" aria-hidden="true">{{ name[0] }}</span>
                </span>
              </span>
            </button>
          </div>
        </section>

        <section class="stronghold-detail stronghold-section" aria-labelledby="stronghold-city">
          <div class="detail-heading">
            <div>
              <h2 id="stronghold-city">{{ city.name }}据点</h2>
              <p class="section-note">三座建筑只能建一座，切换后各自等级保留</p>
            </div>
            <div class="record-status">
              <p role="status">{{ switchNotice ? `${switchNotice} · ${status}` : status }}</p>
              <button v-if="retryable" class="secondary-button" type="button" @click="retry">重试</button>
            </div>
          </div>
          <p v-if="localFailed" class="section-note save-note" role="status">无法读取或保存本机记录，刷新页面后本次调整可能丢失。</p>

          <div class="building-choices" role="group" :aria-label="`${city.name}的建筑`">
            <article
              v-for="building in cityBuildings"
              :key="building.name"
              class="building-choice"
              :class="{ 'is-active': building.name === activeBuilding?.name, 'is-viewed': building.name === selectedBuildingName, 'is-unbuilt': building.level === 0 }"
            >
              <button
                class="choice-view"
                type="button"
                :aria-pressed="building.name === activeBuilding?.name"
                :aria-label="ready ? `${building.name}，${levelLabel(building.level)}，${building.name === activeBuilding?.name ? '当前建筑' : buildingSelectionHint}` : building.name"
                :aria-disabled="!ready"
                aria-controls="stronghold-building"
                @click="setActiveBuilding(building.name)"
              >
                <img
                  v-if="strongholdIcon(building.product)" class="product-icon" :src="strongholdIcon(building.product)"
                  width="46" height="46" alt="" aria-hidden="true" loading="lazy" decoding="async"
                  @error="failedStrongholdIcons.add(building.product)"
                >
                <span v-else class="seal" :data-seal="building.name[0]" aria-hidden="true">{{ building.name[0] }}</span>
                <span class="choice-copy">
                  <span class="choice-title">
                    {{ building.name }}
                    <small v-if="ready" :class="{ 'max-level-badge': building.level === maxLevel }">
                      {{ levelLabel(building.level) }}
                    </small>
                  </span>
                  <span class="choice-meta">
                    产出{{ building.product }}<template v-if="building.level > 0"> · <b>{{ building.rateText }}</b> {{ building.unit }}/时</template>
                  </span>
                </span>
              </button>
              <div v-if="ready" class="choice-footer">
                <span v-if="building.name === activeBuilding?.name" class="active-tag"><span aria-hidden="true">●</span> 当前建筑</span>
                <span v-else class="section-note">{{ buildingSelectionHint }}</span>
              </div>
            </article>
          </div>

          <div id="stronghold-building">
            <div v-if="ready" class="building-growth">
              <section class="growth-panel" aria-labelledby="stronghold-building-title">
                <h3 id="stronghold-building-title" class="now-label">
                  {{ selectedBuilding.name }} · {{ selectedBuilding.row ? `产出${selectedBuilding.product}` : '未建' }}
                </h3>
                <template v-if="selectedBuilding.row">
                  <dl class="building-facts">
                    <div>
                      <dt>每小时</dt>
                      <dd><strong>{{ hourlyRate(selectedBuilding, selectedBuilding.row) }}</strong> <small>{{ selectedBuilding.unit }}</small></dd>
                    </div>
                    <div>
                      <dt>存积上限</dt>
                      <dd><strong>{{ selectedBuilding.storageHours }}</strong> <small>小时</small></dd>
                    </div>
                    <div>
                      <dt>满仓可领</dt>
                      <dd><strong>{{ fullStorage(selectedBuilding.row) }}</strong> <small>{{ selectedBuilding.unit }}</small></dd>
                    </div>
                  </dl>
                  <p v-if="!activeBuilding" class="not-counted">无当前建筑，不计入合计</p>
                </template>

                <div
                  class="level-progress"
                  :class="{ 'is-max-level': selectedBuilding.level === maxLevel }"
                  :style="{ '--level-fill': `${selectedBuilding.level / maxLevel * 100}%` }"
                  role="group"
                  :aria-label="`${selectedBuilding.name}等级，当前 ${levelLabel(selectedBuilding.level)}`"
                >
                  <div class="level-rail" aria-hidden="true"><div class="level-rail-fill"></div></div>
                  <div class="level-bubble" aria-hidden="true">
                    <span>{{ levelLabel(selectedBuilding.level) }}</span>
                  </div>
                  <button
                    v-for="level in levelSteps"
                    :key="level"
                    type="button"
                    :class="{ filled: level > 0 && level <= selectedBuilding.level }"
                    :aria-label="level === 0 ? '设为未建' : `设为 ${level} 级`"
                    :aria-current="level === selectedBuilding.level ? 'true' : undefined"
                    :disabled="!ready"
                    @click="setLevel(level)"
                  >
                    <span class="level-dot" aria-hidden="true"></span>
                    <span class="level-label">{{ level === 0 ? '未建' : level }}</span>
                  </button>
                </div>
              </section>

              <section class="growth-panel upgrade-panel" aria-labelledby="stronghold-upgrade">
                <template v-if="selectedBuilding.nextRow">
                  <div class="upgrade-heading">
                    <h3 id="stronghold-upgrade">{{ selectedBuilding.level === 0 ? '建造（升到 1 级）' : `升到 ${selectedBuilding.level + 1} 级` }}</h3>
                    <small>共 {{ maxLevel }} 级</small>
                  </div>
                  <dl class="upgrade-gains">
                    <div>
                      <dt>每小时</dt>
                      <dd>
                        <strong>{{ hourlyRate(selectedBuilding, selectedBuilding.row) }} → {{ hourlyRate(selectedBuilding, selectedBuilding.nextRow) }}</strong>
                        <span class="gain-increase">+{{ hourlyIncrease(selectedBuilding) }}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>存积上限</dt>
                      <dd>
                        <strong>{{ selectedBuilding.storageHours }} → {{ selectedBuilding.nextRow.storageHours }} 小时</strong>
                        <span v-if="selectedBuilding.nextRow.storageHours > selectedBuilding.storageHours" class="gain-increase">
                          +{{ selectedBuilding.nextRow.storageHours - selectedBuilding.storageHours }}
                        </span>
                        <small v-else>不变</small>
                      </dd>
                    </div>
                    <div>
                      <dt>满仓可领</dt>
                      <dd><strong>{{ fullStorage(selectedBuilding.nextRow) }} {{ selectedBuilding.unit }}</strong></dd>
                    </div>
                  </dl>
                  <div class="upgrade-materials">
                    <span v-for="(material, index) in ['乌木', selectedBuilding.material]" :key="material">
                      <img
                        v-if="strongholdIcon(material)" :src="strongholdIcon(material)"
                        width="22" height="22" alt="" aria-hidden="true" loading="lazy" decoding="async"
                        @error="failedStrongholdIcons.add(material)"
                      >
                      <span v-else class="material-seal" aria-hidden="true">{{ material === '乌木' ? '木' : material[0] }}</span>
                      {{ material }} <b>×{{ selectedBuilding.nextCost[index] }}</b>
                    </span>
                  </div>
                  <p class="section-note upgrade-remaining">升满还需 {{ materialText(selectedBuilding, selectedBuilding.remainingCost) }}</p>
                </template>
                <div v-else class="max-level">
                  <h3 id="stronghold-upgrade">已满级</h3>
                  <p class="section-note">这座建筑已经升到 {{ maxLevel }} 级</p>
                </div>
              </section>
            </div>

            <details class="level-details">
              <summary>查看全部 {{ maxLevel }} 级数据</summary>
              <table class="level-table" :aria-label="`${selectedBuilding.name}全部等级`">
                <thead>
                  <tr>
                    <th scope="col">等级</th>
                    <th scope="col">每小时（{{ selectedBuilding.unit }}）</th>
                    <th scope="col">存积（小时）</th>
                    <th scope="col" class="storage-column">满仓可领（{{ selectedBuilding.unit }}）</th>
                    <th scope="col">升下一级</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, index) in selectedBuilding.levels"
                    :key="index"
                    :class="{ 'is-current': index + 1 === selectedBuilding.level, 'is-completed': index + 1 < selectedBuilding.level }"
                  >
                    <th scope="row" :aria-current="index + 1 === selectedBuilding.level ? 'true' : undefined">{{ index + 1 }}</th>
                    <td>{{ hourlyRate(selectedBuilding, row) }}</td>
                    <td>
                      <strong v-if="row.storageHours > selectedBuilding.levels[index - 1]?.storageHours" class="storage-increase">
                        {{ row.storageHours }}<span aria-label="提高">↑</span>
                      </strong>
                      <template v-else>{{ row.storageHours }}</template>
                    </td>
                    <td class="storage-column">{{ fullStorage(row) }}</td>
                    <td class="table-material">
                      <template v-if="row.nextCost">
                        <span v-for="(material, costIndex) in ['乌木', selectedBuilding.material]" :key="material">
                          <img
                            v-if="strongholdIcon(material)" :src="strongholdIcon(material)"
                            width="16" height="16" alt="" aria-hidden="true" loading="lazy" decoding="async"
                            @error="failedStrongholdIcons.add(material)"
                          >
                          {{ material }} {{ row.nextCost[costIndex] }}
                        </span>
                      </template>
                      <template v-else>已满级</template>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p class="section-note level-note">
                满仓可领按配置推算 · 初建需要 乌木 <b>{{ buildCost[0] }}</b>、{{ selectedBuilding.material }} <b>{{ buildCost[1] }}</b>
              </p>
            </details>
          </div>
        </section>

        <section class="stronghold-section" aria-labelledby="stronghold-travel">
          <div class="section-heading">
            <h2 id="stronghold-travel">游历奖励</h2>
            <p class="section-note" aria-live="polite">
              <template v-if="activeBuilding">按当前建筑{{ activeBuilding.name }} {{ activeBuilding.level }} 级计算</template>
              <template v-else-if="ready">建好建筑后显示当前档位</template>
              <template v-if="sameRewards">{{ ready ? ' · ' : '' }}本城三档奖励相同</template>
            </p>
          </div>
          <div class="travel-rewards">
            <div class="reward-track">
              <article v-for="(rewards, index) in city.rewards" :key="index" class="reward-tier" :class="{ 'is-current': index === currentTier }">
                <span class="tier-node" aria-hidden="true">{{ index + 1 }}</span>
                <div class="tier-body">
                  <h3>{{ index + 1 }} 星 <span class="reward-stars" aria-hidden="true">{{ '★'.repeat(index + 1) }}</span></h3>
                  <p class="section-note">
                    当前建筑 {{ tierRanges[index] }} 级
                    <strong v-if="index === currentTier" class="tier-current"> · 当前档位</strong>
                  </p>
                  <ul class="tier-items">
                    <li v-for="item in rewards" :key="item" class="reward-item">
                      <span class="reward-icon" aria-hidden="true">
                        <img v-if="rewardIcons.has(item) && !failedRewardIcons.has(item)" :src="rewardIcons.get(item)" alt="" loading="lazy" @error="failedRewardIcons.add(item)">
                        <template v-else>图</template>
                      </span>
                      <small>{{ item }}</small>
                    </li>
                  </ul>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import { useStrongholdRecord } from '../../composables/useStrongholdRecord.js'
import { auth } from '../../store/auth.js'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import { buildings, buildCost, cities } from '../../data/stronghold.js'

const maxLevel = 10
const levelSteps = Array.from({ length: maxLevel + 1 }, (_, level) => level)
const tierRanges = ['1–3', '4–6', '7–10']
const productionOrder = ['商行', '书馆', '歌楼', '驿馆', '织户']
const numberFormat = new Intl.NumberFormat('zh-CN', { useGrouping: false })
const rewardIcons = new Map(ITEM_CATALOG.map(({ id, name }) => [name, `${import.meta.env.BASE_URL}inventory-icons/items/${id}.webp`]))
const failedRewardIcons = ref(new Set())
const strongholdIconFiles = {
  五铢钱: 'wuzhuqian',
  兵书残卷: 'bingshucanjuan',
  粮草: 'liangcao',
  白盐: 'baiyan',
  织物: 'zhiwu',
  乌木: 'wumu',
  漆器: 'qiqi',
  竹书: 'zhushu',
  楚琴: 'chuqin',
  蒲桃酒: 'putaojiu',
  织锦梭: 'zhijinsuo',
}
const failedStrongholdIcons = ref(new Set())
const city = shallowRef(cities[1])
const { accounts, account, accountsLoading, accountError, record, ready, status, retryable, retry, localFailed, update } = useStrongholdRecord()
const switchNotice = ref('')
let switchNoticeTimer

function strongholdIcon(name) {
  const file = strongholdIconFiles[name]
  return file && !failedStrongholdIcons.value.has(name)
    ? `${import.meta.env.BASE_URL}stronghold-icons/${file}.webp`
    : undefined
}

function cityBuildingNames(item) {
  return ['商行', '书馆', item.specialty]
}

function buildingLevel(item, name) {
  if (!ready.value) return null
  const stored = record.value.levels[item.name]?.[name]
  if (Number.isInteger(stored) && stored >= 1 && stored <= maxLevel) return stored
  return record.value.active[item.name] === name ? 1 : 0
}

function levelLabel(level) {
  if (level === 0) return '未建'
  return level === maxLevel ? '满级' : `${level} 级`
}

const cityOverview = computed(() => cities.map(item => {
  const name = ready.value ? record.value.active[item.name] : null
  const otherBuildings = cityBuildingNames(item)
    .filter(buildingName => buildingName !== name)
    .map(buildingName => ({
      name: buildingName,
      level: buildingLevel(item, buildingName),
      product: buildings[buildingName].product,
    }))
  if (!name) return { city: item, building: null, otherBuildings }

  const { product, unit, levels: rows } = buildings[name]
  const level = buildingLevel(item, name)
  const rate = productionRate(rows[level - 1])
  const rateText = formatHourlyRate(rate, unit)
  return { city: item, building: { name, level, product, unit, rate, rateText }, otherBuildings }
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
    return { name, product, unit, rateText: formatHourlyRate(totals.get(name), unit) }
  })
  return { products, builtCount }
})

const cityBuildings = computed(() => cityBuildingNames(city.value).map(name => {
  const { product, unit, levels } = buildings[name]
  const level = buildingLevel(city.value, name)
  const rateText = level > 0 ? formatHourlyRate(productionRate(levels[level - 1]), unit) : null
  return { name, product, unit, level, rateText }
}))

const activeBuilding = computed(() => cityOverview.value.find(item => item.city === city.value).building)
const viewedBuilding = ref(null)
const selectedBuildingName = computed(() => activeBuilding.value?.name ?? viewedBuilding.value ?? '商行')
const buildingSelectionHint = computed(() => activeBuilding.value ? '点击改建为此' : '点击设为当前建筑')
watch([() => auth.userInfo?.id, () => account.value?.id], () => {
  viewedBuilding.value = null
  clearSwitchNotice()
}, { flush: 'sync' })
onUnmounted(() => clearTimeout(switchNoticeTimer))
const selectedBuilding = computed(() => {
  const name = selectedBuildingName.value
  const building = buildings[name]
  const level = buildingLevel(city.value, name)
  if (level === null) return { ...building, name, level }
  const row = level > 0 ? building.levels[level - 1] : null
  const remainingCost = level === 0 ? [...buildCost] : [0, 0]
  for (const { nextCost } of building.levels.slice(Math.max(0, level - 1), maxLevel - 1)) {
    remainingCost[0] += nextCost[0]
    remainingCost[1] += nextCost[1]
  }
  return {
    ...building, name, level, row, nextRow: building.levels[level],
    storageHours: row?.storageHours ?? 0, nextCost: row ? row.nextCost : buildCost, remainingCost,
  }
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
  viewedBuilding.value = null
  clearSwitchNotice()
}

function clearSwitchNotice() {
  clearTimeout(switchNoticeTimer)
  switchNotice.value = ''
}

function showSwitchNotice(message) {
  clearTimeout(switchNoticeTimer)
  switchNotice.value = message
  switchNoticeTimer = setTimeout(clearSwitchNotice, 3000)
}

function cityOptionLabel(item, building, otherBuildings) {
  const name = item.alias ? `${item.name}，又作${item.alias}` : item.name
  const otherBuildingsLabel = otherBuildings.map(({ name, level }) =>
    level === null ? name : `${name} ${levelLabel(level)}`
  ).join('，')
  const otherStatus = `其他建筑：${otherBuildingsLabel}`
  if (!ready.value) return `${name}，建筑：${otherBuildingsLabel}`
  if (!building) return `${name}，未建，无产出，${otherStatus}`
  const levelStatus = building.level === maxLevel ? `${building.level} 级（满级）` : `${building.level} 级`
  return `${name}，当前建筑 ${building.name} ${levelStatus}，产出 ${building.product} ${building.rateText}${building.unit}/时，${otherStatus}`
}

function saveBuildingLevel(cityName, buildingName, level) {
  const levels = { ...record.value.levels }
  const cityLevels = { ...levels[cityName] }
  if (level === 0) delete cityLevels[buildingName]
  else cityLevels[buildingName] = level

  if (Object.keys(cityLevels).length) levels[cityName] = cityLevels
  else delete levels[cityName]
  update('levels', levels)
}

function setLevel(level) {
  if (!ready.value || !Number.isInteger(level) || level < 0 || level > maxLevel) return
  const { name, level: previousLevel } = selectedBuilding.value
  const cityName = city.value.name

  if (level !== previousLevel) saveBuildingLevel(cityName, name, level)
  if (level === 0 && activeBuilding.value?.name === name) {
    const active = { ...record.value.active }
    delete active[cityName]
    viewedBuilding.value = name
    update('active', active)
    showSwitchNotice('已改为未建造')
  } else if (level > 0 && !activeBuilding.value) {
    setActiveBuilding(name)
  }
}

function setActiveBuilding(name) {
  if (!ready.value || name === activeBuilding.value?.name) return
  const cityName = city.value.name
  if (buildingLevel(city.value, name) === 0) saveBuildingLevel(cityName, name, 1)
  viewedBuilding.value = null
  update('active', { ...record.value.active, [cityName]: name })
  showSwitchNotice(`已切换当前建筑：${name}`)
}

function productionRate(row) {
  return row ? row.yieldAmount * 3600 / row.secondsPerYield : 0
}

function formatHourlyRate(rate, unit) {
  return unit === '枚' ? numberFormat.format(Math.round(rate)) : rate.toFixed(1)
}

function hourlyRate(building, row) {
  return row ? formatHourlyRate(productionRate(row), building.unit) : '0'
}

function fullStorage(row) {
  return numberFormat.format(Math.floor(row.storageHours * 3600 / row.secondsPerYield) * row.yieldAmount)
}

function hourlyIncrease({ row, nextRow, unit }) {
  return formatHourlyRate(productionRate(nextRow) - productionRate(row), unit)
}

function materialText(building, [wood, material]) {
  return `乌木 ×${wood} · ${building.material} ×${material}`
}
</script>

<style scoped>
.page-stronghold {
  --stronghold-line: color-mix(in srgb, var(--line) 70%, transparent);
  --stronghold-warm: color-mix(in srgb, var(--yellow) 38%, var(--surface));
  --stronghold-text: var(--theme-strong-text, var(--tea));
  --stronghold-selection: var(--theme-accent-text, var(--tea));
  --stronghold-gain: var(--theme-success-text, #4D7630);
  --stronghold-seal-commerce: var(--accent-strong);
  --stronghold-seal-study: var(--slate);
  --stronghold-seal-song: var(--rouge);
  --stronghold-seal-post: #6B7F4E;
  --stronghold-seal-weave: #7A5C8C;
}

.page-stronghold > main {
  background:
    radial-gradient(circle at 85% 0%, color-mix(in srgb, var(--yellow) 35%, transparent), transparent 40%),
    var(--cream);
}

.stronghold-content {
  min-width: 0;
  padding-block: 4px 56px;
}

.stronghold-content :where(h2, h3, p, dl, dd, ul) { margin: 0; }
.stronghold-content :where(button) {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.stronghold-content :where(button):disabled { opacity: .45; cursor: default; }

.stronghold-content :is(button, summary):focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 2px;
}

.stronghold-section { margin-top: 28px; }

.section-heading,
.detail-heading,
.totals-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px 12px;
}

.section-heading { margin-bottom: 12px; }
.section-heading h2 { font: 700 20px var(--font-s); }

.section-note,
.totals-heading p,
.production-stat small,
.production-rate small,
.city-output small,
.building-facts dt,
.building-facts small,
.upgrade-heading small,
.upgrade-gains dt,
.upgrade-gains small {
  color: var(--ink-60);
  font: 400 12px/1.5 var(--font-b);
}

.production-overview,
.stronghold-detail,
.travel-rewards {
  min-width: 0;
  border: 1px solid var(--stronghold-line);
  background: var(--surface);
}

.production-overview {
  padding: 18px 20px 20px;
  border-radius: 16px;
}

.production-totals {
  display: grid;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--line);
}

.totals-heading h2 { color: var(--ink-60); font: 700 13px var(--font-s); }
.totals-heading p { font-variant-numeric: tabular-nums; }

.production-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  padding: 0;
  list-style: none;
}

.production-stat,
.production-empty {
  display: flex;
  align-items: center;
  gap: 10px;
}

.production-stat .seal { width: 34px; height: 34px; font-size: 15px; }
.product-icon, .upgrade-materials img { flex: none; }
.production-stat small { display: block; line-height: 1.25; }

.production-rate {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 4px;
}

.production-rate > * { white-space: nowrap; }

.production-rate strong {
  color: var(--stronghold-text);
  font: 800 18px/1.15 var(--font-d);
  font-variant-numeric: tabular-nums;
}

.production-stat .production-rate { flex-wrap: nowrap; }
.production-stat .production-rate strong { font-size: 24px; font-weight: 900; }

.production-empty { gap: 14px; padding-block: 4px; }
.production-empty strong { font: 700 15px var(--font-s); }
.production-empty .seal { width: 44px; height: 44px; font-size: 18px; }

.city-picker {
  display: grid;
  grid-auto-rows: 1fr;
  gap: 10px;
  margin-top: 16px;
}

.city-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto 1fr;
  gap: 6px 4px;
  min-width: 0;
  min-height: 92px;
  padding: 12px;
  border: 1px solid var(--stronghold-line);
  border-radius: 12px;
  background: var(--cream);
  text-align: start;
}

.city-heading {
  grid-area: 1 / 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  min-height: 24px;
}

.city-heading:has(.city-level) { grid-column-end: -1; }
.city-heading strong { font: 700 16px var(--font-s); white-space: nowrap; }
.city-level {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-60);
  font: 700 12px var(--font-d);
  white-space: nowrap;
}

.city-level :is(.seal, .product-icon) {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px var(--accent);
}

.city-level .product-icon { padding: 2px; background: var(--surface); object-fit: contain; }
.city-level .seal { font-size: 14px; }
.city-output { grid-area: 2 / 1; align-self: end; }
.city-card small.city-output { font: 400 12px/1.4 var(--font-b); }
.city-output-icon { display: none; }
.city-output > small { display: block; line-height: 1.3; }
.city-output .production-rate small { font-size: 11px; }

.city-other-buildings {
  grid-area: 1 / 2 / -1;
  align-self: end;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.city-card:has(.city-level) .city-other-buildings { grid-row-start: 2; }

.city-other-building {
  display: flex;
  align-items: center;
  gap: 3px;
  font: 400 10px/1.3 var(--font-b);
  white-space: nowrap;
}

.city-other-building .seal { width: 22px; height: 22px; font-size: 10px; }
.city-other-building.is-unbuilt :is(.seal, .product-icon) { filter: grayscale(.85); opacity: .55; }
.city-other-level-short { display: none; }

.city-card.is-unbuilt { border-style: dashed; background: transparent; }
.city-card.is-unbuilt :is(.city-heading, .city-output) { color: var(--ink-60); }

.city-card[aria-pressed="true"] {
  border-style: solid;
  border-color: var(--stronghold-selection);
  background: linear-gradient(180deg, var(--stronghold-warm), var(--surface));
  box-shadow: 0 8px 18px -14px rgba(var(--theme-shadow-rgb, 73, 59, 44), .5);
}

.city-card[aria-pressed="true"]::after {
  position: absolute;
  inset-inline-start: 50%;
  bottom: -7px;
  width: 12px;
  height: 12px;
  border-right: 1px solid var(--stronghold-selection);
  border-bottom: 1px solid var(--stronghold-selection);
  background: var(--surface);
  transform: translateX(-50%) rotate(45deg);
  pointer-events: none;
  content: '';
}

.seal {
  display: inline-grid;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: var(--seal-color, var(--tea));
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--on-strong) 35%, transparent);
  color: var(--on-strong);
  font-family: var(--font-s);
  font-weight: 900;
  line-height: 1;
}

.seal[data-seal="商"] { --seal-color: var(--stronghold-seal-commerce); }
.seal[data-seal="书"] { --seal-color: var(--stronghold-seal-study); }
.seal[data-seal="歌"] { --seal-color: var(--stronghold-seal-song); }
.seal[data-seal="驿"] { --seal-color: var(--stronghold-seal-post); }
.seal[data-seal="织"] { --seal-color: var(--stronghold-seal-weave); }

.seal-muted {
  background: color-mix(in srgb, var(--ink) 14%, var(--surface));
  box-shadow: none;
  color: var(--ink-60);
}

.stronghold-detail,
.travel-rewards { padding: 22px; border-radius: 18px; }

.detail-heading h2 { font: 900 22px var(--font-s); }
.record-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  color: var(--ink-60);
  font-size: 12px;
}
.save-note { margin-top: 8px; }

.building-choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.building-choice {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--stronghold-line);
  border-radius: 14px;
  background: var(--cream);
  transition: transform .08s var(--ease);
}

.building-choice.is-viewed {
  border-color: var(--stronghold-selection);
  background: var(--surface);
  box-shadow: 0 10px 22px -18px rgba(var(--theme-shadow-rgb, 73, 59, 44), .65);
}

.building-choice.is-active { background: linear-gradient(135deg, var(--stronghold-warm), var(--surface) 65%); }
.building-choice.is-active .choice-view { cursor: default; }
.building-choice:not(.is-active):has(.choice-view:active:not(:disabled, [aria-disabled="true"])) {
  transform: scale(.98);
}
.building-choice:not(.is-active) :is(.seal, .product-icon) { filter: saturate(.65); }
.building-choice.is-unbuilt .product-icon { opacity: .75; }

.choice-view {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0;
  text-align: start;
}

/* 保持按压时整卡覆盖层仍以卡片为定位基准。 */
.choice-view:active { transform: none; }

.choice-view::after {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  content: '';
}

.choice-view:focus-visible::after {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 2px;
}

.stronghold-content .choice-view:focus-visible { outline: none; }
.choice-view .seal { width: 46px; height: 46px; font-size: 20px; }
.choice-copy { display: grid; gap: 3px; min-width: 0; }
.choice-title { font: 700 17px var(--font-s); }
.choice-title small { margin-inline-start: 4px; font: 700 12px var(--font-d); }
.choice-meta, .choice-title small { color: var(--ink-60); }
.choice-meta { font-size: 12.5px; }
.choice-meta b { color: var(--stronghold-text); font: 800 15px var(--font-d); }

.max-level-badge,
.choice-title .max-level-badge {
  padding-inline: 4px;
  border-radius: 999px;
  background: var(--theme-accent-bg, var(--yellow));
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  color: var(--theme-accent-text, var(--accent-strong));
  font-weight: 800;
  white-space: nowrap;
}

.choice-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 4px 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
}

.active-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--yellow);
  color: var(--stronghold-text);
  font: 700 12px/1.5 var(--font-b);
}

.secondary-button {
  min-height: var(--control-h-sm);
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--stronghold-text);
  font-size: 12.5px;
  font-weight: 700;
}

.building-growth {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.growth-panel {
  min-width: 0;
  padding: 18px;
  border-radius: 14px;
  background: var(--cream);
}

.now-label { color: var(--ink-60); font: 400 12px/1.5 var(--font-b); }

.not-counted {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink-60);
  font-size: 12px;
}

.building-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin-top: 14px;
}
.building-facts strong { font: 800 17px var(--font-d); }

.level-progress {
  --level-rail-inset: calc(100% / 22);
  --level-dot-position: calc(var(--level-rail-inset) + var(--level-fill) * 10 / 11);
  --level-bubble-half: 21px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(11, minmax(0, 1fr));
  margin-top: 18px;
  padding-top: 28px;
}

.level-rail {
  position: absolute;
  inset: 36px var(--level-rail-inset) auto;
  height: 6px;
  border-radius: 3px;
  background: var(--theme-wash-strong, var(--line));
  background: color-mix(in srgb, var(--ink) 12%, transparent);
}

.level-rail-fill {
  width: var(--level-fill);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--yellow-deep), var(--accent));
}

.is-max-level .level-rail-fill { background: var(--accent); }

.level-bubble {
  --level-bubble-bg: var(--ink);
  position: absolute;
  inset: 0 0 auto;
  color: var(--surface);
  pointer-events: none;
}

.level-bubble > span {
  position: relative;
  left: clamp(var(--level-bubble-half), var(--level-dot-position), 100% - var(--level-bubble-half));
  display: block;
  width: calc(2 * var(--level-bubble-half));
  padding-block: 3px;
  transform: translateX(-50%);
  border-radius: 6px;
  background: var(--level-bubble-bg);
  font: 700 12px/16px var(--font-b);
  text-align: center;
  white-space: nowrap;
}

.level-bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: var(--level-dot-position);
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--level-bubble-bg);
  border-bottom: 0;
}

.is-max-level .level-bubble {
  --level-bubble-bg: var(--accent-strong);
  color: var(--on-strong);
}

.level-progress > button {
  position: relative;
  display: grid;
  grid-template-rows: 22px 12px;
  align-content: start;
  place-items: center;
  gap: 4px;
  min-height: 44px;
  padding: 0;
  border-radius: 6px;
}

.level-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: inset 0 0 0 2px var(--line);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--ink) 12%, transparent);
}

.level-label {
  color: var(--ink-60);
  font: 400 12px/1 var(--font-d);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.level-progress .filled .level-dot { box-shadow: inset 0 0 0 2px var(--accent); }

.level-progress .filled[aria-current="true"] .level-dot {
  width: 20px;
  height: 20px;
  box-shadow: 0 0 0 2px var(--accent), 0 2px 6px var(--line);
}

.level-progress [aria-current="true"] .level-label {
  color: var(--theme-accent-text, var(--accent-strong));
  font-weight: 800;
}

@media (hover: hover) {
  .level-progress button:enabled:hover:not([aria-current]) .level-dot {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .level-progress button:enabled:hover .level-label { color: var(--ink); }
}

.upgrade-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 8px; }
.upgrade-heading h3 { font: 700 15px var(--font-s); }

.upgrade-gains { display: grid; gap: 8px; margin-top: 10px; }
.upgrade-gains > div { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 8px; }
.upgrade-gains dt { flex-shrink: 0; }
.upgrade-gains dd { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: baseline; gap: 2px 6px; text-align: end; }
.upgrade-gains strong { font: 700 14px var(--font-d); }
.gain-increase { color: var(--stronghold-gain); font: 800 13px var(--font-d); white-space: nowrap; }

.upgrade-materials {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.upgrade-materials > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--stronghold-line);
  border-radius: 999px;
  background: var(--surface);
  font-size: 12.5px;
  white-space: nowrap;
}

.material-seal {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--paper);
  color: var(--stronghold-text);
  font: 900 11px var(--font-s);
}

.upgrade-materials b { font: 800 13px var(--font-d); }
.upgrade-remaining { margin-top: 10px; }

.upgrade-panel:has(.max-level) { display: grid; place-items: center; }
.max-level { text-align: center; }
.max-level h3 { color: var(--stronghold-text); font: 900 20px var(--font-s); }

.level-details { margin-top: 14px; border-top: 1px solid var(--stronghold-line); }

.level-details summary {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 12px;
  color: var(--ink-60);
  font-size: 13px;
  list-style: none;
  cursor: pointer;
}

.level-details summary::-webkit-details-marker { display: none; }
.level-details summary::after {
  width: 6px;
  height: 6px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  content: '';
}
.level-details[open] summary::after { transform: translateY(2px) rotate(225deg); }

.level-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.level-table :is(th, td) { padding: 7px 10px; border-bottom: 1px solid var(--stronghold-line); text-align: end; }
.level-table thead th { color: var(--ink-60); font-size: 12px; font-weight: 400; }
.level-table :is(th, td):first-child { text-align: start; }
.level-table tbody { font-family: var(--font-d); }
.level-table tbody th { font-weight: 400; }
.level-table .is-current > * { background: var(--stronghold-warm); font-weight: 800; }
.level-table .is-completed { color: var(--ink-60); }
.table-material { font-family: var(--font-b); font-size: 12px; }
.table-material span { display: inline-block; white-space: nowrap; }
.table-material span + span { margin-inline-start: 6px; }
.table-material img { vertical-align: middle; }
.storage-increase, .tier-current { color: var(--theme-accent-text, var(--accent-strong)); }
.storage-increase { white-space: nowrap; }
.level-note { margin-top: 8px; }

.reward-track { display: grid; gap: 14px; }

.reward-tier { position: relative; min-width: 0; text-align: center; }
.reward-tier:not(:last-child)::before {
  position: absolute;
  border-color: var(--line);
  pointer-events: none;
  content: '';
}

.tier-node {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-inline: auto;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink-60);
  font: 900 14px var(--font-d);
}

.tier-body { min-width: 0; }
.tier-body h3 { margin-top: 6px; font: 700 15px var(--font-s); }
.reward-stars { color: var(--theme-accent-text, var(--accent)); font-size: 12px; letter-spacing: 1px; }

.tier-items {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 12px;
  padding: 14px 10px;
  border-radius: 14px;
  background: var(--cream);
  list-style: none;
}

.reward-item {
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 4px;
  width: 64px;
  text-align: center;
}
.reward-item small { font-size: 12px; line-height: 1.3; overflow-wrap: anywhere; }

.reward-icon {
  width: 48px;
  height: 48px;
  border-radius: 17%;
}

.reward-icon:not(:has(img)) {
  display: grid;
  place-items: center;
  border: 1px solid var(--stronghold-line);
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink-60);
  font: 900 14px var(--font-s);
}

.reward-icon img { display: block; width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }

.reward-tier.is-current .tier-node {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--on-strong);
  box-shadow: 0 0 0 4px var(--yellow);
}
.reward-tier.is-current .tier-items {
  background: linear-gradient(180deg, var(--stronghold-warm), var(--cream));
  box-shadow: inset 0 0 0 1.5px var(--yellow-deep);
}

.city-level,
.choice-title small,
.choice-meta b,
.building-facts strong,
.upgrade-gains dd,
.upgrade-materials b,
.level-table,
.level-note b,
.tier-node { font-variant-numeric: tabular-nums; }

@media (hover: hover) {
  .city-card:not([aria-pressed="true"]):hover,
  .building-choice:not(.is-viewed):has(.choice-view:hover) { border-color: var(--line); }
  .secondary-button:hover { background: var(--paper); }
  .level-details summary:hover { color: var(--ink); }
}
</style>

<style scoped src="./strongholdPageDesktop.css"></style>
<style scoped src="./strongholdPageMobile.css"></style>
