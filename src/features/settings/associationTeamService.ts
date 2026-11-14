import { requireSupabase } from '../../lib/supabase';
import type { OrganizationMember } from '../../types/domain';

export type AssociationRole = OrganizationMember['role'];
export type TeamMember = { id: string; profile_id: string; display_name: string; email: string; role: AssociationRole };

export async function loadAssociationTeam(organizationId: string): Promise<TeamMember[]> {
  const { data, error } = await requireSupabase().rpc('association_team', { p_org: organizationId });
  if (error) throw error;
  return data ?? [];
}
export async function saveAssociationRole(organizationId: string, email: string, role: AssociationRole, previousRole: AssociationRole | null) {
  const { error } = await requireSupabase().rpc('set_association_team_role', { p_org: organizationId, p_email: email.trim(), p_role: role, p_expected_role: previousRole });
  if (error) throw error;
}
export async function removeAssociationMember(organizationId: string, member: TeamMember) {
  const { error } = await requireSupabase().rpc('remove_association_team_member', { p_org: organizationId, p_member: member.id, p_expected_role: member.role });
  if (error) throw error;
}
