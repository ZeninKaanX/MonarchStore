# Sipariş Akışı Doğrulama Kaydı — 27 Ağustos 2026

Geliştirme önizlemesinde ürün ekleme, sepet açma ve sipariş penceresi doğrulandı. Geçersiz, boşluk içeren Discord kullanıcı adı tarayıcı tarafında reddedildi; Supabase'e istek gönderilmedi.

`monarch.ticket.test26` kullanıcı adıyla, yalnızca entegrasyon testi amacıyla bir AFK Bot (`50 TL`) talebi oluşturuldu. Arayüz, `5BC1C091` talep koduyla **“İşlemin sıraya alındı”** sonucunu verdi. Bu kayıt `pending_validation` durumundadır ve henüz bir Discord ticket'ı veya satın alma kanalı bildirimi üretmez. Yerel ticket botu gerçek Discord ve Supabase gizli anahtarıyla başlatıldığında, bu ad sunucuda eşleşmezse kaydı Discord'a iz bırakmadan silmelidir.

Bu kayıt, gerçek Discord kullanıcı bilgisi içermeyen kontrollü bir entegrasyon testidir. Ticket botunun üyelik doğrulama ve sessiz silme davranışı yerel bot kurulumu sonrasındaki canlı testte ayrıca doğrulanmalıdır.

## Kuyruk dayanıklılığı güncellemesi

Supabase SQL Editor’de 27 Ağustos 2026 tarihinde, mevcut kayıtlar korunarak `processing_started_at`, `validated_at` ve `purchase_message_id` alanları eklendi. Durum kısıtı `pending_validation`, `processing`, `validated`, `queued`, `in_progress`, `closed` ve `cancelled` akışını kapsayacak şekilde genişletildi. Sorgu **“Success. No rows returned”** sonucu verdi.

Aynı onaylı talep için tekrar ticket veya satın alım bildirimi oluşmasını engellemek üzere aşağıdaki üç `security definer` işlev de başarıyla eklendi: `monarch_claim_pending_order_requests`, `monarch_requeue_stalled_order_requests` ve `monarch_enqueue_validated_order`. Bu işlevlerin çalıştırma yetkisi yalnızca `service_role` rolüne verildi.

## GitHub Pages özel alan adı durumu

27 Ağustos 2026 tarihinde GitHub Pages ayarları doğrudan doğrulandı: özel alan adı alanında `astralissaga.xyz` kayıtlı, ana dal kökten yayın yapıyor ve HTTP yayını güncel sipariş modüllerini sunuyor. GitHub’ın **DNS check successful** durumu doğrulandı. Sertifika hazırlığı tamamlandıktan sonra **Enforce HTTPS** etkinleştirildi. Doğrudan HTTPS isteği `200` döndü; sunulan sertifikanın adı `astralissaga.xyz`, alternatif adları ise `astralissaga.xyz` ve `www.astralissaga.xyz` olarak doğrulandı.
