# Monarch Ticket Bot

Bu paket, Monarch Store’daki **ödeme bilgisi almayan** ürün taleplerini Discord’daki özel ticketlara taşır. Bot, kendi bilgisayarında konsoldan çalışır. Bilgisayar veya bot kapalıysa yeni talepler Supabase kuyruğunda bekler; bot yeniden açıldığında kontrol edilir.

> Bot tokenı ve Supabase `service_role` anahtarı yalnızca senin bilgisayarındaki `.env` dosyasında kalmalıdır. Bu değerleri GitHub’a yükleme, site koduna ekleme veya mesajla paylaşma.

## Kısa kurulum

1. Bu klasörü bilgisayarındaki MonarchBot klasörünün yerine kopyala.
2. `config-template.txt` dosyasını kendi bilgisayarında `.env` olarak yeniden adlandır.
3. Eski botundaki `DISCORD_TOKEN` değerini yeni `.env` dosyasına **yalnızca yerelde** yaz.
4. Supabase Dashboard → **Project Settings → API Keys** bölümünden **Secret key / service_role** anahtarını `SUPABASE_SERVICE_ROLE_KEY=` satırına yaz.
5. `GUILD_ID=` satırına siparişlerin işleneceği tek Discord sunucusunun kimliğini yaz. Sunucu kimliği için bot konsolunda `sunucular` yazabilirsin.
6. Komut satırında bu klasörde sırayla `npm install` ve `npm start` çalıştır.

`CLIENT_ID` ve `SUPABASE_URL` şablonda hazır gelir. `ORDER_POLL_INTERVAL_MS=12000`, botun her 12 saniyede bir bekleyen talebi kontrol etmesi içindir. Yerel YouTube başlık yansıtma yardımcı uygulaması kullanmıyorsan `YOUTUBE_LOCAL_MIRROR=false` bırak.

## Discord tarafındaki bir kerelik seçimler

Bot **kanal veya rol yapısı oluşturmaz**. Önce Discord’da mevcut kaynaklarını kendin seç veya oluştur; sonra aşağıdaki komutları uygula.

| Amaç | Komut | Seçilecek mevcut Discord kaynağı |
|---|---|---|
| Sipariş akışı | `/siparis-kur` | `#satın-alım` metin kanalı, sipariş ticket kategorisi, ekip rolü, görüşme ses kanalı |
| Genel destek ticketları | `/ticket-ayarla` | Genel destek ticket kategorisi ve ekip rolü |
| Genel destek paneli | `/ticket-panel` | Panelin paylaşılacağı metin kanalı |
| Freeze | `/freeze-rolu` | Sunucuda zaten bulunan Freeze rolü |
| Freeze alanı | `/freeze-kanali` ve `/freeze-log` | Mevcut metin/ses kanalı ve mevcut log metin kanalı |
| Topluluk bildirimleri | `/hosgeldin-kanali`, `/boost-kanali` | Mevcut metin kanalları |

## Sipariş akışı

Ziyaretçi mağazadan ürünleri sepete ekler ve **Discord kullanıcı adını** yazar. Kart, banka hesabı veya ödeme bilgisi sorulmaz. Bot, kullanıcıyı hedef Discord sunucusunda yalnızca **tam kullanıcı adıyla** arar; görünen ad veya takma ad kabul edilmez.

| Durum | Botun davranışı |
|---|---|
| Tam üye eşleşmesi yok | Supabase talebi sessizce silinir. Discord’da ticket, satın alım bildirimi veya log oluşmaz. |
| Tam üye eşleşmesi var | Yalnızca müşteri ve seçilen ekip rolünün görebildiği özel ticket açılır; sonra `#satın-alım` kanalına özet bırakılır. |
| Ekip `/siraya-al` uygular | Doğrulanmış talep çakışmasız sıra numarasıyla `queued` durumuna geçer. |
| Ekip `/isleme-al` uygular | Sıradaki talep `in_progress` durumuna geçer. |
| Ekip `/sese-cektir` uygular | Müşteri hâlihazırda bir ses kanalındaysa seçili görüşme kanalına taşınır. |
| Ekip `/siparis-kapat` uygular | Talep kapanır; müşteri ticketta yazamaz, kanal `kapali-` önekiyle korunur. |

Sipariş kodları ticketta ve satın alım bildiriminde görünür. Aynı web talebi iki kez işlenmesin diye bot önce kaydı atomik olarak sahiplenir; bir hata olursa işlem kilidi beş dakika sonra güvenle bırakılır.

## Etkin özellikler

Paket; genel destek ticketları, mesaj silme, uyarı, ban/kick, süreli susturma, kanal kilidi/yavaş mod, duyuru/anket, isteğe bağlı küfür filtresi, spam/raid koruması, freeze, karşılama/takviye ve Discord Presence tabanlı YouTube durum yansıtmasını içerir. Küfür filtresi ve güvenlik varsayılan olarak pasiftir; yönetici komutuyla açılır. Yeni hesap/raid akışları, tanımlı **mevcut** Freeze rolü seçilmeden rol oluşturmaz veya üyeyi dondurmaz.

## Gerekli bot izinleri ve intentler

Bot rolüne en az **View Channels**, **Send Messages**, **Embed Links**, **Manage Channels**, **Manage Messages**, **Read Message History**, **Move Members**, **Moderate Members** ve **Manage Roles** izinlerini ver. Bot rolü, yönetmesi gereken rollerin üzerinde olmalıdır.

Discord Developer Portal’daki **Bot** bölümünde **Server Members Intent**, **Message Content Intent** ve **Presence Intent** seçeneklerini aç. `GuildVoiceStates` botta etkin olduğundan `/sese-cektir` komutu için ayrıca botun hedef ses kanalına bağlanabilmesi gerekir.

## Hızlı kontrol

Bot açıldıktan sonra konsolda `[AKTİF]` satırını görmelisin. Discord’da `/siparis-kur` komutunu bir kez çalıştır; ardından test için `/siparis-tara` kullanabilirsin. Gerçek uçtan uca kontrol için siteye sunucuda bulunan kendi Discord kullanıcı adınla küçük bir ürün talebi gönder. Bot açıkken özel ticket ve `#satın-alım` özetinin oluştuğunu kontrol et.
