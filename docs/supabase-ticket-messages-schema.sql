-- Monarch Store: İki Yönlü Destek Mesajlaşma RPC ve Güvenlik Fonksiyonu
-- Bu fonksiyon Supabase SQL Editor'de çalıştırılır.

create or replace function public.monarch_append_ticket_message(
  p_order_code text,
  p_sender text, -- 'user' veya 'admin'
  p_author text,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_order public.order_requests;
  v_items jsonb;
  v_messages jsonb;
  v_new_msg jsonb;
  v_clean_code text;
begin
  v_clean_code := upper(trim(p_order_code));
  if length(trim(p_text)) < 1 then
    return jsonb_build_object('success', false, 'message', 'Mesaj boş olamaz.');
  end if;

  select * into v_order
  from public.order_requests
  where order_code = v_clean_code;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Talep bulunamadı.');
  end if;

  v_items := v_order.items;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    v_items := jsonb_build_array(jsonb_build_object('type', 'support', 'sku', 'support_ticket', 'messages', jsonb_build_array()));
  end if;

  v_messages := coalesce(v_items->0->'messages', jsonb_build_array());
  if jsonb_typeof(v_messages) <> 'array' then
    v_messages := jsonb_build_array();
  end if;

  -- İlk talep mesajı messages içinde yoksa ekle
  if jsonb_array_length(v_messages) = 0 and (v_items->0->>'message' is not null or v_items->0->>'description' is not null) then
    v_messages := v_messages || jsonb_build_object(
      'sender', 'user',
      'author', coalesce(v_order.discord_username, 'Müşteri'),
      'text', coalesce(v_items->0->>'message', v_items->0->>'description'),
      'createdAt', coalesce(v_order.created_at::text, now()::text)
    );
  end if;

  v_new_msg := jsonb_build_object(
    'sender', p_sender,
    'author', coalesce(p_author, case when p_sender = 'admin' then 'Monarch Destek Ekibi' else 'Müşteri' end),
    'text', trim(p_text),
    'createdAt', now()::text
  );

  v_messages := v_messages || v_new_msg;
  v_items := jsonb_set(v_items, '{0,messages}', v_messages, true);

  update public.order_requests
  set items = v_items
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_order),
    'message', v_new_msg
  );
end;
$function$;

-- Fonksiyonu anon, authenticated ve service_role rollerine aç
grant execute on function public.monarch_append_ticket_message(text, text, text, text) to anon, authenticated, service_role;
