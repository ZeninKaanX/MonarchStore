# Uygulama Kontrol Listesi

- [x] NexusBotDC arşivindeki kanal kurma dışındaki komutları, moderasyon ve yönetim özelliklerini güvenli biçimde incelemek. _(Ticket, moderasyon, küfür filtresi, karşılama/takviye, güvenlik, freeze, durum yansıtma ve bilgi komutları belirlendi; otomatik kanal/rol kurulum modülleri hariç tutulacak.)_
- [x] Sipariş onayında Discord kullanıcı adıyla sunucu üyeliğini doğrulayan; eşleşme yoksa hiçbir sipariş, log veya ticket kaydı oluşturmayan iş kuralını tasarlamak. _(Tam kullanıcı adı eşleşmesi, atomik sahiplenme ve sessiz silme uygulanarak test edildi.)_
- [x] Doğrulanmış kullanıcı ve ekip rolü dışında kimsenin göremediği özel ticket kanalını oluşturmak. _(Herkese kapalı izin sözleşmesi birim testle doğrulandı.)_
- [x] NexusBotDC’den seçilen uyumlu özellikleri MonarchBot’a aktarırken çakışan veya güvenli olmayan işlevleri hariç tutmak. _(Otomatik kanal/rol kurulum komutları kaldırıldı; Freeze yalnızca yönetici mevcut rolü seçtiğinde çalışır.)_

- [ ] Supabase proje hesabında sipariş kuyruğu için proje URL’si, yayınlanabilir anahtar ve yerel botta kullanılacak gizli anahtar ayrımını kurmak.
- [ ] Discord satın alım metin kanalı ve görüşme ses kanalı kimliklerini bot yapılandırmasına eklemek.

- [ ] MonarchBot’un kullanıcının kendi bilgisayarında çalışan konsol sürecine uygun ücretsiz sipariş iletim yöntemini seçmek.
- [ ] Yerel çalıştırma için gerekli bot yapılandırmasını, token saklama yöntemini ve başlatma adımlarını belgelemek.

- [x] Gönderilen MonarchBot arşivindeki mevcut ticket komutlarını, yapılandırmayı ve veri akışını incelemek. _(Bot şu anda Discord.js v14 tabanlı konsol botu; ticket, sipariş ve sesli taşıma komutları henüz yok.)_
- [x] Site sipariş talebi, Discord kullanıcı adı, ürün özeti ve sıra durumunu içeren ödeme almayan sipariş modelini tanımlamak. _(Supabase şeması, RLS ve atomik kuyruk işlevleri uygulandı.)_
- [x] Sipariş talebini satın alım kanalına ticket olarak ileten güvenli bot entegrasyonunu uygulamak. _(Yerel gizli anahtar kurulumu sonrası canlı test bekliyor.)_
- [x] Yetkili ekip için sipariş sıraya alma, ticket kapatma ve kullanıcıyı ses kanalına taşıma komutlarını eklemek. _(`/siraya-al`, `/isleme-al`, `/sira-listesi`, `/sese-cektir`, `/siparis-kapat` eklendi.)_
- [x] Sitede sepetten talep oluşturma akışını, Discord kullanıcı adı onayını ve “işleminiz sıraya alındı” durumunu eklemek. _(27 Ağustos 2026: geçersiz kullanıcı adı reddi ve anonim Supabase `pending_validation` ekleme akışı gerçek tarayıcıda doğrulandı.)_
- [ ] Botu sürekli çalışacak uygun barındırmaya almak ve uçtan uca sipariş akışını test etmek.

- [x] Discord OAuth bağlantılarını GitHub Pages vitrinden kaldırmak.
- [x] Tarayıcı yerel depolamasını kullanan hesap oluşturma, giriş ve çıkış arayüzünü eklemek.
- [ ] Yerel hesap akışını masaüstü ve mobilde test edip GitHub Pages ana dalına aktarmak. _(Ana dala aktarıldı; canlı masaüstü/mobil etkileşimli doğrulama sürüyor.)_

