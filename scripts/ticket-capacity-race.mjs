import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Invoked only against the fresh disposable database owned by the SQL runner.
export async function runTicketCapacityRace({sql,container}) {
  assert(/^supabase_db_entry-lifecycle-test-[a-f0-9]{8}$/.test(container));
  const setup=readFileSync('supabase/tests/event_ticketing.sql','utf8').split(" config:='")[0];
  sql(setup+`
    set local role authenticated;
    perform public.save_ticket_block(bl,'{"payment_policy":"manual","capacity":1,"is_active":true}',
      '[{"name":"Last place","price":0,"taxable":false,"tax_mode":"exclusive","is_active":true}]','[]',null);
    catalog:=public.get_ticket_catalog(org,sh,true)->0;
    items:=jsonb_build_array(jsonb_build_object('option_id',catalog#>>'{options,0,id}','quantity',1));
    perform set_config('request.jwt.claim.sub',buyer::text,true);
    q:=public.ticket_quote(bl,items);
    reset role;
    create table public.ticket_capacity_fixture(actor uuid,block_id uuid,buyer uuid,items jsonb,signature text);
    insert into public.ticket_capacity_fixture values(buyer,bl,contact,items,q->>'signature');
  end $$;commit;`);
  const f=JSON.parse(sql('select row_to_json(f) from public.ticket_capacity_fixture f;'));
  function purchase(hold) {
    const child=spawn('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{stdio:['pipe','pipe','pipe']});
    let out='',err='',signal;
    const ready=new Promise(resolve=>{signal=resolve;});
    child.stdout.on('data',data=>{out+=data;if(out.includes('TICKET_READY'))signal();});
    child.stderr.on('data',data=>{err+=data;});
    const result=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{signal();resolve({code,err,out});});});
    child.stdin.end(`begin;set local role authenticated;set request.jwt.claim.sub='${f.actor}';
      select public.purchase_tickets('${randomUUID()}','${f.block_id}','${f.buyer}','${JSON.stringify(f.items)}','','${f.signature}');
      ${hold?"select 'TICKET_READY';select pg_sleep(0.7);":''}commit;`);
    return {ready,result};
  }
  const first=purchase(true);await first.ready;
  const second=purchase(false);
  const [accepted,rejected]=await Promise.all([first.result,second.result]);
  assert.equal(accepted.code,0,accepted.err);
  assert.notEqual(rejected.code,0);
  assert.match(rejected.err,/TICKET_CAPACITY_REACHED/);
  assert.equal(sql(`select public.ticket_used('${f.block_id}');`).trim(),'1');
  console.log('PASS: concurrent last-place purchases cannot oversell capacity');
}
