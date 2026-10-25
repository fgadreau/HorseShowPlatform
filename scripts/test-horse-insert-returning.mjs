// Test-only engine installation and PGLITE_MODULE override:
// see scripts/test-directory-enrollment.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
const {PGlite} = await import(process.env.PGLITE_MODULE ?? new URL("../.tmp/db-tools/node_modules/@electric-sql/pglite/dist/index.js", import.meta.url).href);
const db = new PGlite();
try {
  await db.exec(`
    create role authenticated;
    create function current_profile_id() returns int language sql stable as $$ select current_setting('test.profile')::int $$;
    create table horses(id int primary key, created_by_user_id int, primary_owner_contact_id int);
    create function can_access_horse(target int) returns boolean language sql stable security definer as $$ select exists(select 1 from public.horses where id=target and created_by_user_id=current_profile_id()) $$;
    alter table horses enable row level security;
    grant select,insert on horses to authenticated;
    create policy "Authorized users can view global horses" on horses for select to authenticated using(can_access_horse(id));
    create policy "Authorized users can create global horses" on horses for insert to authenticated with check(created_by_user_id=current_profile_id() and primary_owner_contact_id=100);
    insert into horses values (9,2,200);
    set test.profile='1'; set role authenticated;
  `);
  await assert.rejects(db.query('insert into horses values (1,1,100) returning id'), /row-level security/);
  console.log('PASS: original STABLE-helper policy reproduces the INSERT RETURNING failure.');
  await db.exec('reset role');
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261025000800_horse_creator_insert_returning.sql',import.meta.url),'utf8'));
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('insert into horses values (1,1,100) returning id')).rows,[{id:1}]);
  assert.deepEqual((await db.query('select id from horses order by id')).rows,[{id:1}]);
  await assert.rejects(db.query('insert into horses values (2,2,100) returning id'), /row-level security/);
  await assert.rejects(db.query('insert into horses values (3,1,200) returning id'), /row-level security/);
  console.log('PASS: creator can insert and read own horse; another creator/unauthorized owner remains denied and unrelated horses remain invisible.');
} finally {await db.close();}
