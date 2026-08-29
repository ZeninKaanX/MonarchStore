-- Monarch Store: Admin Paneli & Discord 2FA Güvenlik Altyapısı
-- Bu SQL kodunu Supabase SQL Editor'de çalıştırarak Admin ve 2FA tablolarını aktif edebilirsiniz.

-- 1. Admin Hesapları Tablosu
create table if not exists public.monarch_admin_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (length(username) >= 3),
  password_hash text not null, -- SHA-256 hash
  role text not null default 'admin' check (role in ('admin', 'founder', 'support')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 2FA Doğrulama Talepleri Tablosu
create table if not exists public.monarch_admin_2fa (
  id uuid primary key default gen_random_uuid(),
  admin_username text not null,
  discord_username text, -- Giriş yapan yetkilinin Discord kullanıcı adı
  code text not null, -- 6 haneli güvenlik kodu
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed boolean not null default false,
  session_token text unique,
  session_expires_at timestamptz,
  discord_notified boolean not null default false,
  ip_info text,
  created_at timestamptz not null default now()
);

-- Mevcut tablo varsa kolon ekleme
alter table public.monarch_admin_2fa add column if not exists discord_username text;

create index if not exists monarch_admin_2fa_lookup_idx
  on public.monarch_admin_2fa (admin_username, consumed, expires_at);

create index if not exists monarch_admin_2fa_session_idx
  on public.monarch_admin_2fa (session_token, session_expires_at);

-- Varsayılan Admin Hesabı Ekleme (Kullanıcı: admin, Şifre: Monarch!Founder#9824_Sec)
-- Güvenli SHA-256 Hash'i: 46014b9696fb195e4f8d91c60fd2f2982fa9969aaa820c93faf2366a34ebdf9c
insert into public.monarch_admin_accounts (username, password_hash, role)
values ('admin', '46014b9696fb195e4f8d91c60fd2f2982fa9969aaa820c93faf2366a34ebdf9c', 'founder')
on conflict (username) do update set password_hash = '46014b9696fb195e4f8d91c60fd2f2982fa9969aaa820c93faf2366a34ebdf9c';

-- 3. RLS Ayarları
alter table public.monarch_admin_accounts enable row level security;
alter table public.monarch_admin_2fa enable row level security;

revoke all on table public.monarch_admin_accounts from anon, authenticated;
revoke all on table public.monarch_admin_2fa from anon, authenticated;

grant select, insert, update, delete on table public.monarch_admin_accounts to service_role;
grant select, insert, update, delete on table public.monarch_admin_2fa to service_role;

-- 4. 2FA Talebi Oluşturma Fonksiyonu (RPC)
create or replace function public.monarch_admin_request_2fa(
  p_username text,
  p_password_hash text,
  p_ip_info text default null,
  p_discord_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin public.monarch_admin_accounts;
  v_code text;
  v_challenge_id uuid;
begin
  -- Admin hesabını ve şifre hash'ini kontrol et
  select * into v_admin
  from public.monarch_admin_accounts
  where lower(trim(username)) = lower(trim(p_username))
    and password_hash = lower(trim(p_password_hash));

  if not found then
    return jsonb_build_object('success', false, 'message', 'Kullanıcı adı veya şifre hatalı.');
  end if;

  -- 6 haneli rastgele kod üret (100000 - 999999)
  v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');

  -- 2FA kaydını oluştur (5 dakika geçerli)
  insert into public.monarch_admin_2fa (admin_username, discord_username, code, expires_at, ip_info)
  values (v_admin.username, nullif(trim(p_discord_username), ''), v_code, now() + interval '5 minutes', p_ip_info)
  returning id into v_challenge_id;

  return jsonb_build_object(
    'success', true,
    'challenge_id', v_challenge_id,
    'message', '2FA kodu Discord Founder/Destek kanalına gönderildi.'
  );
end;
$function$;

-- 5. 2FA Kodunu Doğrulama Fonksiyonu (RPC)
create or replace function public.monarch_admin_verify_2fa(
  p_challenge_id uuid,
  p_code text,
  p_discord_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_2fa public.monarch_admin_2fa;
  v_session_token text;
  v_discord_user text;
begin
  select * into v_2fa
  from public.monarch_admin_2fa
  where id = p_challenge_id
    and code = trim(p_code)
    and consumed = false
    and expires_at > now();

  if not found then
    return jsonb_build_object('success', false, 'message', 'Geçersiz veya süresi dolmuş 2FA kodu.');
  end if;

  -- Oturum tokenı üret (12 saat geçerli - 64 karakter)
  v_session_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_discord_user := coalesce(nullif(trim(p_discord_username), ''), v_2fa.discord_username, 'admin');

  update public.monarch_admin_2fa
  set consumed = true,
      discord_username = v_discord_user,
      session_token = v_session_token,
      session_expires_at = now() + interval '12 hours'
  where id = p_challenge_id;

  return jsonb_build_object(
    'success', true,
    'session_token', v_session_token,
    'username', v_2fa.admin_username,
    'discord_username', v_discord_user,
    'expires_at', (now() + interval '12 hours')
  );
end;
$function$;

-- 6. Admin İçin Tüm Siparişleri Getirme Fonksiyonu (RPC)
create or replace function public.monarch_admin_get_orders(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_valid_session boolean;
  v_orders jsonb;
  v_stats jsonb;
begin
  -- Session geçerliliğini kontrol et
  select exists(
    select 1 from public.monarch_admin_2fa
    where session_token = p_session_token
      and session_expires_at > now()
  ) into v_valid_session;

  if not v_valid_session then
    return jsonb_build_object('success', false, 'message', 'Yetkisiz erişim: Lütfen tekrar 2FA ile giriş yapın.');
  end if;

  -- Siparişleri çek
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  into v_orders
  from public.order_requests r;

  -- Özet istatistikler
  select jsonb_build_object(
    'total_orders', count(*),
    'total_revenue', coalesce(sum(total_tl), 0),
    'pending_orders', count(*) filter (where status in ('pending_validation', 'processing')),
    'validated_orders', count(*) filter (where status in ('validated', 'queued', 'in_progress')),
    'completed_orders', count(*) filter (where status = 'closed')
  )
  into v_stats
  from public.order_requests;

  return jsonb_build_object(
    'success', true,
    'orders', v_orders,
    'stats', v_stats
  );
end;
$function$;

-- 7. Admin İçin Sipariş Durumu Güncelleme Fonksiyonu (RPC)
create or replace function public.monarch_admin_update_order_status(
  p_session_token text,
  p_order_code text,
  p_new_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin_username text;
  v_discord_username text;
  v_updated public.order_requests;
begin
  select admin_username, discord_username into v_admin_username, v_discord_username
  from public.monarch_admin_2fa
  where session_token = p_session_token
    and session_expires_at > now();

  if v_admin_username is null then
    return jsonb_build_object('success', false, 'message', 'Yetkisiz erişim.');
  end if;

  update public.order_requests
  set status = p_new_status,
      handled_by = coalesce(p_notes, v_discord_username, v_admin_username),
      closed_at = (case when p_new_status in ('closed', 'cancelled') then now() else closed_at end)
  where order_code = upper(trim(p_order_code))
  returning * into v_updated;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Sipariş bulunamadı.');
  end if;

  return jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_updated)
  );
end;
$function$;

-- RPC İzinleri
grant execute on function public.monarch_admin_request_2fa(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.monarch_admin_verify_2fa(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.monarch_admin_get_orders(text) to anon, authenticated, service_role;
grant execute on function public.monarch_admin_update_order_status(text, text, text, text) to anon, authenticated, service_role;
