-- Monarch Store: GitHub Pages vitrini için tek satırlık Discord çevrimiçi üye durumu.
-- Bu tablo kullanıcı kimliği, Discord kullanıcı adı veya presence ayrıntısı tutmaz.
-- `active_member_count`, Discord'da offline olmayan (online / idle / rahatsız etmeyin)
-- insan üyelerin anlık sayısıdır. Bot hesapları dahil edilmez.

create table if not exists public.monarch_community_stats (
  source text primary key check (source = 'discord'),
  active_member_count integer not null default 0 check (active_member_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.monarch_community_stats enable row level security;

-- Vitrinin yalnızca Discord satırını okuyabilmesine izin verilir.
revoke all on table public.monarch_community_stats from anon, authenticated;
grant select on table public.monarch_community_stats to anon, authenticated;

drop policy if exists "public reads Discord community count" on public.monarch_community_stats;
create policy "public reads Discord community count"
on public.monarch_community_stats
for select
to anon, authenticated
using (source = 'discord');

-- Yazma yalnızca yerel MonarchBot'taki SUPABASE_SERVICE_ROLE_KEY ile mümkündür.
grant select, insert, update, delete on table public.monarch_community_stats to service_role;
