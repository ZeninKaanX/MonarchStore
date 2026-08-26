# Discord OAuth canlı doğrulama durumu

- Yayınlanan sunucu alan adı: `https://monarchshop-ns7bgnqa.manus.space`.
- Başlangıç rotası `GET /api/auth/discord`, canlı ortamda HTTP 302 ile Discord yetkilendirme adresine yönleniyor.
- Canlı yönlendirme adresi: `https://monarchshop-ns7bgnqa.manus.space/api/auth/discord/callback`.
- Başlangıç rotası 10 dakika geçerli, `HttpOnly`, `Secure`, `SameSite=Lax` nitelikli rastgele bir CSRF state çerezi oluşturuyor.
- Eşleşmeyen state ile callback isteği HTTP 403 döndürüyor ve state çerezini temizliyor.
- Kullanıcı Discord hesabıyla yetkilendirme yapılmadığından gerçek kullanıcı token değişimi ve oturum dönüşü henüz kullanıcı hesabı olmadan doğrulanmadı.
- Ücretsiz Manus yayın adresindeki giriş düğmesi Discord yetkilendirme ekranına yönlendiriyor; bu doğrulama özel alan adına uygulanamaz çünkü ücretsiz Manus planda özel alan adı bağlama özelliği kapalıdır.
- Mevcut `astralissaga.xyz` alan adı hâlâ GitHub Pages’e bağlıdır. Canlı Discord OAuth için alan adı sunuculu Manus yayınına bağlanmalı; ardından callback adresi `https://astralissaga.xyz/api/auth/discord/callback` olarak Discord Developer Portal’a ayrıca eklenmelidir.
