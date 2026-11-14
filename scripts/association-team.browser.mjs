import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import { serverlessBrowser } from '../server/vet/serverless-browser.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

mkdirSync('.tmp/association-team-ui', { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:1100px;margin:24px auto;padding:16px"></main><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {AssociationTeamSettings} from '/src/features/settings/AssociationTeamSettings.tsx';import '/src/styles.css';
const params=new URLSearchParams(location.search);window.calls=[];window.refreshes=0;
window.team=[{id:'a',profile_id:'me',display_name:'Alex Administrateur',email:'admin@example.test',role:'admin'},{id:'b',profile_id:'secretary',display_name:'Sam Secrétaire',email:'secretary@example.test',role:'secretary'}];
createRoot(document.getElementById('root')).render(React.createElement(AssociationTeamSettings,{organizationId:'org',currentProfileId:'me',canAdminister:!params.has('readonly'),locale:params.get('locale')||'fr',onRefresh:()=>window.refreshes++}));</script></body></html>`;
const mock = `export async function loadAssociationTeam(){window.calls.push({kind:'load'});return [...window.team];}
export async function saveAssociationRole(org,email,role,previous){window.calls.push({kind:'save',org,email,role,previous});if(email==='missing@example.test')throw Error('ASSOCIATION_ACCOUNT_NOT_FOUND');if(email==='admin@example.test'&&role!=='admin')throw Error('LAST_ASSOCIATION_ADMIN');const found=window.team.find(m=>m.email===email);if(found)found.role=role;else window.team.push({id:'c',profile_id:'new',display_name:'Taylor',email,role});}
export async function removeAssociationMember(org,member){window.calls.push({kind:'remove',org,member});window.team=window.team.filter(m=>m.id!==member.id);}`;
const server = await createServer({ configFile: false, envDir: false, plugins: [react(), { name: 'team-test', enforce: 'pre', resolveId(source, importer) { if (source === './associationTeamService' && importer?.includes('AssociationTeamSettings')) return '\0team-mock'; }, load(id) { if (id === '\0team-mock') return mock; }, configureServer(server) { server.middlewares.use('/team-test', async (_req, res, next) => { try { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/team-test', html)); } catch (error) { next(error); } }); } }], server: { host: '127.0.0.1', port: 5203, strictPort: true } });
let browser;
try {
  await server.listen(); browser = process.platform === 'linux' ? await serverlessBrowser.launch({ headless: true }) : await chromium.launch(process.platform === 'win32' ? { channel: 'chrome', headless: true } : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for (const locale of ['fr','en']) {
    const fr=locale==='fr';
    await page.goto('http://127.0.0.1:5203/team-test?locale='+locale);
    await expect(page.getByText('admin@example.test',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:(fr?'Retirer l’accès de':'Remove access for')+' admin@example.test',exact:true})).toBeDisabled();
    const email=page.getByLabel(fr?'Courriel du compte':'Account email');
    const role=page.getByLabel(fr?'Rôle dans l’association':'Association role');
    await email.fill('missing@example.test');
    await page.getByRole('button',{name:fr?'Ajouter à l’équipe':'Add to team',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText(fr?'Aucun compte trouvé':'No account found');
    await email.fill('scribe@example.test'); await role.selectOption('scribe');
    await expect(page.locator('.team-role-description')).toContainText(fr?'Aucun accès gestionnaire':'No management access');
    await page.getByRole('button',{name:fr?'Ajouter à l’équipe':'Add to team',exact:true}).click();
    await expect(page.getByText('scribe@example.test',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:(fr?'Modifier le rôle de':'Edit role for')+' scribe@example.test',exact:true}).click();
    await role.selectOption('announcer');
    await page.getByRole('button',{name:fr?'Enregistrer le rôle':'Save role',exact:true}).click();
    await expect(page.locator('.team-members li').filter({hasText:'scribe@example.test'}).locator('.team-role-badge')).toHaveText(fr?'Annonceur':'Announcer');
    await page.getByRole('button',{name:(fr?'Retirer l’accès de':'Remove access for')+' scribe@example.test',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.calls)).filter(c=>c.kind==='remove').length,0);
    await page.getByRole('button',{name:fr?'Confirmer le retrait':'Confirm removal',exact:true}).click();
    await expect(page.getByText('scribe@example.test',{exact:true})).toHaveCount(0);
    const calls=await page.evaluate(()=>window.calls);
    assert(calls.some(c=>c.kind==='save'&&c.previous==='scribe'&&c.role==='announcer'));
    assert.equal(await page.evaluate(()=>window.refreshes),3);
    await page.screenshot({path:'.tmp/association-team-ui/desktop-'+locale+'.png'});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'.tmp/association-team-ui/mobile-'+locale+'.png'});
    await page.setViewportSize({width:1365,height:1000});
  }
  await page.goto('http://127.0.0.1:5203/team-test?readonly=1');
  await expect(page.getByText('Un administrateur de l’association peut ajouter des personnes et gérer leurs rôles ici.')).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
  assert.equal((await page.evaluate(()=>window.calls)).length,0);
  assert.deepEqual(errors,[]);
  console.log('PASS: association team add/edit/remove, explicit confirmation, account errors, shared role labels, last admin, FR/EN, mobile and non-admin access');
} finally { await browser?.close(); await server.close(); }