- [x] Ücretsiz planla özel alan adı ve sunucu tarafı Discord OAuth destekleyen uygun harici barındırma seçeneğini belirlemek. _(Kapatıldı: kullanıcı harici barındırma/DNS taşımasıyla uğraşmak istemiyor.)_
- [x] Seçilen ücretsiz barındırma için Discord OAuth sunucu paketini çalışır hâle getirmek. _(Kapatıldı: kullanıcı statik yerel hesap akışını seçti.)_
- [x] astralissaga.xyz alan adını seçilen ücretsiz sunuculu yayına yönlendirmek ve Discord callback adresini güncellemek. _(Kapatıldı: alan adı GitHub Pages’te kalacak.)_

- [x] Ücretsiz Manus yayın adresinde “Discord ile giriş” düğmesinin Discord yetkilendirme sayfasına açıldığını doğrulamak.
- [x] Discord OAuth ücretsiz yayın adresinde çalışmazsa Manus OAuth bağımlılığını kaldırıp yerel hesap oluşturma/giriş yaklaşımını belirlemek.
- [ ] Seçilen ücretsiz giriş yöntemini mağazada doğrulamak ve kullanıcıya çalışır bağlantıyı bildirmek.

- [x] `astralissaga.xyz` alan adını Manus proje ayarlarındaki Domains bölümüne eklemek ve verilen doğrulama hedefini almak. _(Kapatıldı: ücretsiz planda özel alan adı bağlama mevcut değil.)_
- [x] Natro’daki GitHub Pages A/CNAME kayıtlarını Manus’un doğrulama hedefiyle değiştirmek. _(Kapatıldı: alan adı GitHub Pages’te kalacak.)_
- [x] `https://astralissaga.xyz/api/auth/discord/callback` adresini Discord Developer Portal’a eklemek. _(Kapatıldı: statik GitHub Pages sürümünde Discord OAuth kaldırıldı.)_
- [x] `astralissaga.xyz` üzerinden mağaza ve Discord OAuth başlangıç rotasını HTTPS ile doğrulamak. _(Kapatıldı: statik GitHub Pages sürümünde Discord OAuth kaldırıldı.)_

- [x] Canlı `/api/auth/discord` rotasının Discord yetkilendirme isteğini doğru callback URI ve CSRF state ile oluşturduğunu hesap girişi olmadan doğrulamak.
- [x] Canlı callback rotasının geçersiz veya eksik state değerlerini güvenli biçimde reddettiğini doğrulamak.

- [x] Yayınlanan Manus alan adında Discord OAuth başlangıç rotasının yanıt verdiğini doğrulamak.
- [x] Discord Developer Portal’a `https://monarchshop-ns7bgnqa.manus.space/api/auth/discord/callback` canlı callback adresini eklemek.
- [x] Canlı Discord girişinden sonra kullanıcı oturumunun Monarch Store’a döndüğünü doğrulamak. _(Kapatıldı: kullanıcı yerel hesap akışını seçti.)_
- [x] `astralissaga.xyz` alan adını sunuculu yayına geçirip HTTPS ile nihai erişimi doğrulamak. _(Kapatıldı: alan adı GitHub Pages’te kalacak.)_

- [x] Discord Developer Portal’daki canlı geri dönüş adresini doğrulamak. _(Kapatıldı: statik GitHub Pages sürümünde Discord OAuth kaldırıldı.)_
- [x] Sunucuda CSRF korumalı Discord OAuth başlangıç ve callback akışını uygulamak.
- [x] Discord kullanıcısını güvenli oturumla eşleyip oturum sonlandırma akışını eklemek.
- [x] Mağaza arayüzüne erişilebilir “Discord ile giriş” kontrolünü ve giriş durumunu yerleştirmek.
- [x] Discord girişini canlı alan adıyla doğrulayıp yayın mimarisini güncellemek. _(Kapatıldı: kullanıcı statik yerel hesap akışını seçti.)_

- [ ] Kullanıcının gördüğü Natro park sayfasının hangi DNS önbelleği veya aktif Natro park ayarından geldiğini kesinleştirmek.
- [ ] Natro panelindeki park/yönlendirme ayarını veya çakışan DNS kaydını kaldırarak kök alan adını yalnızca GitHub Pages’e yönlendirmek.
- [x] Kullanıcı cihazında HTTP erişiminin Monarch Store’u açtığını, HTTPS sertifikası hazır olduğunda da güvenli erişimin çalıştığını yeniden doğrulamak. _(HTTPS 200 yanıtı ve alan adına ait sertifika doğrulandı.)_

