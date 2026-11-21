import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CapacityPanel from '../src/components/operator/OperatorXiuweiCapacityPanel.vue'
import PlannerSelect from '../src/components/operator/PlannerSelect.vue'
import Tracker from '../src/components/operator/OperatorGrowthTracker.vue'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { getCurrent, listRecords } from '../src/api/inventory.js'
import { getOperatorGrowthTargets, getOperatorReserveWorkspace, putOperatorGrowthTarget, putOperatorReserveWorkspace } from '../src/api/operator.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, adminAccess: { permissions: [] } }) }
})
vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/operator.js', () => ({ getOperatorGrowthTargets: vi.fn(), putOperatorGrowthTarget: vi.fn(), getOperatorReserveWorkspace: vi.fn(), putOperatorReserveWorkspace: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listRecords: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))

const stock = { baoshijing: 3000, shuijing: 8000, xinghanjing: 5000 }
const wrappers = []
function render(component, options) {
  const wrapper = mount(component, { attachTo: document.body, ...options })
  wrappers.push(wrapper)
  return wrapper
}
const renderPanel = props => render(CapacityPanel, { props: { accountName: '大号', game: '如鸢', stock, ...props } })
const groups = wrapper => wrapper.findAll('.capacity-group')
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text() === text)
async function selectFrom(wrapper, value) {
  wrapper.findAllComponents(PlannerSelect)[0].vm.$emit('update:modelValue', value)
  await flushPromises()
}
async function openTrial(wrapper) {
  await wrapper.get('.planner-tools-trigger').trigger('click')
  await wrapper.get('.planner-reserve-entry').trigger('click')
  await flushPromises()
}
const renderTracker = props => render(Tracker, {
  props: { accountId: 'a', accountName: '大号', isLoggedIn: true, game: '如鸢', ...props },
  global: { stubs: { PlannerExactOptimizer: true } }
})
beforeEach(() => {
  vi.clearAllMocks()
  plannerApi.getTrainingWorkspace.mockImplementation(async account => ({ schema_version: 1, account_id: account, revision: 0, active_plan_id: null, plans: [] }))
  getOperatorGrowthTargets.mockResolvedValue({ items: [] })
  getOperatorReserveWorkspace.mockImplementation(async account => ({ schema_version: 1, account_id: account, revision: 0, active_plan_id: null, plans: [] }))
  getCurrent.mockImplementation(async ({ entityType }) => entityType === 'item' ? [{ entries: stock }] : [])
  listRecords.mockResolvedValue({ items: [] })
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

it('默认 1→17，即时更新人数、剩余和下一人缺口，且选项阻止非法区间', async () => {
  const wrapper = renderPanel()
  expect(wrapper.findAllComponents(PlannerSelect).map(node => node.props('modelValue'))).toEqual([1, 17])
  await selectFrom(wrapper, 13)
  expect(groups(wrapper)[2].attributes('aria-label')).toContain('材料可供 2 人')
  const details = wrapper.findAll('.capacity-detail')
  const detail = details[2]
  expect(detail.isVisible()).toBe(true)
  expect(detail.findAll('tbody tr').map(row => row.findAll('td').map(td => td.text()))).toEqual([
    ['940', '3,000', '1,120', '已足够—'],
    ['2,760', '8,000', '2,480', '还缺 280'],
    ['2,100', '5,000', '800', '还缺 1,300']
  ])
  expect(detail.text()).toContain('再培养 1 人，还缺水镜 280、星汉镜 1,300。')
  expect(wrapper.findAllComponents(PlannerSelect)[0].props('options').at(-1).disabled).toBe(true)
  expect(wrapper.findAllComponents(PlannerSelect)[1].props('options').filter(option => !option.disabled).map(option => option.value)).toEqual([14, 15, 16, 17])
  await groups(wrapper)[0].trigger('click')
  expect(details[0].isVisible()).toBe(true)
  expect(detail.isVisible()).toBe(false)
  await groups(wrapper)[0].trigger('click')
  expect(groups(wrapper).every(group => group.attributes('aria-expanded') === 'false')).toBe(true)
})

it('刷新中和失败时隐藏旧人数，成功后按新库存重算，已读取空库存才显示零人', async () => {
  const wrapper = renderPanel()
  await selectFrom(wrapper, 13)
  await wrapper.setProps({ loading: true })
  expect(groups(wrapper)).toHaveLength(0)
  expect(wrapper.get('[role="status"].capacity-state').exists()).toBe(true)
  await wrapper.setProps({ loading: false, error: '库存读取失败' })
  expect(groups(wrapper)).toHaveLength(0)
  await button(wrapper, '重新读取库存').trigger('click')
  expect(wrapper.emitted('refresh')).toHaveLength(1)
  await wrapper.setProps({ error: '', stock: {} })
  expect(groups(wrapper).every(group => group.attributes('aria-label').includes('材料可供 0 人'))).toBe(true)
  expect(wrapper.text()).toContain('培养第 1 人，还缺宝石镜 940、水镜 2,760、星汉镜 2,100。')
  await wrapper.setProps({ stock })
  expect(groups(wrapper)[2].attributes('aria-label')).toContain('材料可供 2 人')
})

it('不确定库存可重新读取', async () => {
  const wrapper = renderPanel({ stock: null })
  expect(groups(wrapper)).toHaveLength(0)
  await wrapper.get('[role="alert"] button').trigger('click')
  expect(wrapper.emitted('refresh')).toHaveLength(1)
})

it('普通用户无需培养清单即可试算，返回养成规划恢复入口焦点，试算不写云端', async () => {
  const wrapper = renderTracker()
  await flushPromises()
  await openTrial(wrapper)
  const workspace = wrapper.get('#planner-reserve-workspace')
  const panel = wrapper.getComponent(CapacityPanel)
  expect(panel.isVisible()).toBe(true)
  expect(document.activeElement).toBe(workspace.element)
  await selectFrom(panel, 13)
  expect(groups(panel)[2].attributes('aria-label')).toContain('材料可供 2 人')
  await panel.get('.capacity-plan-link button').trigger('click')
  expect(panel.isVisible()).toBe(false)
  expect(wrapper.get('#reserve-plans-view').isVisible()).toBe(true)
  await button(wrapper, '返回养成规划').trigger('click')
  await flushPromises()
  expect(workspace.isVisible()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('.planner-tools-trigger').element)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  expect(putOperatorGrowthTarget).not.toHaveBeenCalled()
  expect(putOperatorReserveWorkspace).not.toHaveBeenCalled()
})

it('试算刷新只读库存，不刷新规划；账号切换后旧响应不能回填新账号', async () => {
  const wrapper = renderTracker()
  await flushPromises()
  await openTrial(wrapper)
  const panel = wrapper.getComponent(CapacityPanel)
  await selectFrom(panel, 13)
  let resolveOld
  getCurrent.mockImplementation(({ accountId, entityType }) => {
    if (accountId === 'a' && entityType === 'item') return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve([])
  })
  const workspaceReads = plannerApi.getTrainingWorkspace.mock.calls.length
  await panel.get('[aria-label="刷新试算库存"]').trigger('click')
  expect(groups(panel)).toHaveLength(0)
  expect(plannerApi.getTrainingWorkspace).toHaveBeenCalledTimes(workspaceReads)
  await wrapper.setProps({ accountId: 'b', accountName: '小号' })
  await flushPromises()
  expect(wrapper.get('#planner-reserve-workspace').isVisible()).toBe(false)
  resolveOld([{ entries: stock }])
  await flushPromises()
  await openTrial(wrapper)
  const newPanel = wrapper.getComponent(CapacityPanel)
  expect(newPanel.props('accountName')).toBe('小号')
  expect(newPanel.findAllComponents(PlannerSelect)[0].props('modelValue')).toBe(1)
  expect(groups(newPanel)).toHaveLength(3)
  expect(groups(newPanel).every(group => group.attributes('aria-label').includes('材料可供 0 人'))).toBe(true)
  await wrapper.setProps({ active: false })
  expect(wrapper.get('#planner-reserve-workspace').isVisible()).toBe(false)
})
