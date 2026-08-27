# MonarchBot Sipariş ve Ticket Komut Tasarımı

Site, ürün kodları ve toplam fiyatla birlikte yalnızca kullanıcının Discord kullanıcı adını sipariş kuyruğuna gönderir. Kart, IBAN veya başka ödeme verisi kaydedilmez. Her talep önce `pending_validation` durumuyla başlar. Yerel bilgisayarda çalışan bot, Discord sunucusunda tam kullanıcı adıyla tek bir üye eşleşmesi bulursa talebi `queued` yapar ve yalnızca o üyeye ve ekip rolüne görünür özel bir ticket kanalı oluşturur. Üye eşleşmesi yoksa bot kaydı siler; Discord'da hiçbir mesaj, log veya ticket üretilmez.

| Komut | Yetki | İşlev |
|---|---|---|
| `/siparis-kur` | Sunucuyu Yönet | Satın alım kanalı, ticket kategorisi, görüşme ses kanalı ve ekip rolünü seçerek ayarlar. |
| `/siraya-al kod` | Ekip rolü | Talebi `queued` yapar, sıra konumunu atar ve ticket özetini günceller. |
| `/sira-listesi` | Ekip rolü | Açık talepleri oluşturma sırasına göre yalnızca yetkiliye gösterir. |
| `/sese-cektir kod` | Ekip rolü | Talep sahibini Discord kullanıcı adına göre sunucuda arar; tek eşleşme varsa ve kullanıcı bir ses kanalındaysa ayarlanan görüşme kanalına taşır. |
| `/ticket-kapat kod` | Ekip rolü | Talebi kapatır ve ticket kanalını arşivler veya siler. |

Bot, Discord kullanıcı adını yalnızca Discord sunucusu üyeleri arasında tam eşleşme ile kabul eder. Eşleşme bulunamazsa veya birden çok üye dönerse işlem yapılmaz; sipariş kaydı silinir ve hiçbir Discord kaydı üretilmez. `sese-cektir` komutu da üyeyi taşıma işleminden önce aynı kontrolü yapar. Ticket kanalları, varsayılan olarak `@everyone` için gizlidir; yalnızca doğrulanan üye ve ekip rolü yazabilir.
