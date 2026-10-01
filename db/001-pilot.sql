-- Review and apply only to a separately approved pilot project. No existing tables are changed.
begin;
create table if not exists public.stable_desk_v3 (
 owner uuid primary key references auth.users(id), version bigint not null check(version >= 0), body jsonb not null,
 check(body->>'schemaVersion' = '3'), check((body->>'version')::bigint = version)
);
create table if not exists public.stable_desk_v3_recovery (
 owner uuid not null references auth.users(id), version bigint not null, body jsonb not null, primary key(owner,version)
);
alter table public.stable_desk_v3 enable row level security;
alter table public.stable_desk_v3_recovery enable row level security;
revoke all on public.stable_desk_v3, public.stable_desk_v3_recovery from public, anon, authenticated;
grant select on public.stable_desk_v3, public.stable_desk_v3_recovery to authenticated;
grant select, insert, update on public.stable_desk_v3 to service_role;
grant select, insert on public.stable_desk_v3_recovery to service_role;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='stable_desk_v3' and policyname='pilot_read_own') then
  create policy pilot_read_own on public.stable_desk_v3 for select to authenticated using ((select auth.uid()) = owner);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='stable_desk_v3_recovery' and policyname='pilot_recovery_read_own') then
  create policy pilot_recovery_read_own on public.stable_desk_v3_recovery for select to authenticated using ((select auth.uid()) = owner);
 end if;
end $$;
create or replace function public.stable_desk_v3_write(p_owner uuid, p_expected bigint, p_body jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare saved public.stable_desk_v3;
begin
 if octet_length(p_body::text) > 4194304 or p_body->>'schemaVersion' <> '3' then raise exception 'Invalid pilot body'; end if;
 if p_expected = -1 then
   if (p_body->>'version')::bigint <> 0 then raise exception 'Invalid initial version'; end if;
   insert into public.stable_desk_v3 values (p_owner, 0, p_body);
 else
   select * into saved from public.stable_desk_v3 where owner=p_owner for update;
   if not found or saved.version <> p_expected or (p_body->>'version')::bigint <> p_expected+1 then
     raise sqlstate '23505' using message = 'Shared revision conflict';
   end if;
   insert into public.stable_desk_v3_recovery values (p_owner,saved.version,saved.body);
   update public.stable_desk_v3 set version=p_expected+1,body=p_body where owner=p_owner;
 end if;
 return p_body;
end $$;
revoke all on function public.stable_desk_v3_write(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.stable_desk_v3_write(uuid,bigint,jsonb) to service_role;
commit;
