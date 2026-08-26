# GitHub Pages özel alan adı durumu

- GitHub deposu: `ZeninKaanX/MonarchStore`
- GitHub Pages kaynak dalı: `main` / kök dizin
- Özel alan adı: `astralissaga.xyz`
- DNS kayıtları: Yetkili Natro DNS’i (`ns2.natrohost.com`) ve Cloudflare, Google, Quad9 genel çözümleyicileri GitHub Pages için gerekli dört A kaydını döndürüyor: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
- `www` kaydı: `zeninkaanx.github.io` hedefli CNAME olarak ayarlanmış.
- GitHub Pages durumu: `built`; özel alan adı `astralissaga.xyz` olarak tanımlı. HTTP isteği Monarch Store içeriğini döndürüyor. HTTPS sertifikası hazırlanırken **Enforce HTTPS** seçeneği geçici olarak devre dışı; doğrulanan HTTPS isteğinde sertifika adı henüz alan adıyla eşleşmiyor.
- Natro yönlendirmesi incelemesi: Kullanıcının gördüğü eski Natro sayfası DNS/brows­er önbelleği kaynaklı geçici bir görünümle uyumlu. Güncel tarayıcı doğrulamasında `http://astralissaga.xyz/` doğrudan Monarch Store’u açıyor.
- Sonraki işlem: Sertifika hazır olduğunda **Enforce HTTPS** seçeneğini etkinleştirmek ve `https://astralissaga.xyz` erişimini test etmek.
