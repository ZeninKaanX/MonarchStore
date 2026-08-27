const assert = require('node:assert/strict')
const test = require('node:test')
const { getFreezeRole } = require('../src/freeze')
const { loadStore } = require('../src/util')

test('freeze özelliği yapılandırılmamışsa bot rol oluşturmaz ve boş sonuç döndürür', () => {
  const store = loadStore()
  store.freezeRole = {}
  const guild = { id: 'test-guild', roles: { cache: new Map() } }
  assert.equal(getFreezeRole(guild), null)
})
