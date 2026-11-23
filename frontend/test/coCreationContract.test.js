import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PUBLIC_STATUS_OPTIONS, publicStatusLabel, publicTypeLabel } from '../src/utils/feedbackPublic.js'

test('status/type label helpers are stable and cover the agreed mapping', () => {
  assert.equal(publicStatusLabel('COLLECTING'), '收集中')
  assert.equal(publicStatusLabel('CONFIRMED'), '已确认')
  assert.equal(publicStatusLabel('PLANNED'), '计划中')
  assert.equal(publicStatusLabel('IN_PROGRESS'), '开发中')
  assert.equal(publicStatusLabel('COMPLETED'), '已完成')
  assert.equal(publicStatusLabel('NOT_PLANNED'), '暂不处理')
  assert.equal(publicTypeLabel('FEATURE'), '功能建议')
  assert.equal(publicTypeLabel('EXPERIENCE'), '体验优化')
  assert.equal(PUBLIC_STATUS_OPTIONS.length, 6)
})
