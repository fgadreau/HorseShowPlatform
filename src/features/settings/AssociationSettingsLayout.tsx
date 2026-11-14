import { Children, createContext, isValidElement, useContext, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, UsersRound, CreditCard, BadgeCheck, ShoppingBag, HeartPulse, ShieldCheck, UserRound, ChevronDown, ChevronRight, SlidersHorizontal, Search, X } from 'lucide-react';
import type { Locale } from '../../lib/i18n';
import './associationSettings.css';

type Category = 'association' | 'members' | 'rules' | 'account';
export type SettingsSectionId = 'identity' | 'team' | 'memberships' | 'membership-billing' | 'membership-import' | 'products' | 'disciplines' | 'credentials' | 'health' | 'profile';
const categoryLabels = {
  association: ['Association', 'Association'], members: ['Membres et ventes', 'Members and sales'],
  rules: ['Règles et conformité', 'Rules and compliance'], account: ['Mon compte', 'My account'],
};
function sections(fr: boolean) {
  const text = (a: string, b: string) => fr ? a : b;
  return [
    { id: 'identity', category: 'association', icon: Building2, title: text('Identité, coordonnées et taxes', 'Identity, contact and taxes'), description: text('Coordonnées de l’association, adresse de facturation, devise et taxes.', 'Association contact details, billing address, currency and taxes.') },
    { id: 'team', category: 'association', icon: UsersRound, title: text('Équipe et rôles', 'Team and roles'), description: text('Personnes autorisées et rôles partagés avec ShowScore.', 'Authorized people and roles shared with ShowScore.') },
    { id: 'memberships', category: 'members', icon: BadgeCheck, title: text('Cartes de membre', 'Memberships'), description: text('Types d’adhésion, tarifs, saisons et périodes de validité.', 'Membership types, prices, seasons and validity periods.') },
    { id: 'membership-import', category: 'members', icon: UsersRound, title: text('Importer ou attribuer des cartes', 'Import or assign memberships'), description: text('CSV de cartes achetées ailleurs, correspondances avec les cavaliers et cartes gratuites internes.', 'CSV of externally purchased memberships, rider matching and internal complimentary cards.') },
    { id: 'membership-billing', category: 'members', icon: CreditCard, title: text('Facturation des adhésions', 'Membership billing'), description: text('Relier les cartes de membre aux comptes et à la facturation.', 'Connect memberships to accounts and billing.') },
    { id: 'products', category: 'members', icon: ShoppingBag, title: text('Produits et extras', 'Products and extras'), description: text('Catalogue des ventes manuelles et des extras de réservation.', 'Catalog for manual sales and reservation extras.') },
    { id: 'disciplines', category: 'rules', icon: SlidersHorizontal, title: text('Disciplines et admissibilité', 'Disciplines and eligibility'), description: text('Répertoires, organismes sanctionneurs, adhésions et assurances exigées.', 'Directories, sanctioning bodies, required memberships and insurance.') },
    { id: 'credentials', category: 'rules', icon: ShieldCheck, title: text('Numéros externes obligatoires', 'Required external numbers'), description: text('Identifiants requis dans les fiches des cavaliers de l’association.', 'Required identifiers in association rider records.') },
    { id: 'health', category: 'rules', icon: HeartPulse, title: text('Santé et dossards', 'Health and back numbers'), description: text('Documents sanitaires, validité, contrôles et attribution des dossards.', 'Health documents, validity, checks and back number assignment.') },
    { id: 'profile', category: 'account', icon: UserRound, title: text('Profil connecté', 'Signed-in profile'), description: text('Informations du compte actuellement connecté et identifiant du profil.', 'Current signed-in account information and profile identifier.') },
  ] as const;
}
const searchKeywords: Record<SettingsSectionId, string> = {
  identity: 'nom contact courriel email telephone adresse address province pays country devise currency TPS TVQ GST QST HST taxes facturation billing',
  team: 'administrateur admin secretaire secretary scribe annonceur announcer permissions acces access equipe team roles showscore',
  memberships: 'adhesion membre membership carte tarif prix price saison season validite expiration',
  'membership-import': 'csv import importer membre membership carte achat externe external gratuit gratuite free complimentary CA benevole board liaison lien cavalier rider utilisateur user',
  'membership-billing': 'adhesion membre membership carte compte account paiement payment facturation billing reprise achats taxes',
  products: 'produit product extra vente sale catalogue catalog foin feed ripe bedding repas meal billet ticket marchandise merchandise SKU prix price',
  disciplines: 'discipline repertoire directory admissibilite eligibility organisme sanction assurance insurance adhesion membership enregistrement registration cavalier rider cheval horse',
  credentials: 'numero number externe external identifiant identifier cavalier rider organisme adhesion membership OPTS PTSO',
  health: 'sante health coggins EIA AIE influenza rhino rhinopneumonie vaccin vaccination certificat document validite mois month identite identity controle enforcement dossard back number cheval horse cavalier rider',
  profile: 'profil profile personnel personal utilisateur user compte account identifiant id',
};
function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
type Navigation = { fr: boolean; visibleIds: Set<string>; open: Set<string>; toggle: (id: string) => void };
const SettingsNavigation = createContext<Navigation | null>(null);

