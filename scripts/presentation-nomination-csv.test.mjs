import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIncentiveNominationCsv} from '../src/lib/incentiveNominationCsv.ts';
test('CSV stores a horse nominator without requiring season or a contact',()=>{
 const result=parseIncentiveNominationCsv('code_programme;nom_cheval;nominateur\nBREED;Test Horse;Élevage des Érables');
 assert.deepEqual(result.errors,[]);assert.equal(result.rows[0].nominator_name,'Élevage des Érables');assert.equal(result.rows[0].season_year,'');
});
test('existing CSVs remain valid and long nominator names are rejected',()=>{
 assert.deepEqual(parseIncentiveNominationCsv('program_code,horse_name\nBREED,Test Horse').errors,[]);
 assert.equal(parseIncentiveNominationCsv('program_code,horse_name,nominator_name\nBREED,Test Horse,'+'x'.repeat(201)).errors.length,1);
});
