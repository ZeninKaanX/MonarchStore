const fs = require('fs')
const path = require('path')

const DATA_FILE = path.join(__dirname, '..', 'data', 'store.json')

const RANK = {
  'Owner': 100,
  'Founder': 90,
  'Co-Founder': 80,
  'Chief Admin': 70,
  'Admin': 60,
  'Moderator': 50,
  'Chief Staff': 40,
  'Staff': 30,
  'Monarch Crew': 20,
  'Monarch': 10,
  'Monarch Trial': 5
}

function loadJSON (file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function saveJSON (file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

// Store her mesaj/filtre/security olayinda diskten okunmamasi icin bellek icinde
// tutulur. Ilk cagrida bir kez okunur, saveStore her yazimda hem diske yazar hem
// de bellegi gunceller. Davranis degismez, sadece per-mesaj senkron disk I/O'su
// (readFileSync + JSON.parse) ortadan kalkar.
let storeCache = null

function loadStore () {
  if (storeCache) return storeCache
  const s = loadJSON(DATA_FILE) || {}
  s.warnings = s.warnings || {}
  s.badwords = s.badwords || {}
  s.filterEnabled = s.filterEnabled || {}
  s.guildIds = s.guildIds || []
  s.welcomeChannel = s.welcomeChannel || {}
  s.boostChannel = s.boostChannel || {}
  s.security = s.security || {}
  s.freezeChannel = s.freezeChannel || {}
  s.freezeRole = s.freezeRole || {}
  s.freezeLogChannel = s.freezeLogChannel || {}
  s.frozen = s.frozen || {}
  s.mirrorUser = s.mirrorUser || {}
  s.orderSettings = s.orderSettings || {}
  s.generalTicketSettings = s.generalTicketSettings || {}
  storeCache = s
  return s
}

function saveStore (s) {
  storeCache = s
  saveJSON(DATA_FILE, s)
}

function getRank (member) {
  if (!member || !member.guild) return 0
  if (member.id === member.guild.ownerId) return 100
  let best = 0
  for (const role of member.roles.cache.values()) {
    const r = RANK[role.name]
    if (r !== undefined && r > best) best = r
  }
  return best
}

function findRole (guild, target) {
  if (!guild || !target) return null
  const query = String(target).toLowerCase().trim()
  if (/^\d+$/.test(query)) return guild.roles.cache.get(query) || null
  if (query.startsWith('<@&')) {
    const id = query.match(/\d+/)
    if (id) return guild.roles.cache.get(id[0]) || null
  }
  return guild.roles.cache.find((r) => r.name.toLowerCase() === query) || null
}

function findMember (guild, target) {
  if (!guild || !target) return null
  const query = String(target).toLowerCase().trim()
  if (/^\d+$/.test(query)) return guild.members.cache.get(query) || null
  if (query.startsWith('<@')) {
    const id = query.match(/\d+/)
    if (id) return guild.members.cache.get(id[0]) || null
  }
  return guild.members.cache.find((m) => m.user.username.toLowerCase() === query || (m.nickname && m.nickname.toLowerCase() === query)) || null
}

function findChannel (guild, target) {
  if (!guild || !target) return null
  const query = String(target).toLowerCase().trim()
  if (/^\d+$/.test(query)) return guild.channels.cache.get(query) || null
  if (query.startsWith('<#')) {
    const id = query.match(/\d+/)
    if (id) return guild.channels.cache.get(id[0]) || null
  }
  const wanted = query.replace(/^#/, '')
  return guild.channels.cache.find((c) => c.name.toLowerCase() === wanted) || null
}

async function logTo (guild, text, channelName) {
  if (!guild) return
  const ch = findChannel(guild, channelName || 'mod-log')
  if (ch && ch.isTextBased()) {
    try { await ch.send(text) } catch {}
  }
}

function normalize (str) {
  const map = {
    'ş': 's', 'ç': 'c', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ı': 'i',
    'â': 'a', 'î': 'i', 'û': 'u', 'ê': 'e', 'â': 'a'
  }
  let out = String(str).toLowerCase()
  out = out.replace(/[şçğüöıâîûê]/g, (c) => map[c])
  out = out.replace(/4/g, 'a').replace(/0/g, 'o').replace(/1/g, 'i')
    .replace(/3/g, 'e').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/6/g, 'g').replace(/8/g, 'b').replace(/2/g, 'z')
    .replace(/@/g, 'a').replace(/\$/g, 's').replace(/!/g, 'i')
  return out
}

function checkProfanity (raw, wordSet) {
  const text = normalize(raw)
  const tokens = text.split(/[^a-z0-9]+/).filter((t) => t.length > 0)
  for (const t of tokens) {
    if (wordSet.has(t)) return true
  }
  const stripped = text.replace(/[^a-z0-9]/g, '')
  for (const w of wordSet) {
    if (w.length >= 4 && stripped.includes(w)) return true
  }
  return false
}

function embed (data) {
  return { embeds: [{ color: 0x2ecc71, ...data }] }
}

module.exports = {
  loadJSON, saveJSON, loadStore, saveStore,
  RANK, getRank,
  findRole, findMember, findChannel, logTo,
  normalize, checkProfanity, embed
}