export function AssociationSettingsLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const fr = locale === 'fr';
  const [category, setCategory] = useState<Category | 'all'>('association');
  const [selected, setSelected] = useState('all');
  const [query, setQuery] = useState('');
  const searchHintId = useId();
  const searchInputId = useId();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const elements = Children.toArray(children);
  const sectionElements = elements.filter(element => isValidElement<{id?: string}>(element) && element.props.id);
  const intro = elements.filter(element => !isValidElement<{id?: string}>(element) || !element.props.id);
  const items = sections(fr).filter(item => sectionElements.some(element => isValidElement<{id?: string}>(element) && element.props.id === item.id));
  const orderedSections = items.map(item => sectionElements.find(element => isValidElement<{id?: string}>(element) && element.props.id === item.id));
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  const searching = terms.length > 0;
  const visible = items.filter(item => searching
    ? terms.every(term => normalizeSearch(`${item.title} ${item.description} ${searchKeywords[item.id]} ${categoryLabels[item.category].join(' ')}`).includes(term))
    : category === 'all' || item.category === category);
  const visibleIds = new Set(visible.filter(item => selected === 'all' || item.id === selected).map(item => item.id));
  const toggle = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <SettingsNavigation.Provider value={{ fr, visibleIds, open, toggle }}>
    <div className="content-grid association-settings">
      {intro}
      <section className="panel association-settings-navigation" aria-label={fr ? 'Navigation des paramètres' : 'Settings navigation'}>
        <div className="settings-navigation-heading"><span className="settings-navigation-icon"><SlidersHorizontal size={22} aria-hidden="true" /></span><div><h2>{fr ? 'Retrouvez le bon réglage' : 'Find the right setting'}</h2><p>{fr ? 'Choisissez un thème ou accédez directement à une carte. Ouvrez seulement ce dont vous avez besoin.' : 'Choose a topic or jump directly to a card. Open only what you need.'}</p></div></div>
        <div className="settings-search"><label htmlFor={searchInputId}>{fr ? 'Rechercher un réglage' : 'Search settings'}</label><div className="settings-search-field"><Search size={19} aria-hidden="true" /><input id={searchInputId} type="search" value={query} aria-describedby={searchHintId} placeholder={fr ? 'Taxes, secrétaire, Coggins…' : 'Taxes, secretary, Coggins…'} onChange={event => { setQuery(event.target.value); setSelected('all'); }} />{query && <button type="button" aria-label={fr ? 'Effacer la recherche' : 'Clear search'} onClick={() => { setQuery(''); setSelected('all'); }}><X size={18} aria-hidden="true" /></button>}</div><small id={searchHintId}>{fr ? 'La recherche couvre tous les thèmes, même les cartes repliées.' : 'Search covers all topics, including collapsed cards.'}</small></div>
        <div className="settings-category-options" role="group" aria-label={fr ? 'Thèmes des paramètres' : 'Settings topics'}>
          {(['all', ...Object.keys(categoryLabels)] as (Category | 'all')[]).map(key => <button type="button" key={key} aria-pressed={!searching && category === key} onClick={() => { setCategory(key); setSelected('all'); setQuery(''); }}>
            {key === 'all' ? (fr ? 'Tout voir' : 'View all') : categoryLabels[key][fr ? 0 : 1]}<span>{items.filter(item => key === 'all' || item.category === key).length}</span>
          </button>)}
        </div>
        <div className="settings-jump-row"><label>{fr ? 'Accéder à un réglage' : 'Go to a setting'}<select value={selected} onChange={event => { const id = event.target.value; setSelected(id); if (id !== 'all') setOpen(current => new Set(current).add(id)); }}>
          <option value="all">{searching ? (fr ? 'Tous les résultats' : 'All results') : (fr ? 'Toutes les cartes de ce thème' : 'All cards in this topic')}</option>
          {visible.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
        </select></label><button type="button" className="ghost-button" disabled={!open.size} onClick={() => setOpen(new Set())}>{fr ? 'Tout replier' : 'Collapse all'}</button>
          <span role="status">{searching ? (fr ? `${visibleIds.size} résultat${visibleIds.size > 1 ? 's' : ''} dans tous les thèmes` : `${visibleIds.size} result${visibleIds.size !== 1 ? 's' : ''} across all topics`) : (fr ? `${visibleIds.size} carte${visibleIds.size > 1 ? 's' : ''} affichée${visibleIds.size > 1 ? 's' : ''}` : `${visibleIds.size} card${visibleIds.size !== 1 ? 's' : ''} shown`)}</span>
        </div>
      </section>
      {searching && !visible.length && <div className="panel settings-search-empty"><Search size={24} aria-hidden="true" /><h2>{fr ? 'Aucun réglage trouvé' : 'No settings found'}</h2><p>{fr ? 'Essayez un autre mot-clé, par exemple « taxes », « assurance » ou « dossard ».' : 'Try another keyword, such as “taxes”, “insurance” or “back number”.'}</p><button type="button" className="ghost-button" onClick={() => { setQuery(''); setSelected('all'); }}>{fr ? 'Effacer la recherche' : 'Clear search'}</button></div>}
      {orderedSections}
    </div>
  </SettingsNavigation.Provider>;
}

