#!/usr/bin/env python3
"""Local-only rehearsal. Requires running disposable CLI project at the fixed /tmp path.
Never accepts a remote URL, never repairs history. Logs SQL and CLI output.
"""
import hashlib, json, pathlib, shutil, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
WORK = pathlib.Path('/tmp/hsp-reconciliation-20260904')
OUT = ROOT / 'docs/audits/reconciliation-2026-09-04'
CLI = ROOT / 'node_modules/.bin/supabase'
DB = 'supabase_db_hsp-reconciliation-20260904'
EVIDENCE = json.loads((ROOT/'docs/audits/2026-09-04-preprod-evidence.json').read_text())
MIG = ROOT/'supabase/migrations'

def run(args, name, data=None):
    p = subprocess.run([str(a) for a in args], input=data, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    logged=p.stdout
    if args[0] == CLI and 'start' in args:
        logged=logged.split('╭')[0]
    (OUT/(name+'.log')).write_text(logged)
    if p.returncode:
        print(p.stdout[-6000:]); raise RuntimeError(name)
    print(name+': PASS', flush=True)
    return p.stdout

def sql(data, name):
    return run(['docker','exec','-i',DB,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'], name, data)

def expand(path):
    lines=[]
    for line in path.read_text().splitlines():
        if line.startswith('\\ir '): lines.append(expand(path.parent/line[4:].strip()))
        else: lines.append(line)
    return '\n'.join(lines)+'\n'

def cli(args,name):
    return run([CLI,*args,'--workdir',WORK],name)

def rebuild(name):
    # Fresh volumes avoid the CLI reset/Realtime reinitialization race.
    cli(['stop','--no-backup'], name+'-stop')
    cli(['start','-x','studio,imgproxy,edge-runtime,logflare,vector,supavisor,storage-api'],name)

def snapshot(name):
    tables=['show_score_block_setups','show_score_announcer_live_sessions','show_score_paid_warmups','blocks','classes','class_governing_bodies','eligibility_requirements','entries','invoices','payments']
    data={t:json.loads(sql("select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public."+t+' t;',name+'-'+t)) for t in tables}
    (OUT/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n')
    return data

def schema(name):
    raw=run(['docker','exec',DB,'pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=public'],name)
    # pg_dump 17 random guard token is intentionally not schema content.
    return '\n'.join(x for x in raw.splitlines() if not x.startswith(('\\restrict ','\\unrestrict ')))

def compare_baseline_failures(failures):
    # The two corrections differ from canonical origin/preprod only in this
    # function: canonical historical defaults already end at announcer / 6.
    old=(MIG/'0050_showscore_compatibility.sql').read_text()
    old=old[old.index('create or replace function public.create_association_with_owner('):]
    old=old[:old.index('-- ─── 13.')]
    known={
        'bloc3_final_validation.sql':'One global horse should have independent association results',
        'compatibility_views_security_invoker.sql':'organization admins read only their organization days expected 1, got 3',
    }
    for name in failures:
        assert name in known, 'Unexpected SQL failure: '+name
        data='begin;\n'+old+expand(ROOT/'supabase/tests'/name).replace('begin;','',1)
        result=subprocess.run(['docker','exec','-i',DB,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],input=data,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        (OUT/('baseline-'+name.removesuffix('.sql')+'.log')).write_text(result.stdout)
        assert result.returncode!=0 and known[name] in result.stdout, name
        print(name+': SAME FAILURE WITHOUT CORRECTIONS',flush=True)

def main():
    OUT.mkdir(exist_ok=True)
    assert WORK.is_dir()
    for file,h in EVIDENCE['audit_metadata']['migration_sha256'].items():
        assert hashlib.sha256((MIG/file).read_bytes()).hexdigest()==h,file
    assert hashlib.sha256((ROOT/'docs/audits/2026-09-04-preprod-preflight.sql').read_bytes()).hexdigest()==EVIDENCE['audit_metadata']['preflight_sha256']
    baseline={x['version'] for x in EVIDENCE['history']}
    dest=WORK/'supabase/migrations'; dest.mkdir(exist_ok=True)
    for p in dest.glob('*.sql'): p.unlink()
    for p in MIG.glob('*.sql'):
        if p.name.split('_')[0] in baseline: shutil.copy2(p,dest/p.name)
    if '--resume-baseline' not in sys.argv:
        rebuild('baseline-reset')
    else:
        actual=set(sql('select version from supabase_migrations.schema_migrations;', 'baseline-history').splitlines())
        assert actual==baseline
        assert sql('select count(*) from public.organizations;', 'baseline-empty').strip()=='0'
    sql('begin;\n'+expand(ROOT/'supabase/tests/preprod_reconciliation_fixture.sql')+'\ncommit;','fixture')
    sql((ROOT/'docs/audits/2026-09-04-preprod-preflight.sql').read_text(),'preflight-before')
    before=snapshot('before')
    assert len(before['show_score_block_setups'])==7
    assert sum(x['live_data_source']=='announcer' for x in before['show_score_block_setups'])==6
    assert len(before['show_score_announcer_live_sessions'])==6
    for record in EVIDENCE['counts']+EVIDENCE['ancillary_counts']:
        t=record['relation']
        actual=int(sql('select count(*) from public.'+t+';', 'count-'+t))
        assert actual==record['count'],(t,actual,record['count'])
    for p in MIG.glob('*.sql'): shutil.copy2(p,dest/p.name)
    cli(['db','push','--local','--include-all','--dry-run'],'catchup-dry-run')
    cli(['db','push','--local','--include-all','--yes'],'catchup')
    after=snapshot('after')
    for t in before:
        if t=='show_score_block_setups':
            clean=lambda rows:[{k:v for k,v in r.items() if k!='updated_at'} for r in rows]
            assert clean(before[t])==clean(after[t]),t
        else: assert before[t]==after[t],t
    sql((ROOT/'docs/audits/2026-09-04-preprod-preflight.sql').read_text(),'preflight-after')
    sql(expand(ROOT/'supabase/tests/preprod_reconciliation_assertions.sql'),'assertions')
    for p in sorted(MIG.glob('20260904*.sql')): sql(p.read_text(),'repeat-'+p.stem)
    assert snapshot('repeat')==after
    # Replay the whole approved batch only inside the disposable database.
    for p in sorted(MIG.glob('*.sql')):
        if p.name.split('_')[0] not in baseline:
            sql('begin;\n'+p.read_text()+'\ncommit;', 'repeat-batch-'+p.stem)
            if p.name.startswith('20260801002350_'):
                default=sql("select column_default from information_schema.columns where table_schema='public' and table_name='show_score_block_setups' and column_name='live_data_source';",'historical-default-regression')
                assert default.strip()=="'scribe'::text"
    repeated=snapshot('repeat-batch')
    for t in after:
        clean=lambda rows:[{k:v for k,v in r.items() if k!='updated_at'} for r in rows]
        assert clean(after[t])==clean(repeated[t]),t
    run([sys.executable,ROOT/'scripts/test-reconciliation-concurrency.py'],'concurrency')
    catchup_schema=schema('catchup-schema')
    rebuild('chronological-reset')
    canonical=schema('chronological-schema')
    if canonical != catchup_schema:
        import difflib
        (OUT/'schema-difference.diff').write_text('\n'.join(difflib.unified_diff(catchup_schema.splitlines(),canonical.splitlines())))
        raise AssertionError('Final public schema differs between replay orders')
    sql(expand(ROOT/'supabase/seed.sql'),'canonical-seed')
    failures=[]
    results={}
    # Run existing tests with the shared seed, not with the audit fixtures.
    for p in sorted((ROOT/'supabase/tests').glob('*.sql')):
        if p.stem in ('legacy_rebuild_fixture','legacy_rebuild_assertions','preprod_reconciliation_fixture','preprod_showscore_flow_seed','preprod_reconciliation_assertions'): continue
        try:
            sql(expand(p),'sql-'+p.stem)
            results[p.name]='PASS'
        except RuntimeError:
            failures.append(p.name)
            results[p.name]='FAIL'
    (OUT/'sql-results.json').write_text(json.dumps(results,indent=2)+'\n')
    compare_baseline_failures(failures)
    sql('begin;\n'+expand(ROOT/'supabase/tests/preprod_reconciliation_fixture.sql')+'\ncommit;','canonical-fixture')
    sql(expand(ROOT/'supabase/tests/preprod_reconciliation_assertions.sql'),'canonical-assertions')
    run([sys.executable,ROOT/'scripts/test-reconciliation-api.py'],'api')
    # Disposable-only failure injection verifies the effective CLI boundary.
    first=dest/'20260904999800_transaction_probe_first.sql'
    second=dest/'20260904999900_transaction_probe_failure.sql'
    first.write_text('create table public.reconciliation_probe_committed (id integer);')
    second.write_text("create table public.reconciliation_probe_rolled_back (id integer); do $$ begin raise exception 'intentional transaction probe'; end $$;")
    try:
        probe=subprocess.run([str(CLI),'db','push','--local','--yes','--workdir',str(WORK)],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        (OUT/'transaction-boundary.log').write_text(probe.stdout)
        assert probe.returncode!=0 and 'intentional transaction probe' in probe.stdout
        actual=sql("select (to_regclass('public.reconciliation_probe_committed') is not null)::text, (to_regclass('public.reconciliation_probe_rolled_back') is null)::text, (select count(*) from supabase_migrations.schema_migrations where version='20260904999800'), (select count(*) from supabase_migrations.schema_migrations where version='20260904999900');",'transaction-boundary-assertions')
        assert actual.strip()=='true|true|1|0',actual
    finally:
        first.unlink(missing_ok=True); second.unlink(missing_ok=True)
    print('RECONCILIATION CHECKS PASSED; historical SQL failures: '+str(failures),flush=True)
    if failures: sys.exit(1)

if __name__=='__main__': main()
