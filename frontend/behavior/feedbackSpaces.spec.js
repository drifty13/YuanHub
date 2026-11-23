import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ManagedFeedback from '../src/pages/feedback/manage.vue'
import MyFeedback from '../src/pages/feedback/index.vue'
import * as api from '../src/api/feedback.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/api/feedback.js', () => ({
  getFeedback: vi.fn(), getManagedFeedback: vi.fn(), getFeedbackAccess: vi.fn(),
  listMyFeedback: vi.fn(), listManagedFeedback: vi.fn(), listWorkflowFeedback: vi.fn(), getFeedbackQueueCounts: vi.fn(),
  listFeedbackWorkflowEvents: vi.fn(), listFeedbackAssignees: vi.fn(), listFeedbackVersionOptions: vi.fn(),
  createFeedback: vi.fn(), appendMyFeedbackMessage: vi.fn(), appendManagedFeedbackMessage: vi.fn(),
  updateMyFeedbackStatus: vi.fn(), updateManagedFeedbackStatus: vi.fn(), downloadFeedbackAttachment: vi.fn(),
  claimFeedback: vi.fn(), assignFeedback: vi.fn(), changeFeedbackWorkArea: vi.fn(),
  mergeFeedback: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn(), prompt: vi.fn(), choose: vi.fn() } }))
vi.mock('../src/api/notifications.js', () => ({ markFeedbackNotificationsRead: vi.fn().mockResolvedValue([]) }))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'manager' }, adminAccess: { superAdmin: false } } }))
vi.mock('../src/store/feedbackUnread.js', () => ({
  feedbackUnreadState: { ids: [], count: 0 },
  subscribeFeedbackUnread: () => () => {}, refreshFeedbackUnread: vi.fn(), markAllManagedFeedbackRead: vi.fn()
}))
vi.mock('../src/store/notificationUnread.js', () => ({
  notificationUnreadState: { feedbackRefIds: [] }, subscribeNotificationUnread: () => () => {},
  refreshNotificationUnreadDetails: vi.fn(), removeNotificationUnreadItems: vi.fn()
}))
const categories = [{ key: 'CUSTOM_0', label: '板块 A' }, { key: 'CUSTOM_1', label: '板块 B' }]
const access = () => ({ available_categories: categories, operator_areas: ['CUSTOM_0', 'CUSTOM_1'] })
const ticket = (id, category = 'CUSTOM_0') => ({
  id, type: 'BUG', category, workArea: category, content: `反馈内容 ${id}`, status: 'OPEN',
  viewerIsReporter: true, viewerCanManage: true, workflowStage: 'PROCESSING', messages: [], quota: { canAppend: true }
})
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
async function render(path) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/feedback/manage', component: ManagedFeedback }, { path: '/feedback', component: MyFeedback }
  ] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(RouterView, { global: { plugins: [router], stubs: { IslandSidebar: true, teleport: true } } })
  await flushPromises()
  return { wrapper, router }
}
beforeEach(() => {
  vi.clearAllMocks()
  api.getFeedbackAccess.mockResolvedValue(access())
  api.listWorkflowFeedback.mockImplementation(async () => ({ items: [ticket('ticket-a')], total: 1 }))
  api.listMyFeedback.mockResolvedValue({ items: [], total: 0 })
  api.getFeedbackQueueCounts.mockResolvedValue({ UNASSIGNED: 1 })
  api.getManagedFeedback.mockImplementation(async id => ticket(id))
  api.getFeedback.mockImplementation(async id => ticket(id))
  dialog.confirm.mockResolvedValue(false)
})

it('旧专区链接加载本人授权范围的列表和统计', async () => {
  api.getFeedbackAccess.mockResolvedValue({ ...access(), operator_areas: ['CUSTOM_0'] })
  const { wrapper, router } = await render('/feedback/manage?space=partner-a')
  expect(router.currentRoute.value.path).toBe('/feedback/manage')
  expect(wrapper.get('.ticket-table').text()).toContain('反馈内容 ticket-a')
  expect(api.listWorkflowFeedback.mock.lastCall[0]).not.toHaveProperty('spaceId')
  expect(api.getFeedbackQueueCounts.mock.lastCall[1]).not.toHaveProperty('spaceId')
  expect(wrapper.findAll('.feedback-manage-toolbar option').some(option => option.element.value === 'CUSTOM_1')).toBe(false)
  wrapper.unmount()
})