- [x] `astralissaga.xyz` alan adının Natro yönlendirmesine neden olan DNS veya web yönlendirme kaynağını tespit etmek. _(Yayılım sürecindeki eski DNS önbelleği; yetkili Natro DNS’i ve genel çözümleyiciler artık GitHub Pages’in dört A kaydını döndürüyor.)_
- [x] GitHub Pages’e yönelimi engelleyen Natro ayarını veya eski DNS kaydını düzeltmek. _(Ek panel değişikliği gerekmedi; etkin yetkili kayıtlar GitHub Pages’e doğru.)_
- [x] Alan adının MonarchStore GitHub Pages sitesine ve HTTPS’e doğru yönlendiğini doğrulamak. _(GitHub Pages üzerinden HTTPS 200 yanıtı ve geçerli alan adı sertifikası alındı.)_
- [x] GitHub Pages ayarlarındaki özel alan adı bağının kayıtlı olduğunu doğrulayıp HTTPS sertifikasının `astralissaga.xyz` için hazırlanmasını beklemek. _(Alan adı Pages ayarında kayıtlıydı; DNS denetimi başarıyla tamamlandı ve HTTPS zorlaması etkinleştirildi.)_

- [x] GitHub deposunu `htmlXYZ` adından `MonarchStore` adına değiştirmek.
- [x] Yeni GitHub Pages adresi ile özel alan adı ayarının devamlılığını doğrulamak.
- [ ] Yeni depo bağlantısını kullanıcıya iletmek.

- [x] `astralissaga.xyz` alan adını GitHub Pages ayarına eklemek.
- [x] Gerekli DNS kayıtlarını doğrulamak ve alan adının yayın durumunu kontrol etmek.
- [ ] Özel alan adı bağlantı sonucunu kullanıcıya iletmek.

- [x] GitHub Pages için bağımsız Monarch Store HTML dosyasını `index.html` olarak ana dala eklemek.
- [x] htmlXYZ deposunda GitHub Pages yayınını etkinleştirmek.
- [x] GitHub Pages canlı adresini doğrulamak ve kullanıcıya iletmek.

- [x] Mevcut Monarch Store sayfasını bağımsız bir HTML dosyası olarak hazırlamak.
- [x] HTML dosyasındaki görsel, video ve Discord bağlantılarını doğrulamak.
- [x] Bağımsız HTML dosyasını kullanıcıya teslim etmek.

- [x] Discord ile giriş düğmesini ve OAuth sunucu yönlendirmelerini kaldırmak.
- [x] Discord topluluk bağlantılarını ve mağaza görünümünü doğrulamak.
- [x] Kararlı sürümü htmlXYZ GitHub deposuna aktarmak.

- [x] Discord Developer Portal’da canlı alan adı için `/api/auth/discord/callback` Redirect URI’sini yapılandırmak. _(Kapatıldı: kullanıcı OAuth akışını kaldırdı.)_
- [x] Discord OAuth girişini tarayıcıda uçtan uca doğrulamak. _(Kapatıldı: kullanıcı OAuth akışını kaldırdı.)_
- [x] Doğrulanan Discord OAuth değişikliklerini htmlXYZ deposuna son hâliyle aktarmak. _(Kapatıldı: kullanıcı OAuth akışını kaldırdı.)_

- [x] Sağlanan Discord OAuth kimlik bilgilerini güvenli proje ayarlarına eklemek.
- [x] Gerçek Discord OAuth giriş ve callback akışını uygulamak.
- [x] Discord girişini doğrulayıp htmlXYZ GitHub deposuna son değişiklikleri aktarmak. _(Kapatıldı: kullanıcı OAuth akışını kaldırdı.)_

- [x] Discord OAuth girişinin ihtiyaç duyduğu uygulama kimlik bilgilerini ve proje yeteneklerini doğrulamak.
- [x] GitHub hesabı erişimini ve htmlXYZ depo oluşturma yetkisini doğrulamak.
- [x] Discord giriş seçeneğini eklemek ve GitHub deposuna güvenli biçimde aktarmak. _(Kapatıldı: kullanıcı OAuth akışını kaldırdı.)_

- [x] Anime karakterini merkez alan kısa hareketli hero sahnesini hazırlamak. _(Takip işine kapatıldı: kullanıcı yarın devam etmek istiyor.)_

