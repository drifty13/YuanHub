import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { listAccounts } from '../api/accounts.js'
import { getStrongholdRecord, putStrongholdRecord } from '../api/stronghold.js'
import { cities } from '../data/stronghold.js'
import { subscribeAccountEvents } from '../store/accountEvents.js'
import { useAccountListUpdates } from '../store/accountList.js'
import { activeAccount } from '../store/activeAccount.js'
import { auth } from '../store/auth.js'

const storageKeys = { levels: 'yuanhub:stronghold:levels', active: 'yuanhub:stronghold:active' }
const emptyRecord = () => ({ levels: {}, active: {} })
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

const buildingsByCity = new Map(cities.map(city => [city.name, ['商行', '书馆', city.specialty]]))

function validateResponse(record, accountId) {
  if (record?.account_id !== accountId || record.schema_version !== 1 ||
      !Number.isSafeInteger(record.revision) || record.revision < 0 || !isObject(record.levels) || !isObject(record.active)) {
    throw new Error('据点记录响应与当前账号或版本不符')
  }
  for (const [city, levels] of Object.entries(record.levels)) {
    const names = buildingsByCity.get(city)
    if (!names || !isObject(levels) || Object.entries(levels).some(([name, level]) =>
      !names.includes(name) || !Number.isInteger(level) || level < 1 || level > 10)) throw new Error('建筑等级无效')
  }
  if (Object.entries(record.active).some(([city, name]) => !buildingsByCity.get(city)?.includes(name))) {
    throw new Error('在建建筑无效')
  }
  return record
}

