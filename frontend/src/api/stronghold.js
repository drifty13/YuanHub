import { request } from './request.js'

const path = accountId => '/v1/stronghold?account_id=' + encodeURIComponent(accountId)

export function getStrongholdRecord(accountId, expectedUserId) {
  return request(path(accountId), { auth: true, expectedUserId })
}

export function putStrongholdRecord(accountId, expectedUserId, body) {
  return request(path(accountId), { method: 'PUT', auth: true, expectedUserId, body })
}
