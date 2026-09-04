#!/usr/bin/env python3
"""PostgREST/Auth contract checks. Fixed localhost URL; synthetic test users only."""
import json, pathlib, subprocess, urllib.request, urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
raw=subprocess.run([str(ROOT/'node_modules/.bin/supabase'),'status','--workdir','/tmp/hsp-reconciliation-20260904','-o','json'],capture_output=True,text=True,check=True)
config=json.loads(raw.stdout)
assert config['API_URL'].rstrip('/')=='http://127.0.0.1:54321'
key=config['ANON_KEY']
base='http://127.0.0.1:54321'

def request(path, data, token=None):
    req=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'apikey':key,'Authorization':'Bearer '+(token or key),'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=15) as r: return r.status,json.load(r)
    except urllib.error.HTTPError as e: return e.code,json.load(e)

def login(email):
    status,body=request('/auth/v1/token?grant_type=password',{'email':email,'password':'phase1-password'})
    assert status==200,(status,body)
    return body['access_token']

rpc='/rest/v1/rpc/save_show_score_paid_warmup_live'
body={'target_paid_warmup_id':'50000000-0000-0000-0000-000000000008','target_is_public_live':True}
status,data=request(rpc,body)
assert status==401,(status,data)
secretary=login('phase1.org-a-secretary@example.test')
status,data=request(rpc,body,secretary)
assert status==200 and data['is_public_live'] is True,(status,data)
foreign=login('phase1.org-b-admin@example.test')
status,data=request(rpc,body,foreign)
assert status==403,(status,data)
outsider=login('phase1.org-a-owner@example.test')
status,data=request('/rest/v1/rpc/create_association_with_owner',{'target_id':'30000000-0000-0000-0000-000000000002','target_name':'Forbidden API takeover'},outsider)
assert status==409 and data['code']=='23505',(status,data)
print('PostgREST: anon denied, secretary warm-up RPC available, foreign admin denied, association takeover denied: PASS')
