import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { authGuard } from '../src/router/index.js'
import { routes } from '../src/router/routes.js'
import { auth } from '../src/store/auth.js'

vi.mock('../src/store/auth.js', () => ({ init: vi.fn(), auth: { accessToken: '', userInfo: null, adminAccess: null, refreshAdminAccess: vi.fn() } }))
vi.mock('../src/store/beta.js', () => ({ beta: { setIdentity: vi.fn(), refresh: vi.fn() } }))

function guardRouter() {
  const page = { template: '<div />' }
  const terminalPaths = ['/changelog', '/manage', '/login', '/forbidden']
  const targetLoader = vi.fn(async () => page)
  const selected = routes.filter(route => route.path.startsWith('/co-creation') || terminalPaths.includes(route.path))
    .map(route => terminalPaths.includes(route.path) ? { ...route, component: targetLoader } : route)
  const router = createRouter({ history: createMemoryHistory(), routes: selected })
  router.beforeEach(authGuard)
  return { router, targetLoader }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(auth, { accessToken: '', userInfo: null, adminAccess: null, adminAccessError: '' })
})

it.each(['/co-creation', '/co-creation/', '/co-creation?tab=roadmap&type=FEATURE', '/co-creation?tab=unknown'])('%s 只跳更新日志，不加载目标页面', async path => {
  const { router, targetLoader } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/changelog')
  expect(router.currentRoute.value.query).toEqual({})
  expect(targetLoader).toHaveBeenCalledTimes(1)
  expect(auth.refreshAdminAccess).not.toHaveBeenCalled()
})

it.each(['/co-creation/admin', '/co-creation/admin/'])('游客的%s由管理工作台要求登录，回跳不再指向旧页', async path => {
  const { router } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query.redirect).toBe('/manage')
})

it('普通用户不能借旧管理地址绕过工作台权限', async () => {
  Object.assign(auth, { accessToken: 'synthetic', userInfo: { id: 'user' }, adminAccess: { permissions: [] } })
  const { router } = guardRouter()
  await router.push('/co-creation/admin')
  expect(router.currentRoute.value.path).toBe('/forbidden')
  expect(router.currentRoute.value.query.from).toBe('/manage')
  expect(auth.refreshAdminAccess).toHaveBeenCalledTimes(1)
})

it.each([{ superAdmin: true }, { permissions: ['changelog:write'] }, { operatorAreas: ['OTHER'] }])('有管理能力的用户经旧地址进入现有工作台 %j', async adminAccess => {
  Object.assign(auth, { accessToken: 'synthetic', userInfo: { id: 'admin' }, adminAccess })
  const { router, targetLoader } = guardRouter()
  await router.push('/co-creation/admin')
  expect(router.currentRoute.value.path).toBe('/manage')
  expect(targetLoader).toHaveBeenCalledTimes(1)
})
