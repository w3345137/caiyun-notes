import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, FileText, Database, Settings,
  Search, Trash2, Shield, ShieldCheck, RefreshCw,
  ChevronRight, BarChart3, Clock, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react';
import {
  getAllUsers, getDbStats, getAllNotes, getActivityStats,
  deleteUser, deleteAnyNote, type UserRecord, type NoteRecord, type DbStats, type ActivityStat,
  isAdminEmail
} from '../lib/adminApi';
import { getCurrentUser } from '../lib/auth';
import { toast } from 'react-hot-toast';

interface AdminConsoleProps {
  onClose: () => void;
}

type Tab = 'dashboard' | 'users' | 'notes' | 'settings';

export function AdminConsole({ onClose }: AdminConsoleProps) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser);
  }, []);

  const isMe = (u: UserRecord) => u.email === currentUser?.email;
  const isSelf = (u: UserRecord) => isMe(u);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: '仪表盘', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'users', label: '用户管理', icon: <Users className="w-4 h-4" /> },
    { id: 'notes', label: '笔记浏览', icon: <FileText className="w-4 h-4" /> },
    { id: 'settings', label: '系统设置', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">管理控制台</h2>
              <p className="text-gray-400 text-xs">
                {currentUser?.email || '加载中...'}
                {currentUser && isAdminEmail(currentUser.email) && (
                  <span className="ml-2 text-blue-400">✓ 管理员</span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-500 text-blue-600 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'users' && <UsersTab currentUserEmail={currentUser?.email} />}
          {tab === 'notes' && <NotesTab />}
          {tab === 'settings' && <SettingsTab currentUserEmail={currentUser?.email} />}
        </div>
      </div>
    </div>
  );
}

