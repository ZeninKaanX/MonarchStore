require('dotenv').config()
const { Client, GatewayIntentBits } = require('discord.js')
const { setupFullServerHierarchy } = require('../src/server-setup')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
})

client.once('ready', async () => {
  console.log(`[BOT HAZIR] ${client.user.tag} olarak bağlanıldı.`)
  const guild = client.guilds.cache.get(process.env.GUILD_ID)
  if (!guild) {
    console.error('[HATA] Sunucu bulunamadı:', process.env.GUILD_ID)
    process.exit(1)
  }

  try {
    const result = await setupFullServerHierarchy(guild)
    console.log('[BAŞARILI] Sunucu kurulumu ve yönlendirmeleri tamamlandı!')
    console.log(result)
  } catch (err) {
    console.error('[KURULUM HATA]:', err)
  } finally {
    setTimeout(() => {
      client.destroy()
      process.exit(0)
    }, 2000)
  }
})

client.login(process.env.DISCORD_TOKEN)
