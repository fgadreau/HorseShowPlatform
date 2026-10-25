// Isolated PostgreSQL/RLS regression test. No remote database is contacted.
// Install its test-only engine outside the application dependencies:
// npm install --prefix .tmp/db-tools --package-lock=false @electric-sql/pglite@0.3.14
// node scripts/test-directory-enrollment.mjs
// PGLITE_MODULE can override the engine module path.
import assert from "node:assert/strict";
import fs from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE ?? new URL("../.tmp/db-tools/node_modules/@electric-sql/pglite/dist/index.js", import.meta.url).href);
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table user_profiles(id uuid primary key, user_id uuid, first_name text, last_name text);
    create table organization_disciplines(id uuid primary key, organization_id uuid, is_active boolean);
    create table shows(id uuid primary key default gen_random_uuid(), organization_id uuid, is_public boolean, public_signal boolean default false);
    create function showscore_public_show_exists(uuid) returns boolean language sql as $$ select exists(select 1 from public.shows where id=$1 and (is_public or public_signal)) $$;
    create table contacts(id uuid primary key default gen_random_uuid(), type text, first_name text, last_name text, linked_user_id uuid, created_by_user_id uuid, created_at timestamptz default now());
    create table directory_contacts(organization_discipline_id uuid, contact_id uuid, source text, created_by_user_id uuid, unique(organization_discipline_id,contact_id));
    create function current_profile_id() returns uuid language sql security definer as $$ select id from user_profiles where user_id=auth.uid() $$;
    create function is_org_member(uuid) returns boolean language sql as $$ select false $$;
    create function claim_contacts_for_current_user() returns setof contacts language sql as $$ select * from contacts where linked_user_id=current_profile_id() $$;
    grant usage on schema public,auth to authenticated,anon;
    grant select on shows,organization_disciplines to authenticated,anon;
    grant insert,update,delete on organization_disciplines to authenticated;
    alter table organization_disciplines enable row level security;
    insert into user_profiles values ('${id(1)}','${id(101)}','Test','Participant'),('${id(2)}','${id(102)}','Other','User');
    insert into contacts(id,type,first_name,last_name,linked_user_id) values ('${id(30)}','owner','Other','User','${id(2)}');
    insert into shows(organization_id,is_public,public_signal) values ('${id(10)}',true,false),('${id(20)}',false,false),('${id(40)}',false,true);
    insert into organization_disciplines values ('${id(11)}','${id(10)}',true),('${id(12)}','${id(10)}',true),('${id(13)}','${id(10)}',false),('${id(21)}','${id(20)}',true),('${id(41)}','${id(40)}',true);
  `);
  await db.exec(fs.readFileSync(new URL("../supabase/migrations/20261025000600_public_show_directory_discovery.sql", import.meta.url), "utf8"));
  await db.exec(fs.readFileSync(new URL("../supabase/migrations/20261025000700_self_directory_enrollment.sql", import.meta.url), "utf8"));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(101)}';`);
  assert.deepEqual((await db.query("select id from organization_disciplines order by id")).rows.map((r) => r.id), [id(11), id(12), id(41)]);
  const enroll = async (directory) => (await db.query("select join_public_directory($1) as contact", [directory])).rows[0].contact;
  const contact = await enroll(id(12));
  assert.equal(await enroll(id(12)), contact);
  assert.equal(await enroll(id(11)), contact);
  assert.notEqual(contact, id(30));
  assert.equal(await enroll(id(41)), contact);
  for (const directory of [id(13), id(21), id(999)]) {
    await assert.rejects(enroll(directory), (error) => error.code === "42501");
  }
  await assert.rejects(db.exec(`insert into organization_disciplines values ('${id(99)}','${id(10)}',true)`), /row-level security/);
  assert.equal((await db.exec("delete from organization_disciplines"))[0].affectedRows, 0);
  await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int as n from contacts")).rows[0].n, 2);
  assert.equal((await db.query("select count(*)::int as n from directory_contacts")).rows[0].n, 3);
  assert.deepEqual((await db.query("select distinct contact_id,created_by_user_id from directory_contacts")).rows, [{contact_id:contact, created_by_user_id:id(1)}]);
  console.log("PASS: ShowScore public visibility permits discovery/enrollment even when is_public is false.");
  console.log("PASS: a participant joins multiple directories with one own contact; repeated enrollment is idempotent.");
  console.log("PASS: inactive, private and unknown directories are rejected; another user's contact is untouched; directory administration remains denied.");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(102)}';`);
  assert.equal(await enroll(id(11)), id(30));
  console.log("PASS: existing own contact is reused, rather than duplicated.");
  await db.exec("set request.jwt.claim.sub=''");
  await assert.rejects(enroll(id(11)), (error) => error.code === "42501");
  await db.exec("reset role; set role anon");
  await assert.rejects(enroll(id(11)), /permission denied/);
  console.log("PASS: missing authentication and anonymous execution are rejected.");
} finally {
  await db.close();
}
