# Supabase Sipariş Kuyruğu Kurulum Notu

- Supabase hesabında **Monarch Store** adlı ücretsiz organizasyon oluşturuldu; organizasyon yolu `https://supabase.com/dashboard/org/spdluegbweqbsjvorbhm`.
- Yeni proje adı **Monarch Sipariş Kuyruğu** olarak belirlendi.
- Site, talep eklemek için yalnızca Supabase publishable anahtarını kullanacak; botun sipariş okuma ve güncelleme yetkisi veren secret/service-role anahtarı yalnızca kullanıcının bilgisayarındaki `.env` dosyasında tutulacak.
- Proje kurulurken Data API açık bırakılacak, otomatik tablo dışa açma kapalı tutulacak ve otomatik RLS etkin bırakılacak. Tablo ve RLS politikaları daha sonra elle, en az yetki ilkesiyle oluşturulacak.
- Proje bölgesi olarak `eu-west-3` (West EU / Paris) seçildi; oluşturma isteği 27 Ağustos 2026 tarihinde gönderildi.
- Data API açık, otomatik tablo dışa açma kapalı ve otomatik RLS açık olacak şekilde proje güvenlik seçenekleri ayarlandı.
- Sipariş kuralları revize edildi: yalnızca Discord sunucusunda eşleşen üyeler için özel ticket oluşturulacak; eşleşme yoksa bot talebi silerek Discord’da log veya mesaj üretmeyecek.
- `public.order_requests` tablosu, RLS kuralları, ziyaretçi bazlı aktif talep sınırı ve botun güncelleyeceği ticket/sıra alanlarıyla başarıyla oluşturuldu. Sorgu 27 Ağustos 2026 tarihinde Supabase SQL Editor’de başarıyla tamamlandı.
- Supabase Auth’ta anonim giriş etkinleştirildi. Böylece GitHub Pages ziyaretçisi, e-posta/şifre istemeden `authenticated` rolüyle yalnızca kendi sipariş talebini oluşturabilir ve durumunu görüntüleyebilir.

## Kaynaklar

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/getting-started/api-keys
- https://docs.discord.com/developers/platform/webhooks
- https://docs.discord.com/developers/topics/permissions