- [x] Paylaşılan anime karakteri merkezli, daha uzun hareketli hero videosunu üretmek. _(Takip işine kapatıldı: kullanıcı yarın devam etmek istiyor.)_
- [x] Robot videosunu kaldırıp yeni anime videosunu hero paneline yerleştirmek. _(Takip işine kapatıldı: kullanıcı yarın devam etmek istiyor.)_
- [x] Anime karakterli hero panelini masaüstü ve mobilde doğrulamak. _(Takip işine kapatıldı: kullanıcı yarın devam etmek istiyor.)_

- [x] Monarch temasına uyumlu insansı 3B robotun hareketli kısa sahnesini üretmek.
- [x] Hareketli robot sahnesini hero paneline döngülü video olarak eklemek.
- [x] Hareketli robot panelini masaüstü ve mobilde doğrulamak.

- [x] Spline sahnesi yerine soğuk savaş temalı özgün robot görseli üretmek.
- [x] Özgün robot görselini hero paneline yerleştirip Spline imzasını kaldırmak.
- [x] Yeni robot panelini masaüstü ve mobilde doğrulamak.

- [x] Robot panelindeki “Built with …” imzasını görünümden kaldırmak.
- [x] Robot sahnesinin işlevselliğini koruyarak güncel paneli doğrulamak.

- [x] Tüm satın alma düğmelerini kullanıcı Discord davet bağlantısına yönlendirmek.
- [x] Anime karakterini beyaz fonla Monarch logosunun hemen yanında hizalamak.
- [x] Yeni satın alma akışını ve başlık yerleşimini masaüstü ile mobilde doğrulamak.

- [x] Anime karakter varlığındaki kareli fonu kaldırarak gerçek alpha kanallı PNG elde etmek.
- [x] Maskot yüklenirken görünen görsel alanı, başlık zeminiyle uyumlu hâle getirmek.

- [x] Anime karakter görselinin arka planını kaldırarak transparan PNG olarak hazırlamak.
- [x] Anime karakteri Monarch Store logosunun yanına yerleştirmek.
- [x] Discord davet bağlantısını görünür bir katılım alanına bağlamak.
- [x] Marka alanını ve Discord yönlendirmesini masaüstü ile mobilde doğrulamak.

- [x] AFK, Miner ve Farmer için referans kompozisyona uygun üç ayrı ürün görseli oluşturmak.
- [x] Monarch Store kelime logosunu transparan arka planla hazırlamak.
- [x] Yeni görselleri her bot kartına ve logo alanlarına yerleştirmek.
- [x] Ürün kartı ve logo güncellemesini masaüstü ve mobilde doğrulamak.

- [x] Ana robot alanına sürüklenebilir etkileşimli 3B sahneyi yeniden eklemek.

- [x] Robot alanındaki arka planı daha soğuk savaş atmosferi verecek şekilde düzenlemek.

- [x] Son gönderilen savaş alanı görselini robot alanının arka planı olarak yüklemek.
- [x] Monarch kelime logosunu başlıkta görünür biçimde kullanmak.
- [x] AFK, Miner ve Farmer kartlarının üçünü de aynı kullanıcı görseliyle sadeleştirmek.
- [x] Ürün dilini Minecraft içi ürün satışına uyarlamak ve dekoratif öğeleri azaltmak.
- [x] Güncellenen tek HTML sayfasını masaüstü ve mobilde doğrulamak.

- [x] Spline bileşenini ve izleme ışığı efektini Monarch Store bileşen yapısına uyarlamak.
- [x] 3B sahneyi ek bağımlılık gerektirmeyen bir HTML web bileşeni olarak yerleştirmek.
- [x] Spline sahnesini ana görev paneline, performansı koruyacak şekilde yerleştirmek.
- [x] Referans görselleri, oluşturulan varlıkları ve mağaza etkileşimlerini tek HTML çıktısında birleştirmek.
- [x] Masaüstü ve mobil görünümde tasarımı doğrulamak; son HTML dosyasını hazırlamak.

