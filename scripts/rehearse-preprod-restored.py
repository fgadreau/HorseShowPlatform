#!/usr/bin/env python3
"""Read-only PREPROD backup; isolated local restore. Never prints raw DB output.
Requires psycopg 3 (optionally HSP_PSYCOPG_PATH) and Docker / Supabase CLI.
Sensitive material is confined to a mode-0700 directory under /tmp, then deleted.
"""
import os, sys, json, pathlib, tempfile, subprocess, hashlib, datetime, time, shutil
from urllib.parse import urlsplit, unquote, urlencode
sys.path.insert(0, os.environ.get('HSP_PSYCOPG_PATH','/tmp/hsp-audit-python'))
import psycopg
from psycopg import sql
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/audits/reconciliation-2026-09-04'
MARKER=pathlib.Path('/tmp/hsp-preprod-restored-location')
IMAGE='public.ecr.aws/supabase/postgres:17.6.1.131'
CONTAINER='hsp-preprod-restored-20260904'
CLI=ROOT/'node_modules/.bin/supabase'
VERSIONS=['20260801002350','20260807000400','20260824130000','20260824131000','20260904000100','20260904000200']
PRIVATE=None
PHASE='initialization'
DIAGNOSTICS={}

def progress(message): print(message,flush=True)
def digest(value): return hashlib.sha256(json.dumps(value,sort_keys=True,default=str,separators=(',',':')).encode()).hexdigest()
def save_private(name,value):
    path=PRIVATE/name
    if isinstance(value,bytes):path.write_bytes(value)
    else:path.write_text(json.dumps(value,default=str,indent=2))
    path.chmod(0o600)