// ========== 仪表盘 ==========
function DashboardTab() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [activity, setActivity] = useState<ActivityStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDbStats(), getActivityStats(14)]).then(([s, a]) => {
      setStats(s);
      setActivity(a);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;
  if (!stats) return <ErrorState msg="加载失败" />;

  const maxNotes = Math.max(...activity.map(a => a.new_notes), 1);

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-blue-500" />}
          label="总用户数"
          value={stats.total_users}
          color="blue"
        />
        <StatCard
          icon={<FileText className="w-5 h-5 text-green-500" />}
          label="总笔记数"
          value={stats.total_notes}
          color="green"
        />
        <StatCard
          icon={<BarChart3 className="w-5 h-5 text-purple-500" />}
          label="活跃笔记本"
          value={stats.top_users.length}
          color="purple"
        />
        <StatCard
          icon={<Database className="w-5 h-5 text-orange-500" />}
          label="存储状态"
          value="正常"
          color="orange"
        />
      </div>

      {/* 活跃用户排行 */}
      {stats.top_users.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-500" />
            笔记数排行
          </h3>
          <div className="space-y-2">
            {stats.top_users.map((u, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-gray-700 truncate flex-1">{u.email}</span>
                <span className="text-gray-400 text-xs">{u.note_count} 篇</span>
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${(u.note_count / (stats.top_users[0]?.note_count || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 近14天活跃趋势 */}
      {activity.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            近14天活跃趋势
          </h3>
          <div className="flex items-end gap-1 h-24">
            {activity.map((a, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5">
                  <div
                    className="w-full bg-blue-400 rounded-t-sm transition-all"
                    style={{ height: `${Math.max(2, (a.new_notes / maxNotes) * 80)}px` }}
                    title={`笔记: ${a.new_notes}`}
                  />
                  <div
                    className="w-full bg-green-400 rounded-t-sm transition-all"
                    style={{ height: `${Math.max(1, (a.new_users / Math.max(...activity.map(x => x.new_users), 1)) * 40)}px` }}
                    title={`用户: ${a.new_users}`}
                  />
                </div>
                <span className="text-[9px] text-gray-400">{a.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-sm inline-block" />新笔记</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-sm inline-block" />新用户</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 用户管理 ==========
function UsersTab({ currentUserEmail }: { currentUserEmail?: string }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getAllUsers().then(data => { setUsers(data); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (user: UserRecord) => {
    if (user.email === currentUserEmail) {
      toast.error('不能删除自己');
      return;
    }
    if (!confirm(`确定删除账号 ${user.email}？\n这将同时删除该用户的所有笔记，此操作不可恢复。`)) return;
    setDeleting(user.id);
    try {
      await deleteUser(user.id);
      toast.success('已删除');
      load();
    } catch (e: any) {
      toast.error(e.message || '删除失败');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('zh-CN');

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索用户邮箱或昵称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">用户</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">昵称</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">笔记数</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">注册时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">角色</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无用户</td></tr>
            )}
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[180px] truncate">{u.email}</td>
                <td className="px-4 py-3 text-gray-700">{u.display_name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium">{u.note_count}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  {u.is_admin ? (
                    <span className="flex items-center gap-1 text-purple-600 text-xs font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" /> 管理员
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">普通用户</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.email !== currentUserEmail ? (
                    <button
                      onClick={() => handleDelete(u)}
                      disabled={deleting === u.id}
                      className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="删除用户"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="text-gray-300 text-xs px-2 py-1">当前账号</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          共 {filtered.length} 个用户
        </div>
      </div>
    </div>
  );
}

// ========== 笔记浏览 ==========
function NotesTab() {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getAllNotes().then(data => { setNotes(data); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const filtered = notes.filter(n => {
    const matchSearch = n.title.toLowerCase().includes(search.toLowerCase()) ||
                        n.owner_email.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || n.type === filterType;
    return matchSearch && matchType;
  });

  const handleDelete = async (note: NoteRecord) => {
    if (!confirm(`确定删除「${note.title}」？`)) return;
    setDeleting(note.id);
    try {
      await deleteAnyNote(note.id);
      toast.success('已删除');
      load();
    } catch (e: any) {
      toast.error(e.message || '删除失败');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('zh-CN');

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索笔记标题或用户..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">全部类型</option>
          <option value="notebook">笔记本</option>
          <option value="section">分区</option>
          <option value="page">页面</option>
        </select>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">标题</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">类型</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">所有者</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">更新时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">字数</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无笔记</td></tr>
            )}
            {filtered.map(n => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800 max-w-[200px] truncate">{n.title}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    n.type === 'notebook' ? 'bg-indigo-50 text-indigo-600' :
                    n.type === 'section' ? 'bg-amber-50 text-amber-600' :
                    'bg-green-50 text-green-600'
                  }`}>
                    {n.type === 'notebook' ? '笔记本' : n.type === 'section' ? '分区' : '页面'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs font-mono max-w-[150px] truncate">{n.owner_email}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(n.updated_at)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{n.word_count}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(n)}
                    disabled={deleting === n.id}
                    className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="删除笔记"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          共 {filtered.length} 条笔记
        </div>
      </div>
    </div>
  );
}

// ========== 系统设置 ==========
function SettingsTab({ currentUserEmail }: { currentUserEmail?: string }) {
  const [isAdmin, setIsAdmin] = useState(isAdminEmail(currentUserEmail));
  const [info, setInfo] = useState('');

  return (
    <div className="space-y-6 max-w-xl">
      {/* 管理员信息 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-purple-500" />
          管理员身份
        </h3>
        {isAdmin ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">{currentUserEmail} 拥有完整管理员权限</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-500">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">当前账号不是管理员，请联系超级管理员</span>
          </div>
        )}
      </div>

      {/* 关于 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-800 mb-3">关于云笔记管理后台</h3>
        <div className="text-sm text-gray-500 space-y-1">
          <p>版本：1.0.0</p>
          <p>数据库：本地 PostgreSQL</p>
          <p>后端：Node.js v2.1 (本地)</p>
        </div>
      </div>

      {/* 安全提示 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            <p className="font-medium mb-1">安全提示</p>
            <p>管理员账号拥有最高权限，请勿将账号信息泄露给他人。删除用户会级联删除其所有笔记，此操作不可恢复。</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 通用组件 ==========
function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    purple: 'bg-purple-50 border-purple-100',
    orange: 'bg-orange-50 border-orange-100',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-red-500 gap-2">
      <AlertTriangle className="w-4 h-4" />
      <span>{msg}</span>
    </div>
  );
}
