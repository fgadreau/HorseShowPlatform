#!/usr/bin/env python3
"""Contention checks against the fixed disposable Supabase container only."""
import subprocess, time
DB='supabase_db_hsp-reconciliation-20260904'
CMD=['docker','exec','-i',DB,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At']

def query(s):
    r=subprocess.run(CMD,input=s,text=True,capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()

def concurrent(first, second, marker):
    a=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    a.stdin.write(first); a.stdin.close(); a.stdin=None
    # Wait for the first writer to hold its transaction open before contender.
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        if query("select count(*) from pg_stat_activity where application_name='"+marker+"' and wait_event='PgSleep';")=='1': break
        time.sleep(.05)
    else: raise RuntimeError('First writer did not reach synchronization point')
    b=subprocess.run(CMD,input=second,text=True,capture_output=True)
    out,err=a.communicate(timeout=15)
    assert a.returncode==0,err
    return b

owner="set role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);"
foreign="set role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',false);"
new='30000000-0000-0000-0000-000000000088'
try:
    b=concurrent("set application_name='reconcile-create'; begin;"+owner+"select public.create_association_with_owner('"+new+"','Concurrent owner'); select pg_sleep(3); commit;",
                 foreign+"select public.create_association_with_owner('"+new+"','Concurrent attacker');",'reconcile-create')
    assert b.returncode!=0 and 'duplicate key' in b.stderr,b.stderr
    assert query("select count(*) from public.organization_members where organization_id='"+new+"';")=='1'
    assert query("select user_id from public.organization_members where organization_id='"+new+"';")=='20000000-0000-0000-0000-000000000004'
    print('Concurrent association collision: one owner, no foreign membership: PASS')
finally:
    query("delete from public.organizations where id='"+new+"';")

# Both admins can write the same live queue; row locks serialize, last writer wins.
admin="set role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);"
warmup='50000000-0000-0000-0000-000000000008'
b=concurrent("set application_name='reconcile-warmup'; begin;"+admin+"select public.save_show_score_paid_warmup_live('"+warmup+"',true); select pg_sleep(3); commit;",
             admin+"select public.save_show_score_paid_warmup_live('"+warmup+"',false);",'reconcile-warmup')
assert b.returncode==0,b.stderr
assert query("select is_public_live from public.show_score_paid_warmups where id='"+warmup+"';")=='f'
print('Concurrent live updates serialize; final value from second writer: PASS')
