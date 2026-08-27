const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { getNextQueuePosition, isOpenOrderStatus, normalizeOrderCode } = require('../src/order-utils')
const { saveJSON, loadJSON } = require('../src/util')

test('sıra numarası kapalı talepleri yok sayar ve mevcut en yüksek sıranın sonrasını seçer', () => {
  const position = getNextQueuePosition([
    { status: 'queued', queue_position: 4 },
    { status: 'in_progress', queue_position: 9 },
    { status: 'closed', queue_position: 999 },
    { status: 'validated', queue_position: null }
  ])
  assert.equal(position, 10)
})

test('sipariş kodu normalize edilir ve yalnızca açık durumlar açık kabul edilir', () => {
  assert.equal(normalizeOrderCode(' ms-abc123 '), 'MS-ABC123')
  assert.equal(isOpenOrderStatus('validated'), true)
  assert.equal(isOpenOrderStatus('in_progress'), true)
  assert.equal(isOpenOrderStatus('closed'), false)
  assert.equal(isOpenOrderStatus('cancelled'), false)
})

test('yerel depo dosyasının üst klasörü ilk yazımda otomatik oluşturulur', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monarch-store-test-'))
  const nestedFile = path.join(tempRoot, 'nested', 'store.json')
  try {
    saveJSON(nestedFile, { created: true })
    assert.deepEqual(loadJSON(nestedFile), { created: true })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
