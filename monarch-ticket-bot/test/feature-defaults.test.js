const assert = require('node:assert/strict')
const test = require('node:test')
const { isFilterEnabled, setFilterEnabled } = require('../src/filter')
const { getMirrorUserId } = require('../src/mirror')
const { loadStore } = require('../src/util')

test('küfür filtresi yönetici özellikle açmadıkça varsayılan olarak pasiftir', () => {
  const guildId = 'filter-default-test'
  const store = loadStore()
  delete store.filterEnabled[guildId]
  assert.equal(isFilterEnabled(guildId), false)
  setFilterEnabled(guildId, true)
  assert.equal(isFilterEnabled(guildId), true)
})

test('YouTube yansıtma yalnızca seçilen sunucudaki hedef kullanıcıyı kullanır', () => {
  const store = loadStore()
  store.mirrorUser = { 'mirror-guild': 'user-123' }
  assert.equal(getMirrorUserId('mirror-guild'), 'user-123')
  assert.equal(getMirrorUserId('other-guild'), null)
})
