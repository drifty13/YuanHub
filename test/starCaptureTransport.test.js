import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureIdFromRouteQuery, clearStarCaptureRouteQuery, importLoadedStarCapture, isStarCaptureReadyEvent, loadAndImportStarCapture, loadStarCaptureBatch, starCaptureRouteForEvent } from '../src/pages/star/captureTransport.js'

const event = { event: 'star_capture_ready', data: { account_id: 'account-1', capture_id: 'capture-1', section: 'full', image_count: 4 } }

test('full capture SSE accepts only the active account and never adds the smoke query', () => {
  assert.equal(isStarCaptureReadyEvent(event, 'account-1'), true)
  assert.equal(isStarCaptureReadyEvent(event, 'account-2'), false)
  assert.deepEqual(starCaptureRouteForEvent(event, 'account-1', true), { path: '/star', query: { account_id: 'account-1', capture_id: 'capture-1' } })
})

test('full three-section manifest is reconstructed in global order and imports without a smoke option', async () => {
  const api = {
    async getManifest() {
      return {
        capture_id: 'capture-1', source: 'maayuan', game_version: '如鸢', sections: {
          main: { images: [{ source_image_id: 'main-1', source_order: 1, file_name: 'main-000.png' }, { source_image_id: 'main-2', source_order: 2, file_name: 'main-001.png' }], adjacent_relations: [{ previous_source_image_id: 'main-1', current_source_image_id: 'main-2', relation: 'overlap' }], complete: true, stop_reason: 'bottom_no_move' },
          support: { images: [{ source_image_id: 'support-1', source_order: 3, file_name: 'support-000.png' }], adjacent_relations: [], complete: true, stop_reason: 'bottom_no_move' },
          experience: { images: [{ source_image_id: 'experience-1', source_order: 4, file_name: 'experience-000.png' }], adjacent_relations: [], complete: true, stop_reason: 'single_capture' },
        },
      }
    },
    async getImage(_accountId, _captureId, sourceImageId) { return { blob: sourceImageId } },
  }
  const batch = await loadStarCaptureBatch(api, 'account-1', 'capture-1', function (blob, name) { return { blob, name } })
  assert.deepEqual(Object.keys(batch.sections), ['main', 'support', 'experience'])
  assert.deepEqual(Object.values(batch.sections).flatMap(function (section) { return section.images.map(function (image) { return image.sourceOrder }) }), [1, 2, 3, 4])
  assert.equal(batch.sections.main.adjacentRelations[0].currentSourceImageId, 'main-2')
  let consumed = 0
  let options = 'not-called'
  await importLoadedStarCapture({ async consume() { consumed += 1 } }, 'account-1', 'capture-1', { importCaptureBatch(_batch, nextOptions) { options = nextOptions } }, batch, false)
  assert.equal(consumed, 1)
  assert.equal(options, undefined)
})

test('legacy main-only capture remains blocked except for explicit smoke', async () => {
  const api = {
    async getManifest() { return { capture_id: 'legacy', game_version: '如鸢', section: 'main', stop_reason: 'bottom_no_move', images: [{ source_image_id: 'legacy-1', source_order: 1, file_name: 'capture-00.png' }], adjacent_relations: [] } },
    async getImage() { return { blob: 'image' } },
  }
  await assert.rejects(function () { return loadStarCaptureBatch(api, 'account-1', 'legacy', function () { return {} }) })
  const batch = await loadStarCaptureBatch(api, 'account-1', 'legacy', function () { return {} }, true)
  assert.equal(batch.sections.main.images.length, 1)
  let options = null
  let consumed = 0
  await importLoadedStarCapture({ async consume() { consumed += 1 } }, 'account-1', 'legacy', { importCaptureBatch(_batch, nextOptions) { options = nextOptions } }, batch, true)
  assert.deepEqual(options, { allowMainOnlyTransportSmoke: true })
  assert.equal(consumed, 1)
})

test('an account switch while downloading prevents both import and consume', async () => {
  let activeAccountId = 'A'
  let imported = 0
  let consumed = 0
  const current = { accountId: 'A', captureId: 'capture-a', batch: null, allowMainOnlyTransportSmoke: true }
  const api = {
    async getManifest() { return { capture_id: 'capture-a', game_version: '如鸢', section: 'main', stop_reason: 'bottom_no_move', images: [{ source_image_id: 'capture-a:main:000', source_order: 1, file_name: 'capture-00.png' }], adjacent_relations: [] } },
    async getImage() { activeAccountId = 'B'; return { blob: 'image' } },
    async consume() { consumed += 1 },
  }
  const completed = await loadAndImportStarCapture(api, current, { importCaptureBatch() { imported += 1 } }, function () { return {} }, function () { return activeAccountId === current.accountId })
  assert.equal(completed, false)
  assert.equal(imported, 0)
  assert.equal(consumed, 0)
})

test('consume clears only capture query fields', () => {
  const next = clearStarCaptureRouteQuery({ capture_id: 'capture-1', account_id: 'account-1', transport_smoke: '1', tab: 'import' })
  assert.deepEqual(next, { tab: 'import' })
  assert.equal(captureIdFromRouteQuery(next), '')
})
