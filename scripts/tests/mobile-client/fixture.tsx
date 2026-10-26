import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from '../../../src/features/dashboard/Dashboard';
import { ClientDashboardView } from '../../../src/features/dashboard/ClientDashboardView';
import { translations } from '../../../src/lib/i18n';
import { ModalDialog } from '../../../src/components/ui';
import { AuthScreen } from '../../../src/features/auth/AuthScreen';
import '../../../src/styles.css';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'en' ? 'en' : 'fr';
const organization = { id: 'org', name: 'Association de démonstration', plan_tier: 'pro', currency: 'CAD' };
const profile = { id: 'profile', user_id: 'user', first_name: 'Client', last_name: 'Pilote', address: '123 Test', city: 'Québec', country: 'CA', type_user: 'owner' };
const contact = { id: 'contact', linked_user_id: 'profile', first_name: 'Client', last_name: 'Pilote', type: 'owner' };
const disciplines = [{ id: 'western', code: 'PERFO', name: 'Performance', is_active: true }, { id: 'reining', code: 'REINING', name: 'Reining', is_active: true }];
const directories = disciplines.map((discipline, index) => ({ id: discipline.id + '-directory', organization_id: 'org', discipline_id: discipline.id, is_active: true, is_default: index === 0 }));
const membershipTypes = [{ id: 'membership', organization_id: 'org', name: 'Carte annuelle', code: 'ANNUAL', is_active: true, season_year: 2099, valid_from: '2099-01-01', valid_until: '2099-12-31', price: 25, currency: 'CAD' }];
const stallOptions = [{ id: 'stall', organization_id: 'org', show_id: 'show', name: 'Stalle', category: 'stall', price: 100, total_quantity: 50, available_quantity: 50 }];
const context = new Proxy({ profile, isPlatformAdmin: false, loadedOrganizationId: 'org', organizations: [organization], disciplines, organizationDisciplines: directories, organizationMembershipTypes: membershipTypes, stallOptions, contacts: [contact], directoryContacts: [{ id: 'link', contact_id: 'contact', organization_discipline_id: 'reining-directory' }], contactOrganizationLinks: [{ contact_id: 'contact', organization_id: 'org' }], shows: [{ id: 'show', organization_id: 'org', name: 'Show pilote', status: 'open', start_date: '2099-01-01', end_date: '2099-01-03', default_currency: 'CAD', is_public: true }] }, { get: (target, key) => key in target ? target[key] : [] });
window.mobileActions = [];
function Fixture() {
  const [view, setView] = useState(params.get('view') || 'my-overview');
  const [modal, setModal] = useState(false);
  const navigate = (next) => { window.mobileActions.push(next); setView(next); };
  const props = new Proxy({ context, activeView: view, selectedOrganizationId: 'org', locale, loading: false, notice: null, t: translations[locale], onViewChange: navigate, onLocaleChange: () => {}, onUpdateUserProfile: async () => window.mobileActions.push('profile-saved'), onSignOut: () => window.mobileActions.push('signed-out') }, { get: (target, key) => key in target ? target[key] : async () => {} });
  return <>
    {params.has('warnings') ? <ClientDashboardView {...Object.fromEntries(['contacts','classes','entries','horses','invoices','organizations','shows','showDays','stallBookings','stallOptions'].map(key => [key, []]))} locale={locale} profile={{ ...profile, address: '' }} onViewChange={navigate} /> : <Dashboard {...props} />}
    <button onClick={() => setModal(true)} id="long-modal">Open long form</button>
    {modal && <ModalDialog title="Formulaire de démonstration avec un titre très long sur petit écran" onClose={() => setModal(false)}><form className="stack">{Array.from({ length: 24 }, (_, index) => <label key={index}>Champ {index + 1}<input /></label>)}<button type="button">Enregistrer</button></form></ModalDialog>}
  </>;
}
createRoot(document.getElementById('root')!).render(params.has('auth')
  ? <AuthScreen locale={locale} notice={null} t={translations[locale]} onLocaleChange={() => {}} onNotice={() => {}} />
  : <Fixture />);
