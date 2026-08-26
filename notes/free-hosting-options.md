# Ücretsiz özel alan adı ve OAuth notu

Mevcut GitHub Pages yayını yalnızca statik dosya sunduğu için Discord OAuth callback rotasını çalıştıramaz. Buna karşılık ücretsiz Manus yayın adresi `https://monarchshop-ns7bgnqa.manus.space` üzerindeki **Discord ile giriş** düğmesi Discord’un yetkilendirme ekranını açmaktadır; bu adres `https://monarchshop-ns7bgnqa.manus.space/api/auth/discord/callback` callback URI’sini kullanır.

Ücret ödemeden `astralissaga.xyz` üzerinde sunucu tarafı OAuth gerektiğinde incelenen iki alternatif vardır. Vercel Hobby planı ücretsiz ve özel alan adı ile Node Functions destekler, ancak resmî belgelerinde kişisel ve ticari olmayan kullanım için tasarlandığı belirtilir. Cloudflare Workers Free planı günlük 100.000 istek, 10 ms CPU ve özel alan adı desteği sunar; Workers Custom Domain kullanabilmek için alan adının aktif bir Cloudflare zone içinde olması gerekir. Bu, Natro nameserver kayıtlarının Cloudflare’a geçirilmesini gerektirir.

Kaynaklar: https://vercel.com/docs/plans/hobby ; https://vercel.com/docs/domains/working-with-domains/add-a-domain ; https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ .
