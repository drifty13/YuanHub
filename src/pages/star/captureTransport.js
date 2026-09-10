function remoteField(value, snake, camel) {
  return value && (value[snake] ?? value[camel])
}

export function isStarCaptureReadyEvent(message, accountId) {
  const data = message && message.data
  const eventAccountId = String(remoteField(data, 'account_id', 'accountId') || '').trim()
  return Boolean(
    message
    && message.event === 'star_capture_ready'
    && !data.preview
    && eventAccountId
    && eventAccountId === String(accountId || '').trim()
    && String(remoteField(data, 'capture_id', 'captureId') || '').trim(),
  )
}

export function starCaptureRouteForEvent(message, accountId, allowMainOnlyTransportSmoke) {
  if (!isStarCaptureReadyEvent(message, accountId)) return null
  const data = message.data
  return {
    path: '/star',
    query: {
      account_id: String(remoteField(data, 'account_id', 'accountId')),
      capture_id: String(remoteField(data, 'capture_id', 'captureId')),
      ...(allowMainOnlyTransportSmoke ? { transport_smoke: '1' } : {}),
    },
  }
}

export function isCurrentStarCapture(current, accountId) {
  return Boolean(current && String(current.accountId || '').trim() && String(current.accountId).trim() === String(accountId || '').trim())
}

export function captureIdFromRouteQuery(query) {
  return String(query && query.capture_id || '').trim()
}

export function clearStarCaptureRouteQuery(query) {
  const next = Object.assign({}, query)
  delete next.capture_id
  delete next.account_id
  delete next.transport_smoke
  return next
}

export async function loadStarCaptureBatch(api, accountId, captureId, createFile) {
  const manifest = await api.getManifest(accountId, captureId)
  const section = String(manifest && manifest.section || '')
  const stopReason = String(remoteField(manifest, 'stop_reason', 'stopReason') || '')
  const images = Array.isArray(manifest && manifest.images) ? manifest.images.slice() : []
  if (section !== 'main' || stopReason !== 'bottom_no_move' || !images.length) throw new Error('星石截图批次不是可导入的主星完整采集。')
  images.sort(function (left, right) {
    return Number(remoteField(left, 'source_order', 'sourceOrder')) - Number(remoteField(right, 'source_order', 'sourceOrder'))
  })
  const loaded = await Promise.all(images.map(async function (image) {
    const sourceImageId = String(remoteField(image, 'source_image_id', 'sourceImageId') || '').trim()
    const sourceOrder = Number(remoteField(image, 'source_order', 'sourceOrder'))
    const fileName = String(remoteField(image, 'file_name', 'fileName') || '').trim()
    if (!sourceImageId || !Number.isInteger(sourceOrder) || sourceOrder < 1 || !fileName) throw new Error('星石截图 manifest 图片字段无效。')
    const downloaded = await api.getImage(accountId, captureId, sourceImageId)
    return { sourceImageId, sourceOrder, file: createFile(downloaded.blob, fileName) }
  }))
  return {
    schemaVersion: 1,
    captureId: String(remoteField(manifest, 'capture_id', 'captureId') || captureId),
    source: 'maayuan',
    gameVersion: String(remoteField(manifest, 'game_version', 'gameVersion') || ''),
    sections: {
      main: {
        images: loaded,
        adjacentRelations: (Array.isArray(manifest.adjacent_relations) ? manifest.adjacent_relations : (Array.isArray(manifest.adjacentRelations) ? manifest.adjacentRelations : [])).map(function (relation) {
          return {
            previousSourceImageId: String(remoteField(relation, 'previous_source_image_id', 'previousSourceImageId') || ''),
            currentSourceImageId: String(remoteField(relation, 'current_source_image_id', 'currentSourceImageId') || ''),
            relation: relation.relation,
          }
        }),
        complete: true,
        stopReason: 'bottom_no_move',
      },
    },
  }
}

export async function importLoadedStarCapture(api, accountId, captureId, handle, batch, allowMainOnlyTransportSmoke, isCurrent = function () { return true }) {
  if (!isCurrent()) return false
  handle.importCaptureBatch(batch, { allowMainOnlyTransportSmoke: allowMainOnlyTransportSmoke === true })
  if (!isCurrent()) return false
  await api.consume(accountId, captureId)
  return true
}

export async function loadAndImportStarCapture(api, current, handle, createFile, isCurrent) {
  if (!isCurrent()) return false
  if (!current.batch) current.batch = await loadStarCaptureBatch(api, current.accountId, current.captureId, createFile)
  if (!isCurrent()) return false
  return importLoadedStarCapture(api, current.accountId, current.captureId, handle, current.batch, current.allowMainOnlyTransportSmoke, isCurrent)
}
