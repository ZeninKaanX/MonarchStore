-- Monarch Store: ödeme bilgisi tutmayan Discord üyelik doğrulamalı sipariş kuyruğu
-- Bu sorgu Supabase SQL Editor'de tek seferde çalıştırılır.

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  visitor_id uuid not null references auth.users(id) on delete cascade,
  discord_username text not null check (discord_username ~ '^[a-z0-9._]{2,32}$'),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 10),
  total_tl integer not null check (total_tl between 1 and 100000),
  status text not null default 'pending_validation' check (status in ('pending_validation', 'processing', 'validated', 'queued', 'in_progress', 'closed', 'cancelled')),
  ticket_channel_id text,
  discord_user_id text,
  queue_position integer,
  handled_by text,
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  closed_at timestamptz,
  processing_started_at timestamptz,
  validated_at timestamptz,
  purchase_message_id text
);

create index if not exists order_requests_status_created_at_idx
  on public.order_requests (status, created_at);

create unique index if not exists order_requests_one_active_request_per_visitor_idx
  on public.order_requests (visitor_id)
  where status in ('pending_validation', 'queued', 'in_progress');

alter table public.order_requests enable row level security;

revoke all on table public.order_requests from anon, authenticated;
grant insert, select on table public.order_requests to authenticated;

drop policy if exists "visitor creates own order request" on public.order_requests;
create policy "visitor creates own order request"
on public.order_requests
for insert
to authenticated
with check (
  (select auth.uid()) = visitor_id
  and status = 'pending_validation'
  and ticket_channel_id is null
  and discord_user_id is null
  and queue_position is null
  and handled_by is null
  and queued_at is null
  and closed_at is null
);

drop policy if exists "visitor reads own order request" on public.order_requests;
create policy "visitor reads own order request"
on public.order_requests
for select
to authenticated
using ((select auth.uid()) = visitor_id);

-- Bilerek UPDATE/DELETE politikası yoktur:
-- ziyaretçi talebini oluşturduktan sonra değiştiremez veya silemez.
-- Yerel MonarchBot secret/service-role anahtarıyla sıralama, ticket ve kapatma durumunu günceller.
-- Bot, `pending_validation` talebinde Discord sunucusunda tam kullanıcı adıyla eşleşme bulamazsa
-- kaydı hemen siler; Discord'da mesaj/log/ticket üretilmez.

-- Aynı talebin iki kez işlenmesini önleyen atomik sahiplenme işlevi.
-- Sadece yerel botun service_role anahtarı çalıştırabilir.
create or replace function public.monarch_claim_pending_order_requests(p_limit integer default 10)
returns setof public.order_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  return query
  with picked as (
    select r.id
    from public.order_requests r
    where r.status = 'pending_validation'
    order by r.created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
  ), claimed as (
    update public.order_requests r
    set status = 'processing', processing_started_at = now()
    from picked p
    where r.id = p.id
    returning r.*
  )
  select * from claimed;
end;
$function$;

-- Beklenmedik kapanışta beş dakikadan eski işlem kilidini serbest bırakır.
create or replace function public.monarch_requeue_stalled_order_requests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  changed integer;
begin
  update public.order_requests
  set status = 'pending_validation', processing_started_at = null
  where status = 'processing'
    and processing_started_at < now() - interval '5 minutes';
  get diagnostics changed = row_count;
  return changed;
end;
$function$;

-- Ekip komutunun sıra numarasını aynı anda tek işlemde atamasını sağlar.
create or replace function public.monarch_enqueue_validated_order(p_order_code text, p_handled_by text)
returns public.order_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  next_position integer;
  updated_order public.order_requests;
begin
  perform pg_advisory_xact_lock(7132026);
  select coalesce(max(queue_position), 0) + 1
  into next_position
  from public.order_requests
  where status in ('queued', 'in_progress');

  update public.order_requests
  set status = 'queued', queue_position = next_position, queued_at = now(), handled_by = p_handled_by
  where order_code = upper(trim(p_order_code)) and status = 'validated'
  returning * into updated_order;

  return updated_order;
end;
$function$;

revoke all on function public.monarch_claim_pending_order_requests(integer) from public;
revoke all on function public.monarch_requeue_stalled_order_requests() from public;
revoke all on function public.monarch_enqueue_validated_order(text, text) from public;
grant execute on function public.monarch_claim_pending_order_requests(integer) to service_role;
grant execute on function public.monarch_requeue_stalled_order_requests() to service_role;
grant execute on function public.monarch_enqueue_validated_order(text, text) to service_role;
