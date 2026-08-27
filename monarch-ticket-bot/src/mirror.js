const http = require('http')
const { ActivityType } = require('discord.js')
const { loadStore, saveStore, logTo } = require('./util')

const FALLBACK = { name: 'Monarch Store siparişleri', type: ActivityType.Watching }
const DEFAULT_PORT = 4321
const SILENT_RESET_MS = 75 * 1000

let lastTitle = ''
let lastAt = 0

function startLocal (client) {
  const port = Number(process.env.YOUTUBE_PORT) || DEFAULT_PORT
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ lastTitle, lastAt, age: lastAt ? Date.now() - lastAt : null }))
      return
    }
    if (req.method === 'POST' && req.url === '/nowplaying') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        let title = ''
        try { title = (JSON.parse(body).title || '').toString() } catch { title = body.trim() }
        if (title && title.toLowerCase() !== 'youtube') {
          try { client.user.setActivity(title, { type: ActivityType.Listening }) } catch {}
          lastTitle = title
          lastAt = Date.now()
          console.log('[SISTEM] Durum güncellendi (PC):', title)
        } else {
          try { client.user.setActivity(FALLBACK.name, { type: FALLBACK.type }) } catch {}
          lastTitle = ''
          lastAt = Date.now()
          console.log('[SISTEM] Durum sıfırlandı (PC).')
        }
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' })
        res.end('ok')
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.log('[SISTEM] Uyarı: 127.0.0.1:' + port + ' zaten kullanımda (bot zaten çalışıyor). İkinci kopya yerel takipçi olmadan devam ediyor.')
      console.log('[SISTEM] Tek kopya çalıştırmak için: ./bot.sh stop && npm start')
    } else {
      throw err
    }
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`[SISTEM] PC YouTube takipçisi açık: http://127.0.0.1:${port}/nowplaying`)
  })

  setInterval(() => {
    if (lastAt && Date.now() - lastAt > SILENT_RESET_MS) {
      lastTitle = ''
      lastAt = 0
      try { client.user.setActivity(FALLBACK.name, { type: FALLBACK.type }) } catch {}
      console.log('[SISTEM] 75 sn sessizlik → durum "By EverVerity"e döndü.')
    }
  }, 10000)
}

function setup (client) {
  client.on('presenceUpdate', (oldP, newP) => {
    if (!newP || !newP.user || newP.user.bot) return
    handle(client, newP).catch(() => null)
  })
}

function getMirrorUserId (guildId) {
  const store = loadStore()
  return guildId ? store.mirrorUser?.[guildId] || null : null
}

function extractYouTube (presence) {
  if (!presence || !presence.activities) return null
  const act = presence.activities.find((a) => a.name && a.name.toLowerCase() === 'youtube')
  if (!act) return null
  if (act.type !== ActivityType.Streaming && act.type !== ActivityType.Listening) return null
  const title = act.details || act.state || act.name
  const mode = act.state && String(act.state).toLowerCase() === 'watching' ? ActivityType.Watching : ActivityType.Listening
  return { title, mode }
}

async function handle (client, presence) {
  const target = getMirrorUserId(presence.guild?.id)
  if (!target || presence.userId !== target) return
  const yt = extractYouTube(presence)
  if (yt) {
    try { client.user.setActivity(yt.title, { type: yt.mode }) } catch {}
  } else {
    try { client.user.setActivity(FALLBACK.name, { type: FALLBACK.type }) } catch {}
  }
}

async function setMirror (interaction) {
  const target = interaction.options.getUser('kullanici')
  const store = loadStore()
  store.mirrorUser[interaction.guild.id] = target.id
  saveStore(store)
  await interaction.reply({ content: `✅ Bot artık \`${target.tag}\` kullanıcısının YouTube aktivitesini yansıtacak.`, ephemeral: true })
  await logTo(interaction.guild, `🎵 \`${interaction.user.tag}\` YouTube yansıtmayı \`${target.tag}\` hesabına bağladı.`)
}

module.exports = { setup, setMirror, getMirrorUserId, startLocal }
