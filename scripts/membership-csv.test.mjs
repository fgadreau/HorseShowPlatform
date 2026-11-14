import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMembershipCsv} from '../src/lib/membershipCsv.ts';
test('French Excel UTF-8 BOM and semicolons, dates, quoted delimiters and escaped quotes',()=>{
 const rows=parseMembershipCsv('\uFEFFPrénom;Nom;Courriel;Numéro de membre;Valide du;Valide au;Notes\r\nAlex;Martin;alex@example.test;EXT1;2026-01-01;2026-12-31;"Achetée; note ""CA"""\r\n');
 assert.equal(rows.length,1);assert.equal(rows[0].first_name,'Alex');assert.equal(rows[0].membership_number,'EXT1');assert.equal(rows[0].valid_until,'2026-12-31');assert.equal(rows[0].notes,'Achetée; note "CA"');
});
test('English fields, explicit contact ID and multiline notes',()=>{
 assert.deepEqual(parseMembershipCsv('contact_id,membership_number,notes\na,123,"Line 1\nLine 2"'),[{contact_id:'a',membership_number:'123',notes:'Line 1\nLine 2'}]);
});
test('invalid or ambiguous CSV is rejected before review',()=>{
 for(const [csv,code] of [['email,courriel\na,b','CSV_DUPLICATE_HEADERS'],['foo,bar\na,b','CSV_IDENTITY_COLUMNS_REQUIRED'],['email,notes\na,"oops','CSV_INVALID_QUOTES'],['email,notes\na,b,c','CSV_COLUMN_COUNT'],['email\n','CSV_EMPTY'],['email\na\uFFFD','CSV_UTF8_REQUIRED']])assert.throws(()=>parseMembershipCsv(csv),new RegExp(code));
 assert.throws(()=>parseMembershipCsv('email\n'+Array(501).fill('a@example.test').join('\n')),/CSV_ROW_LIMIT/);
});