export function SettingsSection({ id, children, className = '', title, description }: {
  id: SettingsSectionId; children: ReactNode; className?: string; title?: string; description?: ReactNode;
}) {
  const navigation = useContext(SettingsNavigation);
  if (!navigation) throw Error('SettingsSection requires AssociationSettingsLayout');
  const { fr, visibleIds, open, toggle } = navigation;
  const item = sections(fr).find(section => section.id === id)!;
  const isOpen = open.has(id);
  const [visited, setVisited] = useState(false);
  const bodyId = useId();
  useEffect(() => { if (isOpen) setVisited(true); }, [isOpen]);
  const Icon = item.icon;
  const hidden = !visibleIds.has(id);
  return <section hidden={hidden} style={{ order: sections(fr).findIndex(section => section.id === id) }} className={`panel span-2 settings-section ${className} ${isOpen ? 'is-open' : 'is-collapsed'}`} data-settings-card={id}>
    <h2 className="settings-card-heading"><button type="button" aria-expanded={isOpen} aria-controls={bodyId} aria-label={`${isOpen ? (fr ? 'Replier' : 'Collapse') : (fr ? 'Ouvrir' : 'Open')} ${item.title}`} onClick={() => toggle(id)}>
      <span className="settings-card-icon"><Icon size={23} aria-hidden="true" /></span><span className="settings-card-copy"><span className="settings-card-category">{categoryLabels[item.category][fr ? 0 : 1]}</span><strong>{title ?? item.title}</strong><span className="settings-card-description">{description ?? item.description}</span></span>
      <span className="settings-card-action">{isOpen ? (fr ? 'Replier' : 'Collapse') : (fr ? 'Ouvrir' : 'Open')}{isOpen ? <ChevronDown size={19} aria-hidden="true" /> : <ChevronRight size={19} aria-hidden="true" />}</span>
    </button></h2>
    <div id={bodyId} hidden={!isOpen} className="settings-section-body">{isOpen || visited ? children : null}</div>
  </section>;
}
