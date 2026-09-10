import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureIdFromRouteQuery, clearStarCaptureRouteQuery, importLoadedStarCapture, isStarCaptureReadyEvent, loadAndImportStarCapture, loadStarCaptureBatch, starCaptureRouteForEvent } from '../src/pages/star/captureTransport.js'

const event = { event: 'star_capture_ready', data: { account_id: 'account-1', capture_id: 'capture-1' } }

test('star capture SSE only accepts the active account and produces an explicit dev-smoke route', () => {
  assert.equal(isStarCaptureReadyEvent(event, 'account-1'), true)
  assert.equal(isStarCaptureReadyEvent(event, 'account-2'), false)
  assert.deepEqual(starCaptureRouteForEvent(event, 'account-1', true), { path: '/star', query: { account_id: 'account-1', capture_id: 'capture-1', transport_smoke: '1' } })
  assert.deepEqual(starCaptureRouteForEvent(event, 'account-1', false), { path: '/star', query: { account_id: 'account-1', capture_id: 'capture-1' } })
})

test('main capture manifest creates a one-based six-image main CaptureBatch and preserves overlap', async () => {
  const api = {
    async getManifest() {
      return {
        capture_id: 'capture-1', game_version: '如鸢', section: 'main', stop_reason: 'bottom_no_move',
        images: Array.from({ length: 6 }, function (_, index) { return { source_image_id: 'capture-1:main:' + String(index + 1).padStart(3, '0'), source_order: index + 1, file_name: 'capture-' + String(index + 1).padStart(2, '0') + '.png' } }),
        adjacent_relations: [{ previous_source_image_id: 'capture-1:main:004', current_source_image_id: 'capture-1:main:005', relation: 'overlap' }],
      }
    },
    async getImage(_accountId, _captureId, sourceImageId) { return { blob: sourceImageId } },
  }
  const batch = await loadStarCaptureBatch(api, 'account-1', 'capture-1', function (blob, name) { return { blob, name } })
  assert.deepEqual(batch.sections.main.images.map(function (image) { return image.sourceOrder }), [1, 2, 3, 4, 5, 6])
  assert.equal(batch.sections.main.images.length, 6)
  assert.deepEqual(batch.sections.main.adjacentRelations, [{ previousSourceImageId: 'capture-1:main:004', currentSourceImageId: 'capture-1:main:005', relation: 'overlap' }])
})

test('capture is consumed only after YuanStar accepts the explicit smoke import', async () => {
  let consumed = 0
  const api = { async consume() { consumed += 1 } }
  const batch = { sections: { main: {} } }
  let received = null
  await importLoadedStarCapture(api, 'account-1', 'capture-1', { importCaptureBatch(next, options) { received = { next, options } } }, batch, true)
  assert.equal(consumed, 1)
  assert.equal(received.options.allowMainOnlyTransportSmoke, true)
  await assert.rejects(async function () {
    await importLoadedStarCapture(api, 'account-1', 'capture-2', { importCaptureBatch() { const error = new Error('clear first'); error.code = 'capture_import_not_empty'; throw error } }, batch, true)
  })
  assert.equal(consumed, 1)
})

test('A pending capture that finishes downloading after switching to B is not imported or consumed', async () => {
  let activeAccountId = 'A'
  let imported = 0
  let consumed = 0
  const current = { accountId: 'A', captureId: 'capture-a', batch: null, allowMainOnlyTransportSmoke: true }
  const api = {
    async getManifest() {
      return { capture_id: 'capture-a', game_version: '如鸢', section: 'main', stop_reason: 'bottom_no_move', images: [{ source_image_id: 'capture-a:main:000', source_order: 1, file_name: 'capture-00.png' }], adjacent_relations: [] }
    },
    async getImage() { activeAccountId = 'B'; return { blob: 'image' } },
    async consume() { consumed += 1 },
  }
  const completed = await loadAndImportStarCapture(api, current, { importCaptureBatch() { imported += 1 } }, function (blob, name) { return { blob, name } }, function () { return activeAccountId === current.accountId })
  assert.equal(completed, false)
  assert.equal(imported, 0)
  assert.equal(consumed, 0)
})

test('successful consume removes one-shot capture query fields while preserving unrelated query and prevents another route capture', () => {
  const next = clearStarCaptureRouteQuery({ capture_id: 'capture-1', account_id: 'account-1', transport_smoke: '1', tab: 'import', filter: 'ready' })
  assert.deepEqual(next, { tab: 'import', filter: 'ready' })
  assert.equal(captureIdFromRouteQuery(next), '')
})
