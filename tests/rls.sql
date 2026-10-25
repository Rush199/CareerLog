-- Run the entire script in the Supabase SQL editor. It never commits fixtures.
begin;
select set_config('careerlog.test_a', gen_random_uuid()::text, true),
       set_config('careerlog.test_b', gen_random_uuid()::text, true),
       set_config('careerlog.app_a', gen_random_uuid()::text, true),
       set_config('careerlog.app_b', gen_random_uuid()::text, true);
insert into auth.users(id,email) values
(current_setting('careerlog.test_a')::uuid,current_setting('careerlog.test_a')||'@example.invalid'),
(current_setting('careerlog.test_b')::uuid,current_setting('careerlog.test_b')||'@example.invalid');
insert into public.applications(id,user_id,company,role) values
(current_setting('careerlog.app_a')::uuid,current_setting('careerlog.test_a')::uuid,'CareerLog fixture A','Engineer'),
(current_setting('careerlog.app_b')::uuid,current_setting('careerlog.test_b')::uuid,'CareerLog fixture B','Analyst');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('careerlog.test_a'),'role','authenticated')::text,true);
do $$
declare n integer;
begin
  select count(*) into n from public.applications;
  if n <> 1 then raise exception 'RLS SELECT isolation failed'; end if;
  update public.applications set status='Interview' where id=current_setting('careerlog.app_b')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-user UPDATE allowed'; end if;
  delete from public.applications where id=current_setting('careerlog.app_b')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-user DELETE allowed'; end if;
  begin
    insert into public.applications(user_id,company,role) values (current_setting('careerlog.test_b')::uuid,'Spoof','Role');
    raise exception 'Spoofed INSERT allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.applications set user_id=current_setting('careerlog.test_b')::uuid where id=current_setting('careerlog.app_a')::uuid;
    raise exception 'Ownership reassignment allowed';
  exception when insufficient_privilege then null; end;
  update public.applications set status='Interview',follow_up=current_date where id=current_setting('careerlog.app_a')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Own UPDATE failed'; end if;
  begin
    update public.applications set company=' ' where id=current_setting('careerlog.app_a')::uuid;
    raise exception 'Blank company accepted';
  exception when check_violation then null; end;
  begin
    update public.applications set status='Unknown' where id=current_setting('careerlog.app_a')::uuid;
    raise exception 'Invalid status accepted';
  exception when check_violation then null; end;
  update public.applications set follow_up=null where id=current_setting('careerlog.app_a')::uuid;
  delete from public.applications where id=current_setting('careerlog.app_a')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Own DELETE failed'; end if;
  insert into public.applications(user_id,company,role) values (current_setting('careerlog.test_a')::uuid,'Own insert','Engineer');
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform id from public.applications;
    raise exception 'Anonymous SELECT allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: own CRUD, cross-user SELECT/UPDATE/DELETE isolation, spoofed INSERT and ownership-change denial, constraints, anonymous denial. All fixtures rolled back.' as result;