it('查询晚到不会覆盖新队列的列表和统计', async () => {
  const { wrapper } = await render('/feedback/manage')
  const oldList = deferred(), oldCounts = deferred()
  api.listWorkflowFeedback.mockImplementationOnce(() => oldList.promise)
  api.getFeedbackQueueCounts.mockImplementationOnce(() => oldCounts.promise)
  await wrapper.get('form[role="search"]').trigger('submit')
  api.listWorkflowFeedback.mockResolvedValueOnce({ items: [ticket('ticket-b', 'CUSTOM_1')], total: 1 })
  await wrapper.findAll('.feedback-primary-queues button').find(button => button.text().includes('已接单')).trigger('click')
  await flushPromises()
  expect(wrapper.get('.ticket-table').text()).toContain('反馈内容 ticket-b')
  oldList.resolve({ items: [ticket('ticket-a')], total: 99 })
  oldCounts.resolve({ UNASSIGNED: 99 })
  await flushPromises()
  expect(wrapper.get('.ticket-table').text()).toContain('反馈内容 ticket-b')
  expect(wrapper.get('.ticket-table').text()).not.toContain('反馈内容 ticket-a')
  expect(wrapper.get('.feedback-primary-queues').text()).not.toContain('99')
  wrapper.unmount()
})

it('拒绝离开时保留回复草稿，确认后打开另一工单且不发送旧草稿', async () => {
  const { wrapper, router } = await render('/feedback/manage?id=ticket-a')
  await wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('回复')).trigger('click')
  await wrapper.get('.feedback-reply-form textarea').setValue('A 的回复草稿')
  await router.push('/feedback/manage?id=ticket-b'); await flushPromises()
  expect(router.currentRoute.value.query.id).toBe('ticket-a')
  expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('A 的回复草稿')
  dialog.confirm.mockResolvedValue(true)
  await router.push('/feedback/manage?id=ticket-b'); await flushPromises()
  expect(router.currentRoute.value.query.id).toBe('ticket-b')
  expect(wrapper.find('.feedback-reply-form').exists()).toBe(false)
  expect(api.appendManagedFeedbackMessage).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('旧提交链接可选择板块，失败保留内容和板块供重试', async () => {
  const { wrapper } = await render('/feedback?space=partner-a&new=1')
  await wrapper.get('.feedback-modal select').setValue('CUSTOM_0')
  await wrapper.get('.feedback-modal textarea').setValue('需要保留的问题描述')
  api.createFeedback.mockRejectedValueOnce(new Error('连接失败')).mockResolvedValueOnce(ticket('ticket-a'))
  await wrapper.get('.feedback-modal form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.feedback-modal textarea').element.value).toBe('需要保留的问题描述')
  expect(wrapper.get('.feedback-modal').text()).toContain('连接失败')
  await wrapper.get('.feedback-modal form').trigger('submit'); await flushPromises()
  expect(api.createFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'CUSTOM_0', content: '需要保留的问题描述' }))
  expect(wrapper.find('.feedback-modal').exists()).toBe(false)
  wrapper.unmount()
})

it('旧提交链接加载本人记录，可以选择其他板块', async () => {
  const { wrapper } = await render('/feedback?space=partner-a&new=1')
  expect(api.listMyFeedback.mock.lastCall[0]).not.toHaveProperty('spaceId')
  const category = wrapper.get('.feedback-modal select')
  expect(category.element.value).toBe('')
  await category.setValue('CUSTOM_1')
  await wrapper.get('.feedback-modal textarea').setValue('板块 B 的问题')
  api.createFeedback.mockResolvedValueOnce(ticket('ticket-b', 'CUSTOM_1'))
  await wrapper.get('.feedback-modal form').trigger('submit'); await flushPromises()
  expect(api.createFeedback).toHaveBeenCalledWith(expect.objectContaining({ category: 'CUSTOM_1' }))
  wrapper.unmount()
})
