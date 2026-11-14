import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { UsersRound } from 'lucide-react';
import type { Locale } from '../../lib/i18n';
import { loadAssociationTeam, removeAssociationMember, saveAssociationRole } from './associationTeamService';
import type { AssociationRole, TeamMember } from './associationTeamService';
import './associationTeam.css';

export function AssociationTeamSettings({ organizationId, locale, canAdminister, currentProfileId, onRefresh }: {
  organizationId: string; locale: Locale; canAdminister: boolean; currentProfileId: string; onRefresh: () => void;
}) {
  const fr = locale === 'fr';
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssociationRole>('secretary');
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const roles: { value: AssociationRole; label: string; detail: string }[] = [
    { value: 'admin', label: fr ? 'Administrateur' : 'Administrator', detail: fr ? 'Gestion de HSP et ShowScore, paramètres et accès de l’équipe.' : 'Manage HSP and ShowScore, settings and team access.' },
    { value: 'secretary', label: fr ? 'Secrétaire' : 'Secretary', detail: fr ? 'Gestion des concours, inscriptions et comptes dans HSP et ShowScore.' : 'Manage shows, entries and accounts in HSP and ShowScore.' },
    { value: 'scribe', label: 'Scribe', detail: fr ? 'Saisie des notes dans ShowScore. Aucun accès gestionnaire dans HSP.' : 'Scoring in ShowScore. No management access in HSP.' },
    { value: 'announcer', label: fr ? 'Annonceur' : 'Announcer', detail: fr ? 'Interface annonceur dans ShowScore. Aucun accès gestionnaire dans HSP.' : 'Announcer interface in ShowScore. No management access in HSP.' },
    { value: 'user', label: fr ? 'Utilisateur' : 'User', detail: fr ? 'Accès participant, sans accès gestionnaire.' : 'Participant access, without management access.' },
  ];
  function message(cause: unknown) {
    const raw = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : String(cause);
    if (raw.includes('LAST_ASSOCIATION_ADMIN')) return fr ? 'Ajoutez un autre administrateur avant de retirer ou modifier le dernier administrateur.' : 'Add another administrator before removing or changing the last administrator.';
    if (raw.includes('ASSOCIATION_ACCOUNT_NOT_FOUND')) return fr ? 'Aucun compte trouvé pour ce courriel. La personne doit d’abord créer son compte HSP ou ShowScore.' : 'No account found for this email. This person must first create their HSP or ShowScore account.';
    if (raw.includes('ASSOCIATION_ROLE_CHANGED')) return fr ? 'Les accès ont changé depuis le chargement. Actualisez la liste avant de réessayer.' : 'Access changed since this list was loaded. Refresh the list before trying again.';
    if (raw.includes('ASSOCIATION_ADMIN_REQUIRED')) return fr ? 'Seul un administrateur peut gérer les accès de cette association.' : 'Only an administrator can manage access for this association.';
    return fr ? 'Impossible de mettre à jour les accès. Réessayez.' : 'Unable to update access. Please try again.';
  }
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    if (!canAdminister) { setLoading(false); return; }
    void loadAssociationTeam(organizationId).then(data => { if (live) setMembers(data); })
      .catch(cause => { if (live) setError(message(cause)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [organizationId, canAdminister, locale]);
  async function mutate(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setEditing(null); setRemoving(null); setEmail(''); setRole('secretary');
      setNotice(fr ? 'Les accès ont été mis à jour pour HSP et ShowScore.' : 'Access updated for HSP and ShowScore.');
      // Refresh the signed-in user's permissions as well as the visible list.
      onRefresh();
      try { setMembers(await loadAssociationTeam(organizationId)); } catch (cause) {
        // Self-demotion legitimately removes access; other refresh failures stay visible.
        const raw = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : String(cause);
        if (!raw.includes('ASSOCIATION_ADMIN_REQUIRED')) setError(message(cause));
      }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutate(() => saveAssociationRole(organizationId, email, role, editing?.role ?? null));
  }
  const label = (value: AssociationRole) => roles.find(item => item.value === value)?.label ?? value;
  const lastAdmin = (member: TeamMember) => member.role === 'admin' && members.filter(item => item.role === 'admin').length === 1;
  return <section className="panel association-team" aria-labelledby="association-team-title">
    <div className="panel-header"><div><h2 id="association-team-title"><UsersRound size={22} aria-hidden="true" /> {fr ? 'Équipe et rôles' : 'Team and roles'}</h2>
      <p>{fr ? 'Les mêmes rôles pour votre association dans HSP et ShowScore.' : 'Shared association roles across HSP and ShowScore.'}</p></div></div>
    {!canAdminister ? <p>{fr ? 'Un administrateur de l’association peut ajouter des personnes et gérer leurs rôles ici.' : 'An association administrator can add people and manage their roles here.'}</p> : <>
      <div className="team-role-guide">{roles.filter(item => item.value !== 'user').map(item => <div key={item.value}><strong>{item.label}</strong><p>{item.detail}</p></div>)}</div>
      {error && <p role="alert" className="form-error">{error} <button type="button" disabled={busy} onClick={() => { setError(''); setLoading(true); void loadAssociationTeam(organizationId).then(setMembers).catch(cause => setError(message(cause))).finally(() => setLoading(false)); }}>{fr ? 'Actualiser' : 'Refresh'}</button></p>}
      <p role="status">{notice}</p>
      {loading ? <p>{fr ? 'Chargement de l’équipe…' : 'Loading team…'}</p> : <ul className="team-members">{members.map(member => <li key={member.id}>
        <div><strong>{member.display_name}{member.profile_id === currentProfileId ? (fr ? ' (vous)' : ' (you)') : ''}</strong><span>{member.email}</span></div>
        <span className="team-role-badge">{label(member.role)}</span>
        <div className="team-member-actions"><button type="button" disabled={busy} aria-label={`${fr ? 'Modifier le rôle de' : 'Edit role for'} ${member.email}`} onClick={() => { setEditing(member); setRemoving(null); setEmail(member.email); setRole(member.role); setError(''); }}>{fr ? 'Modifier' : 'Edit'}</button>
          <button type="button" disabled={busy || lastAdmin(member)} title={lastAdmin(member) ? (fr ? 'Dernier administrateur' : 'Last administrator') : undefined} aria-label={`${fr ? 'Retirer l’accès de' : 'Remove access for'} ${member.email}`} onClick={() => { setRemoving(member); setError(''); }}>{fr ? 'Retirer l’accès' : 'Remove access'}</button></div>
      </li>)}</ul>}
      {removing && <div className="team-confirm" role="group" aria-label={fr ? 'Confirmer le retrait' : 'Confirm removal'}><p>{fr ? `Retirer l’accès de ${removing.email} à cette association dans HSP et ShowScore ? Son compte personnel sera conservé.` : `Remove ${removing.email}’s association access in HSP and ShowScore? Their personal account will be kept.`}</p>
        <button type="button" disabled={busy} onClick={() => void mutate(() => removeAssociationMember(organizationId, removing))}>{fr ? 'Confirmer le retrait' : 'Confirm removal'}</button> <button type="button" disabled={busy} onClick={() => setRemoving(null)}>{fr ? 'Annuler' : 'Cancel'}</button></div>}
      <form onSubmit={submit} className="team-access-form"><h3>{editing ? (fr ? 'Modifier le rôle' : 'Edit role') : (fr ? 'Ajouter une personne' : 'Add a person')}</h3>
        <p>{fr ? 'Utilisez le courriel de son compte HSP ou ShowScore existant. Un seul rôle est attribué par association.' : 'Use the email of their existing HSP or ShowScore account. Each person has one role per association.'}</p>
        <div className="team-access-fields"><label>{fr ? 'Courriel du compte' : 'Account email'}<input type="email" required value={email} disabled={busy || !!editing} onChange={event => setEmail(event.target.value)} autoComplete="off" /></label>
          <label>{fr ? 'Rôle dans l’association' : 'Association role'}<select value={role} disabled={busy} onChange={event => setRole(event.target.value as AssociationRole)}>{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <button className="primary-button" disabled={busy || loading} type="submit">{busy ? (fr ? 'Enregistrement…' : 'Saving…') : editing ? (fr ? 'Enregistrer le rôle' : 'Save role') : (fr ? 'Ajouter à l’équipe' : 'Add to team')}</button>
          {editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setEmail(''); setRole('secretary'); }}>{fr ? 'Annuler' : 'Cancel'}</button>}</div>
        <p className="team-role-description">{roles.find(item => item.value === role)?.detail}</p>
      </form>
    </>}
  </section>;
}
