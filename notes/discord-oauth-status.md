# Discord OAuth canlı doğrulama durumu

- Yayınlanan sunucu alan adı: `https://monarchshop-ns7bgnqa.manus.space`.
- Başlangıç rotası `GET /api/auth/discord`, canlı ortamda HTTP 302 ile Discord yetkilendirme adresine yönleniyor.
- Canlı yönlendirme adresi: `https://monarchshop-ns7bgnqa.manus.space/api/auth/discord/callback`.
- Başlangıç rotası 10 dakika geçerli, `HttpOnly`, `Secure`, `SameSite=Lax` nitelikli rastgele bir CSRF state çerezi oluşturuyor.
- Eşleşmeyen state ile callback isteği HTTP 403 döndürüyor ve state çerezini temizliyor.
- Kullanıcı Discord hesabıyla yetkilendirme yapılmadığından gerçek kullanıcı token değişimi ve oturum dönüşü henüz kullanıcı hesabı olmadan doğrulanmadı.
- Ücretsiz Manus yayın adresindeki giriş düğmesi Discord yetkilendirme ekranına yönlendiriyor; bu doğrulama özel alan adına uygulanamaz çünkü ücretsiz Manus planda özel alan adı bağlama özelliği kapalıdır.
- Statik GitHub Pages sürümünde Discord OAuth arayüzü kaldırıldı ve yerel hesap akışı eklendi. GitHub Pages derlemesi `c433f45` commit’i için `built` durumuna ulaştı; HTTP isteği güncel HTML içinde `Hesap oluştur` metnini döndürüyor. Bazı tarayıcı istekleri eski başlık önbelleğini gösterebildiğinden canlı doğrulamada önbellek atlayan bir URL kullanılmalıdır.
- Canlı doğrulamada `http://astralissaga.xyz/?account-check=c433f45` adresindeki **Hesap oluştur** düğmesi kayıt penceresini açtı. Pencerede kullanıcı adı, şifre, şifre tekrar alanları ve girişe geçiş kontrolü görünür durumda.
- İlk canlı hesap oluşturma denemesinde HTTP bağlamında `crypto.subtle` kullanılamadığı için parola özeti hatası görüldü. Yerel hesap betiğine Web Crypto olmayan HTTP bağlamları için yalnızca cihaz içi kullanım amaçlı uyumluluk özeti eklendi; bu sistem sunucu tarafı kimlik doğrulama değildir.
- Mevcut `astralissaga.xyz` alan adı hâlâ GitHub Pages’e bağlıdır. Canlı Discord OAuth için alan adı sunuculu Manus yayınına bağlanmalı; ardından callback adresi `https://astralissaga.xyz/api/auth/discord/callback` olarak Discord Developer Portal’a ayrıca eklenmelidir.
