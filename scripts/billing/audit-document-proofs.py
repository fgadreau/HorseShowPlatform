"""Independent decimal arithmetic and PDF text reconciliation. No renderer or pricing imports."""
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
import json, re, hashlib, sys
root=Path('docs/billing-demo-20260909')
checks=0
summaries=[]
def check(value, message):
 global checks
 if not value: raise AssertionError(message)
 checks+=1
def D(value):return Decimal(str(value))
def round2(value):return value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
all_docs=[]
for folder in [root,root/'integrated']:
 cases=json.loads((folder/'snapshots.json').read_text()); manifest=json.loads((folder/'results.json').read_text())
 check(manifest['complete'],str(folder)+' generation complete')
 for case in cases:
  d=case['document'];s=d['snapshot'];supplier={'association':Decimal(0),'hsp':Decimal(0)};allocated={k:Decimal(0) for k in supplier}
  for c in s['charges']:
   check(round2(D(c['quantity'])*D(c['unit_price']))==D(c['subtotal']),'base')
   for t in c['taxes']:check(round2(D(t['base'])*D(t['rate'])/100)==D(t['amount']),'tax rounding')
   check(sum(D(t['amount']) for t in c['taxes'])==D(c['tax_amount']),'tax sum');check(D(c['subtotal'])+D(c['tax_amount'])==D(c['total']),'line total')
   supplier[c['supplier']]+=D(c['total'])
  for k in ['subtotal','tax_amount','total']:check(sum(D(c[k]) for c in s['charges'])==D(s[k]),'account '+k)
  check(sum(D(p['amount']) for p in s['payments'])==D(s['received']),'received');check(D(s['total'])-D(s['received'])==D(s['balance']),'balance')
  for p in s['payments']:
   check(sum(D(a['amount']) for a in p['allocations'])==D(p['amount']),'allocation sum')
   for a in p['allocations']:
    c=next(c for c in s['charges'] if c['id']==a['charge_id']);allocated[c['supplier']]+=D(a['amount'])
  for c in s['charges']:check(sum(D(a['amount']) for p in s['payments'] for a in p['allocations'] if a['charge_id']==c['id'])<=D(c['total']),'no excess')
  check(sum(supplier.values())==D(s['total']),'supplier sum');check(sum(allocated.values())==D(s['received']),'supplier paid sum')
  check(s['supplier_invoices']['association']['fiscal_id']!=s['supplier_invoices']['hsp']['fiscal_id'],'two IDs')
  for locale in ['fr','en']:
   item=next(x for x in manifest['documents'] if Path(x['path']).name==case['name']+'-'+locale+'.pdf');pdf=Path(item['path']);text=pdf.with_suffix('.txt').read_text()
   check(hashlib.sha256(pdf.read_bytes()).hexdigest()==item['sha256'],'actual PDF hash')
   check(s['account_number'] in text,'account number')
   if d['number']:check(d['number'] in text,'document number')
   vals= re.findall(r'(\d[\d\s\u00a0\u202f]*,\d{2})\s*\$',text) if locale=='fr' else re.findall(r'\$\s*(\d[\d,]*\.\d{2})',text)
   amounts=[D(re.sub(r'\s','',v).replace(',','.') if locale=='fr' else v.replace(',','')) for v in vals]
   for k in ['total','received','balance']:check(D(s[k]) in amounts,'global amount '+k)
   for p in s['payments']:
    check(D(p['amount']) in amounts,'payment amount')
    if p.get('receipt_number'):check(p['receipt_number'] in text,'receipt in history')
   if d['kind']=='receipt':
    p=next(p for p in s['payments'] if p['id']==d['payment_id'])
    check(D(s['balance'])+D(p['amount']) in amounts,'before payment')
    for value in [supplier['hsp'],allocated['hsp'],supplier['hsp']-allocated['hsp']]:check(value in amounts,'HSP account position')
    if supplier['hsp']>0:check('commandités' not in text and 'Sponsored HSP' not in text,'zero allocation is not sponsorship')
   else:
    for k in supplier:check(supplier[k] in amounts,'supplier total printed');check(s['supplier_invoices'][k]['fiscal_id'] in text,'supplier ID printed')
   check(not re.search(r'\d{4}-\d{2}-\d{2}T\d',text),'readable date')
   if locale=='en':check(not re.search(r'Frais de|commandités|plus taxes|Inscriptions et stalle|DÉMONSTRATION',text),'English descriptions')
   all_docs.append(item)
  summaries.append({'name':case['name'],'origin':str(folder),'total':s['total'],'paid':s['received'],'balance':s['balance'],'association':str(supplier['association']),'hsp':str(supplier['hsp'])})
# The original seven scenarios must keep every monetary value and allocation.
baseline=root/'validation/baseline/snapshots.json'
if baseline.exists():
 old=json.loads(baseline.read_text());new=json.loads((root/'snapshots.json').read_text())
 def financial(s):return {k:s[k] for k in ['subtotal','tax_amount','total','received','balance']}|{'charges':[{k:c[k] for k in ['id','supplier','quantity','unit_price','subtotal','tax_amount','total','taxes']} for c in s['charges']],'payments':[{k:p[k] for k in ['id','amount','method','received_at','allocations']} for p in s['payments']]}
 for x in old:check(financial(x['document']['snapshot'])==financial(next(n['document']['snapshot'] for n in new if n['name']==x['name'])),'original finances preserved '+x['name'])
financial_migration=root/'validation/baseline/financial-migration.sql'
if financial_migration.exists():check(financial_migration.read_bytes()==Path('supabase/migrations/20260909000100_billing_consolidated_suppliers.sql').read_bytes(),'financial migration unchanged')
result={'complete':True,'checks':checks,'pdfs':len(all_docs),'pages':sum(d['pages'] for d in all_docs),'baselineCompared':baseline.exists(),'scenarios':summaries}
(root/'validation').mkdir(exist_ok=True);(root/'validation/independent-audit.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='scenarios'}))