export function useStrongholdRecord() {
  const owner = computed(() => auth.isLoggedIn ? auth.userInfo?.id : null)
  const accounts = shallowRef(null)
  const account = computed(() => accounts.value?.find(item => item.id === activeAccount.id))
  const accountsLoading = ref(false)
  const accountError = ref('')
  let accountRead = 0

  function applyAccounts(rows) {
    if (!Array.isArray(rows)) throw new Error('游戏账号列表无效')
    activeAccount.syncAccounts(rows)
    if (!rows.some(item => item.id === activeAccount.id)) activeAccount.set(rows[0]?.id || '')
    accounts.value = rows
    accountsLoading.value = false
    accountError.value = ''
  }

  async function loadAccounts() {
    const sequence = ++accountRead
    const user = owner.value
    accountsLoading.value = !!user
    accountError.value = ''
    if (!user) return
    try {
      const rows = await listAccounts(user)
      if (sequence === accountRead && user === owner.value) applyAccounts(rows)
    } catch (error) {
      if (sequence === accountRead && user === owner.value) {
        accounts.value = null
        accountError.value = error.message || '游戏账号加载失败'
        accountsLoading.value = false
      }
    }
  }

  useAccountListUpdates(rows => {
    if (owner.value) {
      ++accountRead
      applyAccounts(rows)
    }
  })
  watch(owner, () => {
    accounts.value = null
    void loadAccounts()
  }, { immediate: true, flush: 'sync' })

  const local = computed(() => !auth.isLoggedIn || (!!owner.value && accounts.value?.length === 0))
  const record = shallowRef(emptyRecord())
  const phase = ref('loading')
  const localErrors = ref({})
  const ready = computed(() => ['local', 'synced', 'saving', 'saveError', 'conflict'].includes(phase.value))
  const retryable = computed(() => !!accountError.value || ['loadError', 'saveError'].includes(phase.value))
  const messages = {
    local: '等级记在本机浏览器', loading: '正在加载记录…', synced: '已同步到当前账号', saving: '保存中…',
    loadError: '据点记录加载失败', saveError: '保存失败', conflict: '记录已在其他设备更新，已载入最新数据'
  }
  const status = computed(() => accountError.value || messages[phase.value])
  const localFailed = computed(() => local.value && Object.values(localErrors.value).some(Boolean))
  let context = null
  let pendingWrite = Promise.resolve()

  function readLocal(key) {
    try {
      const value = JSON.parse(localStorage.getItem(storageKeys[key]) ?? '{}')
      if (isObject(value)) return value
    } catch {
      localErrors.value[key] = true
    }
    return {}
  }

  function loadLocal() {
    localErrors.value = {}
    const storedActive = readLocal('active')
    const active = {}
    for (const [city, names] of buildingsByCity) {
      const name = storedActive[city]
      if (names.includes(name)) active[city] = name
    }
    record.value = { levels: readLocal('levels'), active }
    phase.value = 'local'
  }

  async function load(scope) {
    const sequence = ++scope.read
    phase.value = 'loading'
    record.value = emptyRecord()
    try {
      // A quick switch back must read after the previous account's last accepted click.
      await pendingWrite
      if (context !== scope || sequence !== scope.read) return
      const result = validateResponse(await getStrongholdRecord(scope.id, scope.user), scope.id)
      if (context !== scope || sequence !== scope.read) return
      if (result.revision < Math.max(scope.revision, scope.observedRevision)) throw new Error('读取到过期的据点记录')
      scope.revision = result.revision
      record.value = { levels: result.levels, active: result.active }
      phase.value = scope.conflict ? 'conflict' : 'synced'
      scope.conflict = false
    } catch {
      if (context === scope && sequence === scope.read) phase.value = 'loadError'
    }
  }

  watch([owner, () => account.value?.id, local], ([user, id, useLocal]) => {
    context = null
    record.value = emptyRecord()
    phase.value = 'loading'
    if (useLocal) loadLocal()
    else if (user && id) {
      context = { user, id, revision: 0, read: 0, queued: null, observedRevision: 0, conflict: false }
      void load(context)
    }
  }, { immediate: true, flush: 'sync' })

  async function drain(scope) {
    try {
      while (scope.queued && owner.value === scope.user) {
        const snapshot = scope.queued
        scope.queued = null
        const result = validateResponse(await putStrongholdRecord(scope.id, scope.user, {
          schema_version: 1, expected_revision: scope.revision, ...snapshot
        }), scope.id)
        if (result.revision !== scope.revision + 1) throw new Error('保存版本无效')
        scope.revision = result.revision
      }
      if (context !== scope) return
      phase.value = 'synced'
      if (scope.observedRevision > scope.revision) void load(scope)
    } catch (error) {
      if (context !== scope) return
      if (error.status === 409 || error.code === 'stronghold_revision_conflict') {
        scope.queued = null
        scope.conflict = true
        void load(scope)
      } else {
        phase.value = 'saveError'
      }
    }
  }

  function saveCloud() {
    const scope = context
    scope.queued = record.value
    if (phase.value === 'saving') return
    phase.value = 'saving'
    pendingWrite = pendingWrite.then(() => drain(scope))
  }

  function update(key, value) {
    if (!ready.value) return
    record.value = { ...record.value, [key]: value }
    if (!local.value) {
      saveCloud()
      return
    }
    try {
      localStorage.setItem(storageKeys[key], JSON.stringify(value))
      localErrors.value[key] = false
    } catch {
      localErrors.value[key] = true
    }
  }

  function retry() {
    if (accountError.value) void loadAccounts()
    else if (phase.value === 'loadError') void load(context)
    else if (phase.value === 'saveError') saveCloud()
  }

  const unsubscribe = subscribeAccountEvents(({ event, data }) => {
    if (!context || data?.account_id !== context.id) return
    if (event === 'account_deleted') {
      accounts.value = null
      void loadAccounts()
      return
    }
    if (event !== 'stronghold' || !Number.isSafeInteger(data.revision) || data.revision <= context.revision) return
    context.observedRevision = Math.max(context.observedRevision, data.revision)
    if (!['saving', 'saveError'].includes(phase.value)) void load(context)
  })

  onScopeDispose(() => {
    ++accountRead
    context = null
    unsubscribe()
  })
  return { accounts, account, accountsLoading, accountError, record, ready, status, retryable, retry, localFailed, update }
}
