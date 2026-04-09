import { useState, useEffect } from 'react';
import { X, Users, Plus, Settings, Trash2, UserPlus, Crown, Shield, User, Eye, LogOut } from 'lucide-react';
import { getUserTeams, createTeam, deleteTeam, leaveTeam, getTeamMembers, addTeamMember, Team, TeamMember } from '../lib/teams';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface TeamManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onTeamSelect?: (teamId: string) => void;
}

export function TeamManager({ isOpen, onClose, onTeamSelect }: TeamManagerProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');

  useEffect(() => {
    if (isOpen) {
      loadTeams();
    }
  }, [isOpen]);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const data = await getUserTeams();
      setTeams(data);
    } catch (error) {
      console.error('加载团队失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (team: Team) => {
    try {
      const data = await getTeamMembers(team.id);
      setMembers(data);
    } catch (error) {
      console.error('加载成员失败:', error);
    }
  };

  const handleCreateTeam = async (name: string, description: string) => {
    try {
      await createTeam(name, description);
      toast.success('团队创建成功');
      setShowCreateModal(false);
      loadTeams();
    } catch (error: any) {
      toast.error(error.message || '创建失败');
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm('确定要删除这个团队吗？所有笔记将被永久删除。')) return;

    try {
      await deleteTeam(teamId);
      toast.success('团队已删除');
      setSelectedTeam(null);
      loadTeams();
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  const handleLeaveTeam = async (teamId: string) => {
    if (!confirm('确定要离开这个团队吗？')) return;

    try {
      await leaveTeam(teamId);
      toast.success('已离开团队');
      setSelectedTeam(null);
      loadTeams();
    } catch (error: any) {
      toast.error(error.message || '操作失败');
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !newMemberEmail) return;

    try {
      // 通过邮箱查找用户
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', newMemberEmail)
        .single();

      if (!profileData) {
        toast.error('未找到该用户');
        return;
      }

      await addTeamMember(selectedTeam.id, profileData.id, newMemberRole);
      toast.success('成员已添加');
      setNewMemberEmail('');
      loadMembers(selectedTeam);
    } catch (error: any) {
      toast.error(error.message || '添加失败');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-6 py-5 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">团队管理</h2>
              <p className="text-purple-100 text-sm">管理您的团队和成员</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Team List */}
          <div className="w-64 border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors mb-4"
            >
              <Plus className="w-4 h-4" />
              创建团队
            </button>

            {loading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : teams.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无团队</p>
                <p className="text-sm">创建一个开始协作</p>
              </div>
            ) : (
              <div className="space-y-2">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => {
                      setSelectedTeam(team);
                      loadMembers(team);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      selectedTeam?.id === team.id
                        ? 'bg-purple-100 text-purple-900'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="font-medium truncate">{team.name}</div>
                    <div className="text-xs text-gray-500 truncate">{team.description || '暂无描述'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Team Details */}
          <div className="flex-1 p-6 overflow-y-auto">
            {selectedTeam ? (
              <div>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800">{selectedTeam.name}</h3>
                    <p className="text-gray-500 mt-1">{selectedTeam.description || '暂无描述'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLeaveTeam(selectedTeam.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      <LogOut className="w-4 h-4" />
                      离开
                    </button>
                    <button
                      onClick={() => handleDeleteTeam(selectedTeam.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除
                    </button>
                  </div>
                </div>

                {/* Add Member */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <h4 className="font-medium text-gray-700 mb-3">添加成员</h4>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      placeholder="输入成员邮箱"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="member">成员</option>
                      <option value="admin">管理员</option>
                      <option value="viewer">查看者</option>
                    </select>
                    <button
                      onClick={handleAddMember}
                      className="flex items-center gap-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                    >
                      <UserPlus className="w-4 h-4" />
                      添加
                    </button>
                  </div>
                </div>

                {/* Members List */}
                <h4 className="font-medium text-gray-700 mb-3">团队成员 ({members.length})</h4>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          {member.user_profiles?.display_name?.[0]?.toUpperCase() || member.user_profiles?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">
                            {member.user_profiles?.display_name || '未命名用户'}
                          </div>
                          <div className="text-sm text-gray-500">{member.user_profiles?.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          member.role === 'owner' ? 'bg-yellow-100 text-yellow-700' :
                          member.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                          member.role === 'viewer' ? 'bg-gray-100 text-gray-600' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {member.role === 'owner' && <Crown className="w-3 h-3 inline mr-1" />}
                          {member.role === 'admin' && <Shield className="w-3 h-3 inline mr-1" />}
                          {member.role === 'member' && <User className="w-3 h-3 inline mr-1" />}
                          {member.role === 'viewer' && <Eye className="w-3 h-3 inline mr-1" />}
                          {member.role === 'owner' ? '所有者' :
                           member.role === 'admin' ? '管理员' :
                           member.role === 'viewer' ? '查看者' : '成员'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>选择一个团队查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <CreateTeamModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTeam}
        />
      )}
    </div>
  );
}

interface CreateTeamModalProps {
  onClose: () => void;
  onSubmit: (name: string, description: string) => void;
}

function CreateTeamModal({ onClose, onSubmit }: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(name, description);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">创建团队</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">团队名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入团队名称"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">团队描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述团队用途"
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建团队'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
