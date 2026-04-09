import { supabase } from './supabase';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  invited_by: string | null;
  joined_at: string;
  user_email?: string;
  user_display_name?: string;
  user_profiles?: {
    email: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

// 创建团队
export async function createTeam(name: string, description?: string, ownerId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const owner = ownerId || user?.id;

  if (!owner) throw new Error('未登录');

  const { data, error } = await supabase
    .from('teams')
    .insert({ name, description, owner_id: owner })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 获取用户所属团队列表
export async function getUserTeams() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .or(`owner_id.eq.${user.id},id.in.(select team_id from team_members where user_id = '${user.id}')`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 获取团队成员列表
export async function getTeamMembers(teamId: string) {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      *,
      user_profiles!team_members_user_id_fkey (
        email,
        display_name,
        avatar_url
      )
    `)
    .eq('team_id', teamId);

  if (error) throw error;
  return data || [];
}

// 添加团队成员
export async function addTeamMember(teamId: string, userId: string, role: string = 'member') {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('team_members')
    .insert({
      team_id: teamId,
      user_id: userId,
      role,
      invited_by: user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 移除团队成员
export async function removeTeamMember(teamId: string, userId: string) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);

  if (error) throw error;
}

// 更新团队信息
export async function updateTeam(teamId: string, updates: { name?: string; description?: string }) {
  const { data, error } = await supabase
    .from('teams')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', teamId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 删除团队
export async function deleteTeam(teamId: string) {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId);

  if (error) throw error;
}

// 离开团队
export async function leaveTeam(teamId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', user.id);

  if (error) throw error;
}

// 检查用户是否为团队所有者
export async function isTeamOwner(teamId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('teams')
    .select('owner_id')
    .eq('id', teamId)
    .single();

  return data?.owner_id === user.id;
}
