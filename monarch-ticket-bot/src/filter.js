const fs = require('fs')
const path = require('path')
const { normalize, checkProfanity, loadStore, saveStore, logTo, findChannel } = require('./util')
const { freezeMember } = require('./freeze')

const BASE_WORDS = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'badwords.json'), 'utf8')).words || [])

// Kelime seti sunucu basina bir kez normalize edilip cache'lenir; her mesajda
// yeniden normalize + Set kurulumu yapilmaz. addWord/removeWord/setFilterEnabled
// cache'i ilgili sunucu icin sifirlar.
const wordSetCache = new Map()

function getWordSet (guildId) {
  const cached = wordSetCache.get(guildId)
  if (cached) return cached
    const store = loadStore()
    const custom = store.badwords[guildId] || []
    const set = new Set()
    for (const w of [...BASE_WORDS, ...custom]) {
      const n = normalize(w).trim()
      if (n) set.add(n)
    }
    wordSetCache.set(guildId, set)
    return set
}

function setFilterEnabled (guildId, enabled) {
  const store = loadStore()
  store.filterEnabled[guildId] = enabled
  saveStore(store)
}

function isFilterEnabled (guildId) {
  const store = loadStore()
  return store.filterEnabled[guildId] === true
}

function addWord (guildId, word) {
  const store = loadStore()
  store.badwords[guildId] = store.badwords[guildId] || []
  const n = normalize(word)
  if (store.badwords[guildId].includes(n)) return false
  store.badwords[guildId].push(n)
  wordSetCache.delete(guildId)
  saveStore(store)
  return true
}

function removeWord (guildId, word) {
  const store = loadStore()
  store.badwords[guildId] = store.badwords[guildId] || []
  const n = normalize(word)
  const before = store.badwords[guildId].length
  store.badwords[guildId] = store.badwords[guildId].filter((w) => w !== n)
  if (before !== store.badwords[guildId].length) {
    wordSetCache.delete(guildId)
    saveStore(store)
    return true
  }
  return false
}

async function handleMessage (message) {
  if (message.author.bot || !message.guild) return
  if (!isFilterEnabled(message.guild.id)) return
  const wordSet = getWordSet(message.guild.id)
  if (wordSet.size === 0) return

  const content = message.content || ''
  if (!checkProfanity(content, wordSet)) return

  try {
    if (message.deletable) await message.delete()
  } catch {}

  const store = loadStore()
  const gid = message.guild.id
  store.warnings[gid] = store.warnings[gid] || {}
  store.warnings[gid][message.author.id] = store.warnings[gid][message.author.id] || []
  store.warnings[gid][message.author.id].push({ ts: Date.now(), reason: 'Küfür filtresi' })
  const list = store.warnings[gid][message.author.id]
  saveStore(store)

  const warnCount = list.length
  const notice = await message.channel.send(
    `${message.author}, küfür/uygunsuz dil filtresine takıldın (uyarı #${warnCount}). Mesajın silindi.`
  ).catch(() => null)
  if (notice) setTimeout(() => notice.delete().catch(() => null), 6000)

  await logTo(message.guild,
    `🚫 **Küfür Filtresi** — ${message.author} (${message.author.id})\n**Mesaj:** \`${content.slice(0, 400)}\`\n**Kanal:** ${message.channel}\n**Uyarı #${warnCount} — <t:${Math.floor(Date.now() / 1000)}:R>`)

  if (warnCount >= 2) {
    try {
      await freezeMember(message.guild, message.member, `Küfür filtresi ihlali (${warnCount}. kez): ${content.slice(0, 100)}`, 'Sistem')
      await message.channel.send(`${message.author} art arda küfür kullandığı için **donduruldu** (freeze). Sebep **Freeze-Log** kanalına düştü.`).catch(() => null)
      store.warnings[gid][message.author.id] = []
      saveStore(store)
      await logTo(message.guild, `🧊 ${message.author} küfür filtresini ${warnCount} kez ihlal etti → **FREEZE**.`)
    } catch {}
  }
}

module.exports = { handleMessage, getWordSet, addWord, removeWord, setFilterEnabled, isFilterEnabled }