def run(args,input=None,check=True,env=None):
    # Never inherit terminal output: restored rows, errors and CLI credentials
    # must not enter console, repository logs, or Docker's logging driver.
    result=subprocess.run([str(a) for a in args],input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
    if check and result.returncode:
        save_private('last-process-error.json',{'exit_code':result.returncode,'stderr_sha256':hashlib.sha256(result.stderr).hexdigest()})
        raise RuntimeError('subprocess failed')
    return result

def local(db='restored',readonly=False):
    options='-c log_statement=none -c log_min_error_statement=panic'
    if readonly:options+=' -c default_transaction_read_only=on'
    return psycopg.connect(host=str(PRIVATE/'socket'),port=5432,user='supabase_admin',dbname=db,autocommit=True,options=options)

def rows(conn,query):
    cur=conn.execute(query)
    return [dict(zip([d.name for d in cur.description],r)) for r in cur.fetchall()]

def capture(conn):
    conn.execute('set search_path=public,extensions')
    tables=[r['tablename'] for r in rows(conn,"select tablename from pg_tables where schemaname='public' order by tablename")]
    values={}
    for t in tables:
        values[t]=conn.execute(sql.SQL("select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.{} t").format(sql.Identifier(t))).fetchone()[0]
    catalogs={
      'history':rows(conn,'select version,name from supabase_migrations.schema_migrations order by version'),
      'roles':rows(conn,'select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles order by rolname'),
      'memberships':rows(conn,'select r.rolname role,m.rolname member,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member order by 1,2'),
      'grants':rows(conn,"select * from information_schema.role_table_grants where table_schema='public' order by table_name,grantee,privilege_type"),
      'policies':rows(conn,"select * from pg_policies where schemaname='public' order by tablename,policyname"),
      'functions':rows(conn,"select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by signature"),
      'columns':rows(conn,"select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position"),
      'default_acl':rows(conn,"select pg_get_userbyid(defaclrole) role,n.nspname,defaclobjtype,defaclacl::text from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1,2,3"),
    }
    return {'tables':values,'catalogs':catalogs}

def backup():
    global PRIVATE,PHASE
    PHASE='read-only backup'
    os.umask(0o077)
    assert not MARKER.exists(),'An unfinished private rehearsal exists'
    PRIVATE=pathlib.Path(tempfile.mkdtemp(prefix='hsp-preprod-restored-',dir='/tmp'))
    MARKER.write_text(str(PRIVATE));MARKER.chmod(0o600)
    url=os.environ['HSP_PREPROD_DATABASE_URL'];parsed=urlsplit(url)
    assert parsed.scheme in ('postgres','postgresql')
    assert 'qaguotdproxamgudnnsd' in (unquote(parsed.username or '')+' '+(parsed.hostname or ''))
    with psycopg.connect(url,autocommit=True,connect_timeout=15,sslmode='require',options='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000') as remote:
        remote.execute('begin isolation level repeatable read read only')
        assert remote.execute('show transaction_read_only').fetchone()[0]=='on'
        snapshot=remote.execute('select pg_export_snapshot()').fetchone()[0]
        snapshot_time=remote.execute('select transaction_timestamp()').fetchone()[0].isoformat()
        reference=capture(remote);save_private('remote-reference.json',reference)
        save_private('database-owner.json',{'owner':remote.execute('select pg_get_userbyid(datdba) from pg_database where datname=current_database()').fetchone()[0],'read_only':True})
        roles=reference['catalogs']['roles']; memberships=reference['catalogs']['memberships']
        # No role password hashes are queried or backed up.
        role_sql=[]
        for r in roles:
            if r['rolname'].startswith('pg_'):continue
            attrs=' '.join(('' if r[k] else 'NO')+v for k,v in [('rolsuper','SUPERUSER'),('rolinherit','INHERIT'),('rolcreaterole','CREATEROLE'),('rolcreatedb','CREATEDB'),('rolcanlogin','LOGIN'),('rolreplication','REPLICATION'),('rolbypassrls','BYPASSRLS')])
            role_sql.append({'name':r['rolname'],'attributes':attrs})
        save_private('roles.json',{'roles':role_sql,'memberships':memberships})
        envfile=PRIVATE/'remote.env'
        env_values={'PGHOST':parsed.hostname,'PGPORT':str(parsed.port or 5432),'PGUSER':unquote(parsed.username or ''),'PGPASSWORD':unquote(parsed.password or ''),'PGDATABASE':unquote(parsed.path.lstrip('/')) or 'postgres','PGSSLMODE':'require','PGOPTIONS':'-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000','PGAPPNAME':'hsp_readonly_backup_20260904'}
        assert all('\n' not in str(v) for v in env_values.values())
        envfile.write_text(''.join(k+'='+str(v)+'\n' for k,v in env_values.items()));envfile.chmod(0o600)
        archive=PRIVATE/'preprod.dump';archive.touch(mode=0o600)
        try:
            run(['docker','run','--rm','--log-driver','none','--network','host','--user',str(os.getuid()),'--env-file',envfile,'--mount','type=bind,src='+str(PRIVATE)+',dst=/backup','--entrypoint','pg_dump',IMAGE,'--format=custom','--no-password','--snapshot='+snapshot,'--file=/backup/preprod.dump'])
        finally:envfile.unlink(missing_ok=True)
        remote.execute('rollback')
    report={'source_snapshot_transaction_utc':snapshot_time,'backup_completed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'project_ref':'qaguotdproxamgudnnsd','read_only':True,'exported_snapshot_shared_with_dump':True,'backup_bytes':archive.stat().st_size,'backup_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'private_directory_mode':oct(PRIVATE.stat().st_mode&0o777),'archive_mode':oct(archive.stat().st_mode&0o777),'role_passwords_exported':False,'public_table_counts':{t:len(v) for t,v in reference['tables'].items()},'catalog_sha256':{k:digest(v) for k,v in reference['catalogs'].items()}}
    save_private('safe-report.json',report)
    progress('Read-only snapshot and protected logical archive: complete')

def restore():
    global PHASE
    PHASE='local restore'
    (PRIVATE/'socket').mkdir(exist_ok=True,mode=0o700)
    (PRIVATE/'pgdata').mkdir(exist_ok=True,mode=0o700)
    state=run(['docker','inspect',CONTAINER],check=False)
    if state.returncode==0:
        run(['docker','start',CONTAINER])
    else:
        run(['docker','run','-d','--name',CONTAINER,'--network','none','--log-driver','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount','type=bind,src='+str(PRIVATE/'pgdata')+',dst=/var/lib/postgresql/data','--mount','type=bind,src='+str(PRIVATE/'socket')+',dst=/var/run/postgresql',IMAGE,'postgres','-c','logging_collector=off','-c','log_statement=none','-c','log_min_error_statement=panic','-c','log_min_messages=panic','-c','cron.launch_active_jobs=off'])
    for _ in range(60):
        try:
            state=json.loads(run(['docker','inspect',CONTAINER]).stdout)[0]['State']
            if not state['Running']:
                run(['docker','start',CONTAINER]);time.sleep(1);continue
            with local('postgres') as c:
                if not c.execute('show listen_addresses').fetchone()[0]:
                    time.sleep(1);continue
            break
        except Exception:time.sleep(1)
    else:raise RuntimeError('Local database unavailable')
    with local('postgres') as c:
        if not c.execute("select 1 from pg_database where datname='restored'").fetchone():
            c.execute('create database restored template template0')
        data=json.loads((PRIVATE/'roles.json').read_text())
        existing={x[0] for x in c.execute('select rolname from pg_roles')}
        for r in data['roles']:
            if r['name'] not in existing:c.execute(sql.SQL('create role {} '+r['attributes']).format(sql.Identifier(r['name'])))
            elif r['name']!='supabase_admin':c.execute(sql.SQL('alter role {} '+r['attributes']).format(sql.Identifier(r['name'])))
        for m in data['memberships']:
            c.execute(sql.SQL('grant {} to {} with admin {}, inherit {}, set {}').format(sql.Identifier(m['role']),sql.Identifier(m['member']),sql.SQL(str(m['admin_option']).lower()),sql.SQL(str(m['inherit_option']).lower()),sql.SQL(str(m['set_option']).lower())))
    with local('postgres') as c:
        desired={(m['role'],m['member']) for m in json.loads((PRIVATE/'roles.json').read_text())['memberships']}
        existing=rows(c,'select r.rolname role,m.rolname member,g.rolname grantor from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor')
        for m in existing:
            if (m['role'],m['member']) not in desired:
                c.execute(sql.SQL('revoke {} from {} granted by {} cascade').format(sql.Identifier(m['role']),sql.Identifier(m['member']),sql.Identifier(m['grantor'])))
    result=run(['docker','exec','-i',CONTAINER,'pg_restore','-U','supabase_admin','-d','restored','--exit-on-error'],input=(PRIVATE/'preprod.dump').read_bytes(),check=False)
    if result.returncode:
        save_private('restore-error.json',{'exit_code':result.returncode,'stderr_sha256':hashlib.sha256(result.stderr).hexdigest()});raise RuntimeError('Restore failed')
    with local('postgres') as c:
        owner=json.loads((PRIVATE/'database-owner.json').read_text())['owner']
        c.execute(sql.SQL('alter database restored owner to {}').format(sql.Identifier(owner)))
    if not (PRIVATE/'rehearsal.key').exists():
        run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',PRIVATE/'rehearsal.key','-out',PRIVATE/'rehearsal.crt','-subj','/CN=localhost','-days','1'])
    with local(readonly=True) as c:reference=capture(c)
    remote=json.loads((PRIVATE/'remote-reference.json').read_text())
    assert reference['tables']==remote['tables'],'Restored public rows differ'
    assert reference['catalogs']['history']==remote['catalogs']['history']
    save_private('restored-reference.json',reference)
    progress('Archive restored; all public rows and migration history match snapshot')


def expand(path):
    source='\n'.join(expand(path.parent/line[4:].strip()) if line.startswith('\\ir ') else line for line in path.read_text().splitlines())+'\n'
    # The repository seed uses fixed discipline UUIDs with ON CONFLICT(code).
    # A real database has those codes under different UUIDs. Resolve the fixture
    # references consistently in memory; never change the source SQL files.
    if PRIVATE and (PRIVATE/'restored-reference.json').exists():
        ref=json.loads((PRIVATE/'restored-reference.json').read_text())
        bycode={r['code']:r['id'] for r in ref['tables']['disciplines']}
        for n,code in enumerate(['REINING','GYMKHANA','PERFORMANCE'],1):
            if code in bycode:source=source.replace('32000000-0000-0000-0000-'+str(n).zfill(12),bycode[code])
    return source

def psql(db, source):
    return run(['docker','exec','-i',CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db],input=source.encode(),check=False)

def db_cli(db, dry=False):
    # CLI 2.102.0 misparses a Unix-socket URL. A short-lived loopback proxy
    # forwards only to the protected local socket; the container has no network.
    import socket, socketserver, select, threading, ssl, struct
    assert db in ('restored','restored_tests')
    tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(PRIVATE/'rehearsal.crt',PRIVATE/'rehearsal.key')
    class Forward(socketserver.BaseRequestHandler):
        def handle(self):
            client=self.request
            with socket.socket(socket.AF_UNIX) as upstream:
                upstream.connect(str(PRIVATE/'socket/.s.PGSQL.5432'))
                header=client.recv(8,socket.MSG_WAITALL)
                if len(header)!=8:return
                if struct.unpack('!II',header)==(8,80877104):
                    client.sendall(b'N');header=client.recv(8,socket.MSG_WAITALL)
                if len(header)!=8:return
                if struct.unpack('!II',header)==(8,80877103):
                    # PostgreSQL refuses TLS on Unix sockets. Terminate the
                    # ephemeral TLS connection here, inside the local process.
                    client.sendall(b'S');client=tls.wrap_socket(client,server_side=True)
                else:upstream.sendall(header)
                peers={client:upstream,upstream:client}
                try:
                    while True:
                        pending=isinstance(client,ssl.SSLSocket) and client.pending()>0
                        readable,_,_=select.select(list(peers),[],[],0 if pending else 30)
                        if pending and client not in readable:readable.append(client)
                        if not readable:return
                        for peer in readable:
                            data=peer.recv(65536)
                            if not data:return
                            peers[peer].sendall(data)
                finally:
                    if client is not self.request:client.close()
    with socketserver.ThreadingTCPServer(('127.0.0.1',0),Forward) as server:
        server.daemon_threads=True
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        port=server.server_address[1]
        url='postgresql://supabase_admin@127.0.0.1:'+str(port)+'/'+db+'?'+urlencode({'sslmode':'disable','options':'-c lock_timeout=5000 -c statement_timeout=120000'})
        args=[CLI,'db','push','--db-url',url,'--include-all','--workdir',PRIVATE/'cli']
        args+=['--dry-run'] if dry else ['--yes']
        try:result=run(args,check=False)
        finally:server.shutdown();thread.join()
    save_private(db+('-dry-run.json' if dry else '-apply.json'),{'exit_code':result.returncode,'output_sha256':hashlib.sha256(result.stdout+result.stderr).hexdigest()})
    if result.returncode:raise RuntimeError('Local migration CLI failed')
    return (result.stdout+result.stderr).decode()

def suite(stage):
    import re
    excluded={'legacy_rebuild_fixture','legacy_rebuild_assertions','preprod_reconciliation_fixture','preprod_showscore_flow_seed','preprod_reconciliation_assertions'}
    files=[p for p in sorted((ROOT/'supabase/tests').glob('*.sql')) if p.stem not in excluded]
    assert len(files)==29
    result={}
    for p in files:
        r=psql('restored_tests','\\set VERBOSITY verbose\n'+expand(p))
        DIAGNOSTICS[(stage,p.name)]=r.stderr
        states=re.findall(rb'ERROR:\s+([A-Z0-9]{5}):',r.stderr)
        result[p.name]={'passed':r.returncode==0,'exit_code':r.returncode,'sqlstate':states[0].decode() if states else None,'stderr_sha256':hashlib.sha256(r.stderr).hexdigest()}
    save_private(stage+'-tests.json',result)
    progress(stage+': '+str(sum(x['passed'] for x in result.values()))+'/29 SQL tests passed')
    return result

def actual_permissions(reference):
    warm=reference['tables']['show_score_paid_warmups'][0]
    own=warm['organization_id'];show=warm['show_id'];wid=warm['id']
    foreign=next(o['id'] for o in reference['tables']['organizations'] if o['id']!=own)
    # One transaction; fixture rows, role assignments and all RPC effects roll back.
    with local() as c:
        c.execute('begin')
        try:
            c.execute(expand(ROOT/'supabase/seed.sql').replace('\\set ON_ERROR_STOP on',''))
            c.execute("delete from public.show_roles where user_id='20000000-0000-0000-0000-000000000003'")
            c.execute("insert into public.organization_members (organization_id,user_id,role) values (%s,'20000000-0000-0000-0000-000000000003','announcer')",(own,))
            def actor(n,role='authenticated'):
                c.execute('reset role');c.execute(sql.SQL('set local role {}').format(sql.Identifier(role)))
                c.execute("select set_config('request.jwt.claim.sub',%s,true)",('10000000-0000-0000-0000-'+str(n).zfill(12),))
            def denied(query,params,state):
                c.execute('savepoint denial')
                try:c.execute(query,params)
                except psycopg.Error as e:
                    c.execute('rollback to savepoint denial')
                    assert e.sqlstate==state
                else:raise AssertionError('Unauthorized action succeeded')
                finally:c.execute('release savepoint denial')
            actor(3)
            assert c.execute('select count(*) from public.show_score_paid_warmups where id=%s',(wid,)).fetchone()[0]==1
            assert c.execute('update public.show_score_paid_warmups set name=name where id=%s',(wid,)).rowcount==0
            c.execute('select public.save_show_score_paid_warmup_live(%s,%s)',(wid,warm['is_public_live']))
            denied('select public.create_association_with_owner(%s,%s)',(foreign,'Forbidden test takeover'),'23505')
            c.execute('reset role')
            c.execute("update public.organization_members set role='secretary' where organization_id=%s and user_id='20000000-0000-0000-0000-000000000003'",(own,))
            actor(3)
            assert c.execute('update public.shows set name=name where id=%s',(show,)).rowcount==1
            assert c.execute('update public.show_days set day_name=day_name where id=%s',(warm['show_day_id'],)).rowcount==1
            assert c.execute('update public.blocks set display_label=display_label where id=%s',(warm['block_id'],)).rowcount==1
            c.execute('select public.save_show_score_paid_warmup_live(%s,%s)',(wid,warm['is_public_live']))
            denied('select public.create_association_with_owner(%s,%s)',(foreign,'Forbidden secretary takeover'),'23505')
            actor(4)
            denied('select public.create_association_with_owner(%s,%s)',(foreign,'Forbidden outsider takeover'),'23505')
            denied('select public.save_show_score_paid_warmup_live(%s,true)',(wid,),'42501')
            actor(6)
            denied('select public.save_show_score_paid_warmup_live(%s,true)',(wid,),'42501')
            c.execute('reset role')
            c.execute("insert into public.organization_members (organization_id,user_id,role) values (%s,'20000000-0000-0000-0000-000000000002','admin')",(own,))
            actor(2);c.execute('select public.save_show_score_paid_warmup_live(%s,%s)',(wid,warm['is_public_live']))
            actor(4,'anon')
            denied('select public.save_show_score_paid_warmup_live(%s,true)',(wid,),'42501')
            denied('select public.create_association_with_owner(%s,%s)',(foreign,'Forbidden anon takeover'),'42501')
            c.execute('reset role')
            actor(99)
            denied('select public.create_association_with_owner(null,%s)',('No profile',),'42501')
        finally:c.execute('rollback')
    return {'announcer_read':True,'announcer_live_rpc':True,'announcer_direct_update_denied':True,'secretary_schedule_and_live':True,'admin_live_rpc':True,'foreign_admin_live_denied':True,'anon_denied':True,'cross_association_escalation_denied':True,'profile_required':True,'all_mutations_rolled_back':True}

def validate():
    global PHASE
    PHASE='restored validation'
    import re
    report=json.loads((PRIVATE/'safe-report.json').read_text())
    ref=json.loads((PRIVATE/'restored-reference.json').read_text())
    audited=json.loads((ROOT/'docs/audits/2026-09-04-preprod-evidence.json').read_text())
    assert ref['catalogs']['history']==audited['history']
    assert len(ref['tables']['show_score_block_setups'])==7
    assert len(ref['tables']['organizations'])==4
    assert len(ref['tables']['class_templates'])==0
    for name,h in audited['audit_metadata']['migration_sha256'].items():
        assert hashlib.sha256((ROOT/'supabase/migrations'/name).read_bytes()).hexdigest()==h
    # Match existing authorization roles to remote flags (no password handling).
    with local('postgres') as c:
        rmeta=json.loads((PRIVATE/'roles.json').read_text())
        for r in rmeta['roles']:
            if r['name']!='supabase_admin':c.execute(sql.SQL('alter role {} '+r['attributes']).format(sql.Identifier(r['name'])))
        if '--resume-tests' not in sys.argv:
            c.execute('drop database if exists restored_tests with (force)')
            c.execute('create database restored_tests template restored')
            owner=json.loads((PRIVATE/'database-owner.json').read_text())['owner']
            c.execute(sql.SQL('alter database restored_tests owner to {}').format(sql.Identifier(owner)))
    with local(readonly=True) as c:
        local_roles={x['rolname']:x for x in capture(c)['catalogs']['roles']}
    remote_ref=json.loads((PRIVATE/'remote-reference.json').read_text())
    report['restored_role_attributes_equal']=all(local_roles.get(r['rolname'])==r for r in remote_ref['catalogs']['roles'])
    assert report['restored_role_attributes_equal']
    # Shared deterministic seed is committed only in the test clone. Each test rolls back.
    if '--resume-tests' not in sys.argv:
        r=psql('restored_tests',expand(ROOT/'supabase/seed.sql'))
        if r.returncode:
            save_private('test-seed-error.json',{'stderr_sha256':hashlib.sha256(r.stderr).hexdigest()});raise RuntimeError('Test seed failed')
        report['tests_restored_initial']=suite('initial')
    else:
        report['tests_restored_initial']=json.loads((PRIVATE/'initial-tests.json').read_text())
    cfg=PRIVATE/'cli/supabase';cfg.mkdir(parents=True,exist_ok=True)
    (cfg/'config.toml').write_text('project_id = "hsp-preprod-restored-20260904"\n')
    dest=cfg/'migrations';dest.mkdir(exist_ok=True)
    for p in (ROOT/'supabase/migrations').glob('*.sql'):shutil.copy2(p,dest/p.name)
    first=db_cli('restored',True)
    announced=re.findall(r'([0-9]{14})_[a-z_]+\.sql',first)
    assert list(dict.fromkeys(announced))==VERSIONS
    report['first_dry_run_versions']=list(dict.fromkeys(announced))
    for p in dest.glob('20260904*.sql'):p.unlink()
    applied=db_cli('restored');db_cli('restored_tests')
    report['historical_applied_versions']=re.findall(r'Applying migration ([0-9]+)_',applied)
    with local(readonly=True) as c:middle=capture(c)
    save_private('after-four-reference.json',middle)
    report['tests_after_four']=suite('four')
    for p in (ROOT/'supabase/migrations').glob('20260904*.sql'):shutil.copy2(p,dest/p.name)
    applied=db_cli('restored');db_cli('restored_tests')
    report['corrective_applied_versions']=re.findall(r'Applying migration ([0-9]+)_',applied)
    with local(readonly=True) as c:after=capture(c)
    save_private('after-six-reference.json',after)
    report['tests_after_six']=suite('six')
    comparisons={}
    for name in report['tests_after_four']:
        a=DIAGNOSTICS[('four',name)]
        b=DIAGNOSTICS[('six',name)]
        # Strict means byte-for-byte, not a normalized fingerprint.
        def normalized(x):
            x=re.sub(rb'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',b'<UUID>',x)
            return x
        comparisons[name]={'status_equal':report['tests_after_four'][name]['passed']==report['tests_after_six'][name]['passed'],'stderr_byte_identical':a==b,'stderr_equal_ignoring_generated_uuids':normalized(a)==normalized(b)}
    report['test_comparisons_four_vs_six']=comparisons
    assert all(v['status_equal'] for v in comparisons.values()),'SQL test status regression'
    def clean(records,ignored=()):return sorted((json.dumps({k:v for k,v in r.items() if k not in ignored},sort_keys=True) for r in records))
    changes={}
    for t, before in ref['tables'].items():
        ignored=('updated_at',) if t=='show_score_block_setups' else ('is_test_mode',) if t=='organizations' else ()
        equal=clean(before,ignored)==clean(after['tables'][t],ignored)
        changes[t]={'before_count':len(before),'after_count':len(after['tables'][t]),'equal_except_allowed_fields':equal}
        assert equal,'Unexpected public data change'
    report['public_data_comparisons']=changes
    report['setups']=[]
    byid={s['block_id']:s for s in after['tables']['show_score_block_setups']}
    for n,s in enumerate(sorted(ref['tables']['show_score_block_setups'],key=lambda x:x['block_id']),1):
        a=byid[s['block_id']]
        report['setups'].append({'label':'setup-'+str(n),'source_before':s['live_data_source'],'source_after':a['live_data_source'],'judges_before':len(s.get('judges') or []),'judges_after':len(a.get('judges') or []),'functional_before_sha256':digest({k:v for k,v in s.items() if k!='updated_at'}),'functional_after_sha256':digest({k:v for k,v in a.items() if k!='updated_at'}),'updated_at_changed':s['updated_at']!=a['updated_at']})
    new_history=after['catalogs']['history']
    assert {r['version'] for r in new_history}-{r['version'] for r in ref['catalogs']['history']}==set(VERSIONS)
    report['six_versions_recorded']=True
    with local(readonly=True) as c:
        d=c.execute("select column_name,column_default from information_schema.columns where table_schema='public' and table_name='show_score_block_setups' and column_name in ('live_data_source','qualified_rider_count')").fetchall()
        report['defaults']=dict(d);assert dict(d)=={'live_data_source':"'announcer'::text",'qualified_rider_count':'6'}
        rpc=c.execute("select p.oid::regprocedure::text,pg_get_function_result(p.oid),p.prosecdef,p.pronargdefaults,p.proargnames,has_function_privilege('anon',p.oid,'execute'),has_function_privilege('authenticated',p.oid,'execute') from pg_proc p where p.oid=to_regprocedure('public.save_show_score_paid_warmup_live(uuid,boolean,boolean,text,timestamp with time zone,jsonb)')").fetchone()
        assert rpc and rpc[1]=='jsonb' and rpc[2] and rpc[3]==5 and not rpc[5] and rpc[6]
        report['warmup_rpc']={'signature':rpc[0],'result':rpc[1],'security_definer':rpc[2],'default_arguments':rpc[3],'argument_names':rpc[4],'anon_execute':rpc[5],'authenticated_execute':rpc[6]}
    normalize=lambda rs,ignored=():sorted(json.dumps({k:v for k,v in row.items() if k not in ignored},sort_keys=True) for row in rs)
    catalog_checks={
        'roles':normalize(remote_ref['catalogs']['roles'])==normalize(after['catalogs']['roles']),
        'memberships':normalize(remote_ref['catalogs']['memberships'])==normalize(after['catalogs']['memberships']),
        'table_grants_ignoring_database_alias':normalize(remote_ref['catalogs']['grants'],('table_catalog',))==normalize(after['catalogs']['grants'],('table_catalog',)),
        'default_acls':normalize(remote_ref['catalogs']['default_acl'])==normalize(after['catalogs']['default_acl']),
        'baseline_functions_restored_exactly':remote_ref['catalogs']['functions']==ref['catalogs']['functions'],
        'baseline_columns_restored_exactly':remote_ref['catalogs']['columns']==ref['catalogs']['columns'],
    }
    old_policies={(x['tablename'],x['policyname']):x for x in remote_ref['catalogs']['policies']}
    new_policies={(x['tablename'],x['policyname']):x for x in after['catalogs']['policies']}
    catalog_checks['existing_policies_unchanged']=all(new_policies.get(k)==v for k,v in old_policies.items())
    assert all(catalog_checks.values())
    assert len(new_policies.keys()-old_policies.keys())==7
    catalog_checks['new_policy_count']=7
    report['catalog_validation']=catalog_checks
    report['fixture_catalog_uuid_remapping']={'codes':['REINING','GYMKHANA','PERFORMANCE'],'source_sql_files_unchanged':True,'same_mapping_at_all_test_stages':True}
    report['app_results']=json.loads((PRIVATE/'app-results.json').read_text())
    report['strict_historical_error_identity']={n:comparisons[n]['stderr_byte_identical'] for n in ['bloc3_final_validation.sql','compatibility_views_security_invoker.sql']}
    assert all(o['is_test_mode'] is False for o in after['tables']['organizations'])
    report['permissions_on_restored_rows']=actual_permissions(ref)
    with local(readonly=True) as c:post_tests=capture(c)
    assert post_tests['tables']==after['tables'],'Permission tests did not roll back'
    last=db_cli('restored',True)
    assert 'Would push these migrations' not in last and not re.search(r'[0-9]{14}_[a-z_]+\.sql',last)
    report['second_dry_run_empty']=True
    report['catalog_after_sha256']={k:digest(v) for k,v in after['catalogs'].items()}
    report['validation_complete']=True
    report['draft_pr_ready']=all(v['passed'] for v in report['app_results'].values())
    report['preprod_application_ready']=all(v['passed'] for v in report['tests_after_six'].values()) and all(report['strict_historical_error_identity'].values())
    save_private('safe-report.json',report)
    OUT.mkdir(exist_ok=True)
    (OUT/'restored-validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    progress('Restored-data comparisons, permissions, history and empty second dry-run: PASS')

def app_tests():
    result={}
    for name in ['test:draw','test:payout','test:paid-warmup','test:identity','test:governing','test:eligibility','test:capacity:config','build']:
        r=run(['npm','run',name],check=False)
        result[name]={'passed':r.returncode==0,'exit_code':r.returncode,'output_sha256':hashlib.sha256(r.stdout+r.stderr).hexdigest()}
        progress(name+': '+('PASS' if r.returncode==0 else 'FAIL'))
    save_private('app-results.json',result)


def cleanup():
    global PHASE
    PHASE='cleanup'
    assert PRIVATE.parent==pathlib.Path('/tmp') and PRIVATE.name.startswith('hsp-preprod-restored-')
    run(['docker','rm','-f','-v',CONTAINER])
    # PostgreSQL owns data files. Remove them as root inside an isolated helper,
    # whose only host mount is this exact verified disposable directory.
    run(['docker','run','--rm','--network','none','--log-driver','none','--user','root','--mount','type=bind,src='+str(PRIVATE)+',dst=/wipe','--entrypoint','sh',IMAGE,'-c','rm -rf /wipe/* /wipe/.[!.]* /wipe/..?*'])
    PRIVATE.rmdir();MARKER.unlink()
    assert not PRIVATE.exists() and not MARKER.exists()
    assert run(['docker','inspect',CONTAINER],check=False).returncode!=0
    target=OUT/'restored-validation.json'
    data=json.loads(target.read_text())
    data['cleanup']={'container_destroyed':True,'archive_deleted':True,'private_captures_and_keys_deleted':True,'temporary_directory_deleted':True,'verified_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    target.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
    progress('Disposable instance, backup, private captures and keys deleted and absence verified')

def load_private():
    global PRIVATE
    PRIVATE=pathlib.Path(MARKER.read_text())
    assert PRIVATE.parent==pathlib.Path('/tmp') and PRIVATE.name.startswith('hsp-preprod-restored-')

if __name__=='__main__':
    os.umask(0o077)
    try:
        stage=sys.argv[1]
        if stage=='backup':backup()
        else:
            load_private()
            if stage=='restore':restore()
            elif stage=='validate':validate()
            elif stage=='app':app_tests()
            elif stage=='cleanup':cleanup()
            else:raise ValueError('Unknown stage')
    except Exception as e:
        if PRIVATE and PRIVATE.exists():
            # Only exception class/SQLSTATE escape to the console. Raw messages
            # may contain data and remain private until cleanup.
            save_private('last-exception.json',{'phase':PHASE,'type':type(e).__name__,'sqlstate':getattr(e,'sqlstate',None),'message_sha256':hashlib.sha256(str(e).encode()).hexdigest()})
        progress('STOP: '+PHASE+' ('+type(e).__name__+', SQLSTATE '+str(getattr(e,'sqlstate',None))+')')
        sys.exit(1)