- [x] Sipariş satırını atomik olarak sahiplenip tekrarlayan Discord ticket veya satın alım bildirimi riskini engellemek. _(Supabase işlevleri ve idempotent Discord işaretçileri eklendi.)_
- [x] Eşleşmeyen Discord kullanıcı adı için yalnızca kuyruk kaydını sessizce kaldıran bot davranışını birim testle doğrulamak. _(Tam kullanıcı adı doğrulaması için birim testi eklendi; gerçek Discord testi yerel kurulumdan sonra yapılacak.)_
- [x] Yalnızca müşteri ve yapılandırılmış ekip rolüne görünür özel sipariş ticket izinlerini test etmek.
- [x] Sıra alma, işleme alma, ses kanalına çekme ve kapatma komutlarının durum değişimlerini netleştirmek.
- [x] Monarch markalı moderasyon, karşılama, güvenlik, freeze ve durum yansıtma modüllerini otomatik kanal/rol kurulumu olmadan gözden geçirmek.
- [x] Yerel bot paketi, kullanım belgesi ve gizli anahtar şablonunu güvenli şekilde teslim için hazırlamak.
- [ ] Kullanıcının kendi bilgisayarında gizli anahtarları yerel `.env` dosyasına ekleyip gerçek Discord sunucusunda uçtan uca ticket ve ses taşıma testini yapması.
- [x] Eşleşmeyen Discord kullanıcı adında `processGuild` akışının kaydı sildiğini, ticket ve satın alım bildirimi oluşturmadığını sahte Supabase/Discord nesneleriyle test etmek. _(13 testin tamamı geçti; sessiz silme dalında ticket ve satın alım mesajı çağrıları sıfırlandı.)_

- [x] Sunucuda doğrulanıp sıraya alınan müşteriye yalnızca mevcut `Talep` rolünü atamak; rol yoksa ticket veya sipariş bildirimi oluşturmamak. _(17 test geçti; rol yoksa ticket ve satın alım bildirimi çağrılarının ikisi de sıfır kaldı.)_
- [x] `Talep` rolünün diğer müşterilerin ticketlarını görmesine izin vermeden özel ticket erişimini müşteri ve `Satış Ekibi` ile sınırlamak. _(`Talep` rolü ticket izin listesine eklenmedi; yalnızca doğrulanmış müşteri etiketi olarak atanır.)_
- [x] Yalnızca güncellenen bot dosyasını test edip paylaşılabilir tek dosyalık teslim hazırlamak. _(`orders.js` sözdizimi ve 17 test başarıyla geçti; kullanıcıya yalnızca bu dosya verilecek.)_

- [x] `service_role` için `order_requests` tablo yetkisini tamamlamak. _(27 Ağustos 2026: tablo izinleri ve atomik işlev yürütme izinleri Supabase SQL Editor’de başarıyla uygulandı.)_
- [ ] Yerel bot yeniden başlatıldıktan sonra `/sira-listesi` ve gerçek sipariş doğrulama akışının yetki hatası vermediğini kullanıcı konsolunda doğrulamak.

- [x] `astralissaga.xyz` alan adında görünen GitHub Pages 404 hatasının yayın, CNAME ve DNS kaynağını teşhis etmek. _(Neden: GitHub Pages kaynak seçimi `None` durumuna dönmüş, yani yayın devre dışı kalmıştı.)_
- [x] GitHub Pages özel alan adı eşleşmesini onarıp canlı HTTPS mağaza erişimini yeniden doğrulamak. _(Pages yayını `main` dalının kök dizininden yeniden etkinleştirildi; `https://astralissaga.xyz` tekrar HTTP 200 ve Monarch Store içeriği döndürüyor.)_

- [x] Hero alanındaki robot videosunu anime karakter merkezli kısa hareketli sahneyle değiştirmek. _(1280×720, 8 saniyelik sessiz H.264 video oluşturuldu ve kalıcı statik varlık olarak yüklendi.)_
- [x] Yeni hero videosunun masaüstü/mobil mağaza görünümünü doğrulayıp GitHub Pages’e aktarmak. _(Masaüstü/mobil önizleme, 5 Vitest testi ve üretim derlemesi başarıyla tamamlandı.)_

- [x] Video kotası yenilenene kadar yanlış robot içeren videoyu kaldırıp anime karakter ilk karesini hafif hareketli hero görseli olarak kullanmak. _(Robot içeren video kaynak koddan tamamen çıkarıldı; anime karakterli hero görseli masaüstünde doğrulandı ve 5 test ile üretim derlemesi geçti.)_
