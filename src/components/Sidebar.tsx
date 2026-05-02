import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, BookOpen, ChevronDown, ChevronRight, Folder, MoreHorizontal, Trash2, Edit2, Plus, User, Settings, Download, Info, Sun, Flower, Glasses, Star, Heart, Zap, Moon, Cloud, Music, Coffee, Book, Camera, Users, LogOut, Share2, X, Tag, Bell, Briefcase, Calendar, Flag, Globe, Home, Map, MessageSquare, Phone, ShoppingCart, Target, Trophy, Umbrella, Video, Volume2, Wallet, Award, BookMarked, BriefcaseBusiness, Building, Car, Clock, Code, Compass, DollarSign, Droplet, Feather, FileText, FolderOpen, Gift, Globe2, Hammer, Key, Lightbulb, Link, Lock, Mail, MapPin, Monitor, Notebook, Package, Palette, Pencil, PieChart, Plane, Printer, Puzzle, Rocket, Scissors, Shield, Smile, Smartphone, Snowflake, Stamp, SunMoon, Tent, Timer, TreePine, Truck, Tv, Wrench, FileCode, GitBranch, Send, CheckCircle, Bug, GripVertical, Upload, Copy, Eye, RefreshCw, HelpCircle, PanelLeftClose, PanelLeft, History } from 'lucide-react';
import { useNoteStore } from '../store/noteStore';
import { useAuth } from './AuthProvider';
import { signOut } from '../lib/auth';
import EmailAccountModal from './EmailAccountModal';
import { isAdminEmail } from '../lib/adminApi';
import { AdminConsole } from './AdminConsole';
import { ExportModal } from './ExportModal';
import { Note } from '../types';
import toast from 'react-hot-toast';
import { shareNotebook, unshareNotebook, getNotebookShares, getSharedNotebookIds, getUpdateLogs, updateUpdateLog, addUpdateLog, deleteUpdateLog } from '../lib/initDatabase';
import { getReceivedInvites, getMyInvites, getPendingInviteCount, createInvite, respondToInvite, cancelInvite, NotebookInvite } from '../lib/inviteService';
import { getUpdateLogsCache, setUpdateLogsCache } from '../store/noteStore';
import { NotebookSkeleton, SectionSkeleton, PageSkeleton } from './SkeletonItems';
import { ConfirmModal } from './ConfirmModal';
import { Cloud, HardDrive, Bot } from 'lucide-react';
import { getAttachments, getOneDriveAuthUrl, uploadToOneDrive, deleteAttachment, downloadFromOneDrive, formatFileSize, getFileIconType, checkOneDriveBinding, checkNotebooksStorageBatch, Attachment } from '../lib/onedriveService';
import { checkLLMConfig, saveLLMConfig, deleteLLMConfig, testLLMConnection } from '../lib/llmService';
import { SectionsDndArea, SectionWrapper, PageWrapper, PagesDndArea, getPageIcon } from './DndComponents';
import { BackupConfigModal } from './BackupConfigModal';
import { BackupHistoryModal } from './BackupHistoryModal';
import { getBackupConfig } from '../lib/localBackup';
import { canUserEditPage } from '../lib/lockService';

import { SmartDropdown } from './SmartDropdown';
import { SmartIconPicker, type IconOption } from './SmartIconPicker';

// OneNote风格的彩虹色书签颜色
const NOTEBOOK_COLORS = [
  '#e54d4d', // 红色
  '#9c27b0', // 紫色
  '#f7c948', // 黄色
  '#4a90e2', // 蓝色
  '#57b894', // 绿色
  '#ec407a', // 玫红
];

// 页面图标选项 - 统一风格的SVG图标
const PAGE_ICONS = [
  // 基础类
  { id: 'doc', name: '文档', icon: FileText, color: '#4a90e2' },
  { id: 'book', name: '书籍', icon: Book, color: '#8b5cf6' },
  { id: 'notebook', name: '笔记本', icon: Notebook, color: '#6366f1' },
  { id: 'bookmark', name: '书签', icon: BookMarked, color: '#ec407a' },
  { id: 'folder', name: '文件夹', icon: FolderOpen, color: '#f59e0b' },

  // 心情类
  { id: 'star', name: '星标', icon: Star, color: '#f7c948' },
  { id: 'heart', name: '喜欢', icon: Heart, color: '#e54d4d' },
  { id: 'smile', name: '开心', icon: Smile, color: '#10b981' },
  { id: 'flag', name: '标记', icon: Flag, color: '#ef4444' },
  { id: 'award', name: '奖杯', icon: Award, color: '#f59e0b' },

  // 自然类
  { id: 'sun', name: '太阳', icon: Sun, color: '#f59e0b' },
  { id: 'moon', name: '月亮', icon: Moon, color: '#6366f1' },
  { id: 'flower', name: '花朵', icon: Flower, color: '#ec407a' },
  { id: 'glasses', name: '眼镜', icon: Glasses, color: '#6b7280' },
  { id: 'cloud', name: '云朵', icon: Cloud, color: '#60a5fa' },
  { id: 'tree', name: '树木', icon: TreePine, color: '#22c55e' },
  { id: 'globe', name: '地球', icon: Globe, color: '#3b82f6' },
  { id: 'map', name: '地图', icon: Map, color: '#84cc16' },

  // 工作类
  { id: 'briefcase', name: '工作', icon: Briefcase, color: '#78716c' },
  { id: 'target', name: '目标', icon: Target, color: '#ef4444' },
  { id: 'calendar', name: '日程', icon: Calendar, color: '#f97316' },
  { id: 'clock', name: '时间', icon: Clock, color: '#8b5cf6' },
  { id: 'trophy', name: '成就', icon: Trophy, color: '#eab308' },
  { id: 'rocket', name: '火箭', icon: Rocket, color: '#f43f5e' },

  // 生活类
  { id: 'music', name: '音乐', icon: Music, color: '#10b981' },
  { id: 'video', name: '视频', icon: Video, color: '#ec4899' },
  { id: 'camera', name: '相机', icon: Camera, color: '#059669' },
  { id: 'coffee', name: '咖啡', icon: Coffee, color: '#92400e' },
  { id: 'shopping', name: '购物', icon: ShoppingCart, color: '#f43f5e' },
  { id: 'gift', name: '礼物', icon: Gift, color: '#ec407a' },
  { id: 'wallet', name: '钱包', icon: Wallet, color: '#78716c' },
  { id: 'home', name: '家居', icon: Home, color: '#84cc16' },
  { id: 'bell', name: '提醒', icon: Bell, color: '#f59e0b' },
  { id: 'message', name: '消息', icon: MessageSquare, color: '#3b82f6' },
];

const getNotebookColor = (order: number): string => {
  return NOTEBOOK_COLORS[order % NOTEBOOK_COLORS.length];
};

// 获取页面图标组件
const getPageIcon = (iconId: string) => {
  const iconData = PAGE_ICONS.find(i => i.id === iconId);
  return iconData || PAGE_ICONS[0];
};

// 可编辑标题组件
const EditableTitle: React.FC<{
  title: string;
  onSave: (newTitle: string) => void;
  className?: string;
}> = ({ title, onSave, className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) {
      onSave(trimmed);
    } else {
      setValue(title);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(title);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`flex-1 w-full min-w-0 px-1 py-0.5 text-sm border border-blue-400 rounded outline-none focus:ring-1 focus:ring-blue-300 ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex-1 truncate cursor-pointer hover:bg-gray-200 px-1 py-0.5 rounded text-sm ${className}`}
      onDoubleClick={() => setIsEditing(true)}
      title="双击编辑"
    >
      {title}
    </span>
  );
};

// 分区项组件 - 独立的 Hook 容器
const SectionItem: React.FC<{
  section: Note;
  notebook: Note;
  isActive: boolean;
  onClick: () => void;
  onTitleChange: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onIconChange: (id: string, iconId: string) => void;
}> = ({ section, notebook, isActive, onClick, onTitleChange, onDelete, onIconChange }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 获取分区图标
  const sectionIconData = getPageIcon(section.icon || 'folder');
  const SectionIcon = sectionIconData.icon;

  // 点击外部关闭图标选择器
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowIconPicker(false);
        setShowMenu(false);
      }
    };
    if (showMenu || showIconPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, showIconPicker]);

  return (
    <div
      className={`flex items-center px-3 py-1.5 pl-6 cursor-pointer transition-all group ${
        isActive
          ? 'bg-blue-100 shadow-sm'
          : 'hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      <SectionIcon className="w-4 h-4 mr-2 flex-shrink-0 cursor-grab active:cursor-grabbing" style={{ color: sectionIconData.color }} />
      <EditableTitle
        title={section.title}
        onSave={(newTitle) => onTitleChange(section.id, newTitle)}
      />
      <div className="relative ml-auto flex items-center gap-1" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-500" />
        </button>
        {showMenu && !showIconPicker && (
          <SmartDropdown isOpen={true} onClose={() => setShowMenu(false)} triggerRef={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowIconPicker(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings className="w-4 h-4" />
              更改图标
            </button>
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(section.id); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            </div>
          </SmartDropdown>
        )}
        {showIconPicker && (
          <SmartIconPicker
            isOpen={true}
            onClose={() => { setShowIconPicker(false); setShowMenu(false); }}
            triggerRef={menuRef}
            currentIcon={section.icon || 'folder'}
            onSelectIcon={(iconId) => { onIconChange(section.id, iconId); setShowIconPicker(false); setShowMenu(false); }}
            icons={PAGE_ICONS}
          />
        )}
      </div>
    </div>
  );
};

// 共享标识SVG组件 - 线条式风格，明快简洁
const SharedIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// 笔记本项组件
const NotebookItem: React.FC<{
  notebook: Note;
  sections: Note[];
  isExpanded: boolean;
  isActive: boolean;
  activeSection: string | null;
  onToggle: () => void;
  onSectionClick: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onAddSection: (notebookId: string) => void;
  onShare: (notebook: Note) => void;
  onIconChange: (id: string, iconId: string) => void;
  onCopyId: (notebook: Note) => void;
  onViewInvites: (notebook: Note) => void;
  isShared?: boolean;
  isOwner?: boolean;
  hasStorage?: boolean;
}> = ({ notebook, sections, isExpanded, isActive, activeSection, onToggle, onSectionClick, onTitleChange, onDelete, onAddSection, onShare, onIconChange, onCopyId, onViewInvites, isShared = false, isOwner = false, hasStorage = false }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [dragOverSectionIndex, setDragOverSectionIndexLocal] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  return (
    <div>
      {/* 笔记本项 - 使用页面样式（圆角+阴影，一直显示） */}
      <div
        className={`flex items-center px-3 py-1.5 mx-2 my-0.5 rounded-lg cursor-pointer transition-all group shadow-sm border border-gray-200 bg-white ${
          isActive ? 'bg-blue-100' : 'hover:bg-gray-50'
        }`}
      >
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-200 rounded"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </button>

        <EditableTitle
          title={notebook.title}
          onSave={(newTitle) => onTitleChange(notebook.id, newTitle)}
        />
        {/* 共享标识 */}
        {isShared && (
          <div className="ml-0.75 text-teal-500" title="多人共享">
            <SharedIcon />
          </div>
        )}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-opacity"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-500" />
          </button>
          {showMenu && (
            <SmartDropdown isOpen={true} onClose={() => setShowMenu(false)} triggerRef={menuRef}>
              <button
                onClick={() => { onShare(notebook); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50"
              >
                <Share2 className="w-4 h-4" />
                分享设置
              </button>
              <button
                onClick={() => { onCopyId(notebook); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Copy className="w-4 h-4" />
                复制笔记本ID
              </button>
              {isOwner && (
                <button
                  onClick={() => { onViewInvites(notebook); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50"
                >
                  <Bell className="w-4 h-4" />
                  查看申请
                </button>
              )}
              <button
                onClick={() => { onAddSection(notebook.id); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Folder className="w-4 h-4 text-blue-500" />
                新建分区
              </button>
              {hasStorage && (
                <div className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-500 cursor-default">
                  <HardDrive className="w-4 h-4" />
                  已绑定储存空间
                </div>
              )}
              <button
                onClick={() => { onDelete(notebook.id); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            </SmartDropdown>
          )}
        </div>
      </div>

      {/* 分区列表 - 使用 dnd-kit */}
      {isExpanded && (
          <SectionsDndArea
            sectionIds={sections.sort((a, b) => a.order - b.order).map(s => s.id)}
            onReorder={(newSectionIds) => {
              useNoteStore.getState().reorderSections(notebook.id, newSectionIds);
            }}
          >
            {sections.sort((a, b) => a.order - b.order).map((section) => (
              <SectionWrapper key={section.id} id={section.id}>
                <SectionItem
                  section={section}
                  notebook={notebook}
                  isActive={activeSection === section.id}
                  onClick={() => onSectionClick(section.id)}
                  onTitleChange={onTitleChange}
                  onDelete={onDelete}
                  onIconChange={onIconChange}
                />
              </SectionWrapper>
            ))}
          </SectionsDndArea>
      )}
    </div>
  );
};

// 页面项组件 - 独立的 Hook 容器（支持拖拽排序）
const PageItem: React.FC<{
  page: Note;
  isActive: boolean;
  onClick: () => void;
  onTitleChange: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onIconChange: (id: string, iconId: string) => void;
  onViewHistory?: (pageId: string, pageTitle: string) => void;
}> = ({ page, isActive, onClick, onTitleChange, onDelete, onIconChange, onViewHistory }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const iconData = getPageIcon(page.icon || 'doc');
  const IconComponent = iconData.icon;

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowIconPicker(false);
      }
    };
    if (showMenu || showIconPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, showIconPicker]);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', page.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`flex items-center px-3 py-1.5 pl-4 cursor-grab active:cursor-grabbing transition-all group ${
        isActive
          ? 'bg-blue-100 shadow-sm'
          : 'hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      <IconComponent className="w-4 h-4 mr-2 flex-shrink-0 cursor-grab active:cursor-grabbing" style={{ color: iconData.color }} />
      <EditableTitle
        title={page.title}
        onSave={(newTitle) => onTitleChange(page.id, newTitle)}
      />
      <div className="relative ml-auto flex items-center gap-1" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-500" />
        </button>
        {showMenu && !showIconPicker && (
          <SmartDropdown isOpen={true} onClose={() => setShowMenu(false)} triggerRef={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowIconPicker(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings className="w-4 h-4" />
              更换图标
            </button>
            {getBackupConfig().enabled && onViewHistory && (
              <button
                onClick={(e) => { e.stopPropagation(); onViewHistory(page.id, page.title); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <History className="w-4 h-4" />
                查看历史版本
              </button>
            )}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(page.id); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                删除页面
              </button>
            </div>
          </SmartDropdown>
        )}
        {showIconPicker && (
          <SmartIconPicker
            isOpen={true}
            onClose={() => { setShowIconPicker(false); setShowMenu(false); }}
            triggerRef={menuRef}
            currentIcon={page.icon || 'doc'}
            onSelectIcon={(iconId) => { onIconChange(page.id, iconId); setShowIconPicker(false); setShowMenu(false); }}
            icons={PAGE_ICONS}
          />
        )}
      </div>
    </div>
  );
};

// 更新日志弹窗组件
const UpdateLogsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const userEmail = user?.email || '';
  const isAdmin = userEmail === '767493611@qq.com';

  const [updates, setUpdates] = useState<Array<{id?: string; version: string; date: string; items: string[]}>>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editDate, setEditDate] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newItems, setNewItems] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // 按版本号排序（从新到旧）
  const sortByVersion = (logs: any[]) => {
    return [...logs].sort((a, b) => {
      const parseVersion = (v: string) => {
        const match = v.replace('v', '').split('.').map(Number);
        while (match.length < 3) match.push(0);
        return match;
      };
      const aParts = parseVersion(a.version);
      const bParts = parseVersion(b.version);
      for (let i = 0; i < 3; i++) {
        if (aParts[i] !== bParts[i]) return bParts[i] - aParts[i];
      }
      return 0;
    });
  };

  // 加载更新日志（始终优先从数据库读取，缓存仅作为加速）
  useEffect(() => {
    const loadLogs = async () => {
      // 从数据库加载
      const logs = await getUpdateLogs();
      if (logs.length > 0) {
        setUpdates(sortByVersion(logs));
        setUpdateLogsCache(logs); // 写入缓存
      } else {
        // 数据库为空，写入默认数据
        const defaultLogs = [
          { version: 'v2.0.1', date: '2026-04-09', items: ['本地备份功能：保存时自动备份，每个页面保留10个版本', '备份恢复锁定检查：被锁页面无权限用户无法恢复', 'APP端备份路径：固定存储在应用数据目录', '删除意见反馈入口'] },
          { version: 'v1.9', date: '2026-04-02', items: ['RLS 行级安全启用：所有数据库表启用 RLS 策略', '加载体验优化：去掉转圈动画，直接显示进度条', '加载进度细化：每个步骤显示具体操作，方便调试卡顿问题'] },
          { version: 'v1.8.1.1', date: '2026-03-31', items: ['serviceClient 迁移完成：所有数据库操作改用 Edge Functions', 'initDatabase/sharing/lockService/inviteService/ExportModal/NoteEditor'] },
          { version: 'v1.7.10', date: '2026-03-31', items: ['修复测试环境部署问题'] },
          { version: 'v1.7.10', date: '2026-03-30', items: ['修复 App 端 confirm 对话框不显示问题，统一使用 React Modal', '修复 App 端 OneDrive 授权 window.open 不工作问题，改为 iframe 内嵌授权', '所有删除确认改用 ConfirmModal 组件'] },
          { version: 'v1.7.8', date: '2026-03-30', items: ['错误通知区分数据库连接错误和同步/保存错误，添加 syncError 状态', '页面锁定错误静默跳过，不再闪烁报错', '同步时跳过被锁定的页面，避免阻塞其他笔记同步', '编辑器检测到页面被锁定时主动取消 auto-save'] },
          { version: 'v1.7.7', date: '2026-03-30', items: ['下载 App 按钮启用，点击弹出百度网盘下载弹窗'] },
          { version: 'v1.7.6', date: '2026-03-30', items: ['修复共享笔记本新增页面实时同步bug', '去掉锁定页面编辑区灰色蒙版，只保留工具栏禁用效果'] },
          { version: 'v1.7.5', date: '2026-03-29', items: ['修复测试环境部署后 assets 404 问题：新增 build:test 脚本，正确设置 /test/assets/ 路径', 'OneDrive 绑定和世纪互联支持', '选中颜色调整为浅蓝，顶部 Logo 区域高度调为 47px'] },
          { version: 'v1.8.4', date: '2026-03-29', items: ['修复 OneDrive callback 中文乱码：atob 返回 Latin-1，改用 TextDecoder 还原 UTF-8', '修复 callback 保存账号失败：client_id/client_secret 改为 DROP NOT NULL'] },
          { version: 'v1.8.3', date: '2026-03-29', items: ['OneDrive 世纪互联改用 device code 流程（绕过 redirect_uri 注册问题）', '世纪互联 token 端点改为 login.partner.microsoftonline.cn', '世纪互联 scope 使用完整资源 URI 格式', '简化 Edge Functions：去掉 PKCE', 'callback 支持 device_code 轮询和 auth_code 回调两种方式'] },
          { version: 'v1.8', date: '2026-03-29', items: ['新增 OneDrive 云盘功能：支持上传/下载/删除附件', '附件存储在 OneDrive /彩云笔记/ 目录', '工具栏状态实时跟随光标：加粗/斜体/删除线/列表/标题/字号/字色', '去掉笔记本左侧彩色竖条'] },
          { version: 'v1.7', date: '2026-03-28', items: ['新增行程规划组件：集成高德地图', '支持地点搜索、驾车路线规划、时间计算', '支持拖拽排序、出发时间设置', '一键复制行程到笔记'] },
          { version: 'v1.6.4', date: '2026-03-28', items: ['表格工具栏响应优化：用selectionUpdate事件驱动替代渲染时计算', '工具栏加边框，移除插入按钮右边竖线'] },
          { version: 'v1.6.2', date: '2026-03-28', items: ['页签逻辑彻底简化：去掉onUpdate实时同步，改用onBlur一次性保存', 'TabGroupView添加TextAlign支持，表格单元格内可居中对齐', '点击空白分区时编辑器清空', '锁定按钮仅在共享笔记本的页面显示，非共享笔记本隐藏'] },
          { version: 'v1.6.1', date: '2026-03-28', items: ['重构页签为单层组件', '所有Tab内容存在attrs.contents中，切换时只替换编辑器内容'] },
          { version: 'v1.6', date: '2026-03-28', items: ['页签内容隔离', '每个TabItem独立容器，内容互不干扰'] },
          { version: 'v1.5.4', date: '2026-03-28', items: ['修复页签点击行为', '点击标题切换Tab，点击箭头打开菜单', '修复重命名页签不生效问题', '修复新增页签后内容不显示问题'] },
          { version: 'v1.5.1', date: '2026-03-28', items: ['新增页面锁功能', '可锁定页面防止他人编辑', '所有者可解锁他人锁定的页面', '24小时锁自动释放'] },
          { version: 'v1.5', date: '2026-03-28', items: ['新增笔记本ID分享功能', '支持通过ID申请加入笔记本', '所有者可审批加入申请', '批准时可修改权限'] },
          { version: 'v1.4', date: '2026-03-27', items: ['页签内编辑区增加内边距', '支持 Markdown 语法输入'] },
          { version: 'v1.4.1.1', date: '2026-03-28', items: ['修复表格单元格内无法精准选择文字问题'] },
          { version: 'v1.3.2.1', date: '2026-03-27', items: ['支持页面拖拽排序'] },
          { version: 'v1.2.1', date: '2026-03-26', items: ['优化页面bug和排版'] },
          { version: 'v1.2', date: '2026-03-26', items: ['支持笔记分享功能', '支持图片和附件', '支持代码高亮'] },
          { version: 'v1.1', date: '2026-03-25', items: ['支持侧边栏状态持久化', '支持页面图标自定义'] },
          { version: 'v1.0', date: '2026-03-25', items: ['初始版本发布'] },
        ];
        for (const log of defaultLogs) {
          await addUpdateLog(log);
        }
        setUpdates(defaultLogs);
        setUpdateLogsCache(defaultLogs);
      }
      setLoading(false);
    };
    loadLogs();
  }, []);

  const startEdit = (update: {id?: string; version: string; date: string; items: string[]}, index: number) => {
    setEditingId(update.id || `new-${index}`);
    setEditVersion(update.version);
    setEditDate(update.date);
    setEditText(update.items.join('\n'));
  };

  const saveEdit = async () => {
    if (editingId === null) return;

    const newItems = editText.split('\n').filter(s => s.trim());
    const updateIndex = updates.findIndex(u => (u.id || '') === editingId);

    if (updateIndex !== -1) {
      const update = updates[updateIndex];
      const result = await updateUpdateLog(update.id!, {
        version: editVersion.trim(),
        date: editDate.trim(),
        items: newItems,
      });

      if (result.success) {
        const updatedLogs = updates.map((u, i) =>
          i === updateIndex ? { ...u, version: editVersion.trim(), date: editDate.trim(), items: newItems } : u
        );
        setUpdates(updatedLogs);
        setUpdateLogsCache(updatedLogs);
        toast.success('更新日志已保存');
      } else {
        toast.error('保存失败');
      }
    }

    setEditingId(null);
    setEditText('');
    setEditVersion('');
    setEditDate('');
  };

  const handleAddVersion = async () => {
    if (!newVersion.trim() || !newDate.trim()) {
      toast.error('请填写版本号和日期');
      return;
    }
    const items = newItems.split('\n').filter(s => s.trim());
    const result = await addUpdateLog({
      version: newVersion.trim(),
      date: newDate.trim(),
      items,
    });
    if (result.success && result.data) {
      const updatedLogs = sortByVersion([{ ...result.data, items }, ...updates]);
      setUpdates(updatedLogs);
      setUpdateLogsCache(updatedLogs);
      setNewVersion('');
      setNewDate(new Date().toISOString().split('T')[0]);
      setNewItems('');
      setShowAddForm(false);
      toast.success('版本已添加');
    } else {
      toast.error('添加失败');
    }
  };

  const handleDeleteVersion = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: '删除版本',
      message: '确定要删除此版本吗？',
      isDanger: true,
      onConfirm: async () => {
        const result = await deleteUpdateLog(id);
        if (result.success) {
          const updatedLogs = sortByVersion(updates.filter(u => u.id !== id));
          setUpdates(updatedLogs);
          setUpdateLogsCache(updatedLogs);
          toast.success('版本已删除');
        } else {
          toast.error('删除失败');
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center">
          <div className="animate-pulse">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        <div className="bg-gradient-to-r from-purple-500 to-blue-600 px-6 py-5 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">更新日志</h2>
              <p className="text-purple-200 text-sm">了解最新功能和改进</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && !showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="text-white/80 hover:text-white flex items-center gap-1 text-sm"
              >
                <Plus className="w-4 h-4" />
                添加版本
              </button>
            )}
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* 添加新版本表单 - 管理员可见 */}
          {isAdmin && showAddForm && (
            <div className="border-2 border-dashed border-purple-300 rounded-lg p-4 space-y-3 bg-purple-50">
              <h3 className="text-sm font-semibold text-purple-700">添加新版本</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="版本号，如 v1.5"
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1.5"
                />
              </div>
              <textarea
                value={newItems}
                onChange={(e) => setNewItems(e.target.value)}
                placeholder="更新内容（每行一条）"
                className="w-full text-xs border border-gray-300 rounded p-2 resize-none"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddVersion}
                  className="text-xs bg-purple-500 text-white px-4 py-1.5 rounded hover:bg-purple-600"
                >
                  确定添加
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewVersion('');
                    setNewItems('');
                  }}
                  className="text-xs bg-gray-200 text-gray-700 px-4 py-1.5 rounded hover:bg-gray-300"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {updates.map((update, index) => (
            <div key={update.id || index} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {update.version}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{update.date}</span>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteVersion(update.id!)}
                      className="text-xs text-red-500 hover:text-red-700"
                      title="删除版本"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && editingId !== (update.id || `new-${index}`) && (
                    <button
                      onClick={() => startEdit(update, index)}
                      className="text-xs text-purple-600 hover:text-purple-800"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </div>
              {editingId === (update.id || `new-${index}`) ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editVersion}
                      onChange={(e) => setEditVersion(e.target.value)}
                      placeholder="版本号"
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                    />
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1"
                    />
                  </div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded p-2 leading-relaxed resize-none"
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="text-xs bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-1">
                  {update.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600 leading-relaxed">
                      <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 笔记本分享弹窗组件
const NotebookShareModal: React.FC<{
  notebook: Note;
  onClose: () => void;
}> = ({ notebook, onClose }) => {
  const { user } = useAuth();
  const [shares, setShares] = useState<any[]>([]);
  const [newSharerEmail, setNewSharerEmail] = useState('');
  const [newPermission, setNewPermission] = useState<'view' | 'edit'>('edit');
  const [loading, setLoading] = useState(false);
  const [loadingShares, setLoadingShares] = useState(true); // 加载共享者列表的状态
  // 确认弹窗状态
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const displayName = user?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '未知用户';

  // 从数据库加载分享列表
  useEffect(() => {
    const loadShares = async () => {
      setLoadingShares(true);
      try {
        const data = await getNotebookShares(notebook.id);
        setShares(data);
      } catch (error) {
        console.error('加载共享者列表失败:', error);
      } finally {
        setLoadingShares(false);
      }
    };
    loadShares();
  }, [notebook.id]);

  const handleAddSharer = async () => {
    if (!newSharerEmail) {
      toast.error('请输入邮箱地址');
      return;
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newSharerEmail)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    // 检查是否是自己
    if (newSharerEmail === user?.email) {
      toast.error('不能将自己添加为共享者');
      return;
    }

    setLoading(true);
    try {
      const result = await shareNotebook(notebook.id, newSharerEmail, newPermission);
      if (result.success) {
        toast.success(`已添加 ${newSharerEmail}，权限：${newPermission === 'edit' ? '可编辑' : '仅查看'}`);
        // 重新加载分享列表
        const data = await getNotebookShares(notebook.id);
        setShares(data);
        setNewSharerEmail('');
      } else {
        // 显示详细的错误信息
        toast.error(result.error || '添加共享者失败，请重试');
      }
    } catch (error) {
      console.error('添加共享者失败:', error);
      toast.error('添加共享者失败，请重试');
    }
    setLoading(false);
  };

  const handleRemoveSharer = async (email: string) => {
    setConfirmModal({
      isOpen: true,
      title: '取消共享',
      message: `确定要取消共享给 ${email} 吗？`,
      onConfirm: async () => {
        try {
          const result = await unshareNotebook(notebook.id, email);
          if (result.success) {
            toast.success(`已取消共享给 ${email}`);
            const data = await getNotebookShares(notebook.id);
            setShares(data);
          } else {
            toast.error(result.error || '取消共享失败，请重试');
          }
        } catch (error) {
          console.error('取消共享失败:', error);
          toast.error('取消共享失败，请重试');
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-teal-600 px-6 py-5 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">分享设置</h2>
            <p className="text-green-100 text-sm truncate max-w-[200px]">{notebook.title}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 所有者 */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500 mb-1">所有者</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-sm font-medium text-purple-600">{displayName.charAt(0).toUpperCase()}</span>
              </div>
              <span className="font-medium text-gray-800">{displayName}</span>
            </div>
          </div>

          {/* 添加共享者 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">添加共享者</p>
            <div className="space-y-2">
              <input
                type="email"
                value={newSharerEmail}
                onChange={(e) => setNewSharerEmail(e.target.value)}
                placeholder="输入邮箱地址"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
              <div className="flex gap-2">
                <div className="flex-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPermission('edit')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      newPermission === 'edit'
                        ? 'bg-green-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    可编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPermission('view')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      newPermission === 'view'
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    仅查看
                  </button>
                </div>
                <button
                  onClick={handleAddSharer}
                  disabled={loading || !newSharerEmail}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          {/* 共享者列表 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">已共享 ({loadingShares ? '...' : shares.length})</p>
            {loadingShares ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                <span className="text-sm text-gray-500">加载中...</span>
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">暂无共享者</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {shares.map((share) => (
                  <div key={share.id || share.shared_email} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-xs text-blue-600">{(share.display_name || share.email || '?').charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-800 font-medium">{share.display_name || share.email}</span>
                        <span className="text-xs text-gray-400">{share.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${share.permission === 'edit' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                        {share.permission === 'edit' ? '可编辑' : '仅查看'}
                      </span>
                      <button
                        onClick={() => handleRemoveSharer(share.email)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="取消共享"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 确认弹窗 */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};

export const Sidebar: React.FC<{ collapsed: boolean; onToggle: () => void }> = ({ collapsed, onToggle }) => {
  const { user } = useAuth();
  const notes = useNoteStore((state) => state.notes);
  const addNote = useNoteStore((state) => state.addNote);
  const updateNote = useNoteStore((state) => state.updateNote);
  const deleteNote = useNoteStore((state) => state.deleteNote);
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  const selectNote = useNoteStore((state) => state.selectNote);
  const syncToCloud = useNoteStore((state) => state.syncToCloud);
  const expandedNodes = useNoteStore((state) => state.expandedNodes);
  const toggleExpanded = useNoteStore((state) => state.toggleExpanded);
  const reorderPages = useNoteStore((state) => state.reorderPages);
  const reorderSections = useNoteStore((state) => state.reorderSections);
  const saveNoteById = useNoteStore((state) => state.saveNoteById);
  const loadFromCloud = useNoteStore((state) => state.loadFromCloud);

  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAdminConsole, setShowAdminConsole] = useState(false);
  const [sharingNotebook, setSharingNotebook] = useState<Note | null>(null);
  const [showUpdateLogs, setShowUpdateLogs] = useState(false);
  const [showDownloadApp, setShowDownloadApp] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showOneDriveModal, setShowOneDriveModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailNotebookId, setEmailNotebookId] = useState<string | null>(null);
  const [showLLMConfigModal, setShowLLMConfigModal] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showBackupConfig, setShowBackupConfig] = useState(false);
  const [showBackupHistory, setShowBackupHistory] = useState(false);
  const [backupHistoryNote, setBackupHistoryNote] = useState<{ id: string; title: string } | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  // 确认弹窗状态
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [sharedNotebookIds, setSharedNotebookIds] = useState<Set<string>>(new Set());
  const [storageBoundIds, setStorageBoundIds] = useState<Set<string>>(new Set());
  const [dragOverPageIndex, setDragOverPageIndex] = useState<number | null>(null);
  const [dragOverSectionIndex, setDragOverSectionIndex] = useState<{ [key: string]: number }>({});
  const userMenuRef = useRef<HTMLDivElement>(null);
  const reorderPagesRef = useRef(reorderPages);
  const reorderSectionsRef = useRef(reorderSections);
  const activeSectionRef = useRef(activeSection);
  reorderPagesRef.current = reorderPages;
  reorderSectionsRef.current = reorderSections;
  activeSectionRef.current = activeSection;

  // 加载共享笔记本列表（优化：一次批量查询替代 N 次串行调用）
  const notebookIds = useMemo(() => {
    return notes.filter((n) => n.type === 'notebook' || n.type === 'email_notebook').map((n) => n.id).sort().join(',');
  }, [notes]);

  useEffect(() => {
    const loadSharedNotebooks = async () => {
      try {
        const ids = await getSharedNotebookIds();
        setSharedNotebookIds(new Set(ids));
      } catch (e) {
        console.error('批量获取共享状态失败:', e);
      }
    };

    if (notebookIds.length > 0) {
      loadSharedNotebooks();
    }
  }, [notebookIds]);

  // 批量查询笔记本的储存空间绑定状态
  useEffect(() => {
    const loadStorageStatus = async () => {
      try {
        const ids = notes.filter((n) => n.type === 'notebook' || n.type === 'email_notebook').map((n) => n.id);
        const result = await checkNotebooksStorageBatch(ids);
        const boundSet = new Set<string>();
        result.forEach((bound, nid) => { if (bound) boundSet.add(nid); });
        setStorageBoundIds(boundSet);
      } catch (e) {
        console.error('批量获取储存空间状态失败:', e);
      }
    };

    if (notebookIds.length > 0) {
      loadStorageStatus();
    }
  }, [notebookIds]);

  // 加载待处理申请数量
  useEffect(() => {
    const loadPendingCount = async () => {
      const count = await getPendingInviteCount();
      setPendingInviteCount(count);
    };
    if (user) {
      loadPendingCount();
    }
  }, [user]);

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // 当 selectedNoteId 变化时，自动更新 activeSection
  useEffect(() => {
    if (!selectedNoteId) {
      return;
    }
    const note = notes.find(n => n.id === selectedNoteId);
    if (!note) {
      return;
    }
    if (note.type === 'section') {
      // 选中分区，设置 activeSection
      setActiveSection(note.id);
    } else if (note.type === 'page') {
      // 选中页面，设置 activeSection 为其父分区
      setActiveSection(note.parentId);
    } else if (note.type === 'notebook' || note.type === 'email_notebook') {
      // 选中笔记本，重置 activeSection
      setActiveSection(null);
    }
  }, [selectedNoteId, notes]);

  // 处理登出
  const handleLogout = async () => {
    try {
      // 先清除本地缓存，再退出登录
      useNoteStore.getState().clearLocalCache();
      await signOut();
      toast.success('已退出登录');
      setShowUserMenu(false);
      window.location.reload();
    } catch (error) {
      toast.error('退出失败');
    }
  };

  // 获取用户显示名称
  const displayName = user?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '用户';
  const userInitial = displayName.charAt(0).toUpperCase();

  // 获取所有笔记本（一级）- 使用 useMemo 缓存
  const notebooks = useMemo(
    () => notes.filter((n) => n.type === 'notebook' || n.type === 'email_notebook').sort((a, b) => a.order - b.order),
    [notes]
  );

  // 预计算 parentId → children 映射表，避免渲染时 O(n×m) filter
  const notesByParent = useMemo(() => {
    const map: Record<string, Note[]> = {};
    for (const n of notes) {
      const key = n.parentId;
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(n);
      }
    }
    return map;
  }, [notes]);

  // 获取选中分区下的页面 - 使用 useMemo 缓存
  const activeSectionObj = useMemo(
    () => activeSection ? notes.find((n) => n.id === activeSection) : null,
    [notes, activeSection]
  );
  const pages = useMemo(() => {
    if (!activeSection) return [];
    return (notesByParent[activeSection] || [])
      .filter((n) => n.type === 'page')
      .sort((a, b) => a.order - b.order);
  }, [notesByParent, activeSection]);

  // 展开/折叠笔记本
  const toggleNotebook = useCallback((notebookId: string) => {
    // 使用 store 的 toggleExpanded，它会同时更新状态并保存到数据库
    toggleExpanded(notebookId);
  }, [toggleExpanded]);

  // 点击分区：选中第一个页面（数据已全量加载，无需懒加载）
  const handleSectionClick = useCallback(async (sectionId: string) => {
    setActiveSection(sectionId);
    
    // 检查本地是否已有页面
    const localNotes = useNoteStore.getState().notes;
    const sectionPages = localNotes.filter((n) => n.parentId === sectionId && n.type === 'page').sort((a, b) => a.order - b.order);
    
    if (sectionPages.length > 0) {
      // 有页面，选中第一个
      selectNote(sectionPages[0].id);
    } else {
      // 空白分区，清除选中状态
      selectNote(null);
    }
  }, [selectNote]);

  const handlePageClick = useCallback((pageId: string) => {
    selectNote(pageId);
  }, [selectNote]);

  const handleTitleChange = useCallback((id: string, newTitle: string) => {
    updateNote(id, { title: newTitle });
  }, [updateNote]);

  const handleIconChange = useCallback((id: string, iconId: string) => {
    updateNote(id, { icon: iconId });
  }, [updateNote]);

  const handleTagChange = useCallback((id: string, tag: string) => {
    updateNote(id, { tag: tag || undefined });
    toast.success('标签已更新');
  }, [updateNote]);

  const handleDelete = useCallback((id: string) => {
    setConfirmModal({
      isOpen: true,
      title: '删除笔记',
      message: '确定要删除吗？这将同时删除所有子项。',
      isDanger: true,
      onConfirm: () => deleteNote(id)
    });
  }, [deleteNote]);

  // 新建笔记本
  const handleNewNotebook = useCallback(() => {
    addNote(null, 'notebook');
    setShowUserMenu(false);
  }, [addNote]);

  const handleAddEmailNotebook = useCallback(async () => {
    const hasEmailNotebook = notes.some(n => n.type === 'email_notebook');
    if (hasEmailNotebook) {
      toast.error('已存在邮箱笔记本，每个用户只能添加一个');
      return;
    }
    const notebookId = addNote(null, 'email_notebook', '邮箱管理');
    updateNote(notebookId, { icon: 'mail' });
    saveNoteById(notebookId);
  }, [notes, addNote, updateNote, saveNoteById]);

  // 新建页面
  const handleAddPage = useCallback(() => {
    if (!activeSection) {
      return;
    }
    const pageId = addNote(activeSection, 'page', '新页面', { skipSelect: true });
    selectNote(pageId);
  }, [activeSection, addNote, selectNote]);

  // 在指定笔记本下新建分区
  const handleAddSection = useCallback((notebookId: string) => {
    const notebook = notes.find(n => n.id === notebookId);
    if (notebook?.type === 'email_notebook') {
      setEmailNotebookId(notebookId);
      setShowEmailModal(true);
      return;
    }
    if (!expandedNodes.includes(notebookId)) {
      toggleExpanded(notebookId);
    }
    const sectionId = addNote(notebookId, 'section', '新分区', { skipSelect: true });
    setActiveSection(sectionId);
  }, [expandedNodes, toggleExpanded, addNote, notes]);

  // 打开分享设置
  const handleShareNotebook = useCallback((notebook: Note) => {
    setSharingNotebook(notebook);
  }, []);

  // 复制笔记本ID
  const handleCopyNotebookId = useCallback((notebook: Note) => {
    // 兼容 HTTP 环境的复制方法
    const textArea = document.createElement('textarea');
    textArea.value = notebook.id;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      toast.success('笔记本ID已复制到剪贴板');
    } catch (err) {
      toast.error('复制失败');
    }
    document.body.removeChild(textArea);
  }, []);

  // 打开查看申请弹窗
  const handleViewInvites = useCallback((notebook: Note) => {
    setSharingNotebook(notebook);
    setShowInviteModal(true);
  }, []);

  return (
    <div className={`h-full bg-gray-50 border-r border-gray-200 flex flex-col transition-all duration-300 ${collapsed ? 'w-12 sidebar-collapsed' : 'w-[25vw] sidebar-normal'}`}>
      {/* 顶部 - Logo */}
      <div className="h-[47px] shrink-0 flex items-center px-3 bg-white border-b border-gray-100 justify-between">
        {!collapsed && (
          <span className="font-bold text-sm" style={{ background: 'linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', opacity: 0.6 }}>彩云笔记 <span className="text-xs text-gray-400 ml-1">v2.1.1</span></span>
        )}
        <div className={`flex items-center gap-1 ${collapsed ? 'w-full justify-center' : ''}`}>
          {!collapsed && (
            <>
<button
          onClick={() => window.location.reload()}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          title="刷新页面"
        >
          <RefreshCw size={14} className="text-gray-400 hover:text-gray-600" />
        </button>
          {/* 下载 App 按钮 */}
          <button
            onClick={() => setShowDownloadApp(true)}
            className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
            title="下载 App"
          >
            <Download size={14} className="text-gray-500 hover:text-gray-700" />
          </button>
            </>
          )}
          {/* 收起/展开侧边栏按钮 */}
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {collapsed ? <PanelLeft size={14} className="text-gray-500 hover:text-gray-700" /> : <PanelLeftClose size={14} className="text-gray-500 hover:text-gray-700" />}
          </button>
        </div>
      </div>
      {/* 头部 - 搜索框、更新日志按钮 */}
      {!collapsed && (
        <>
          {/* 三栏布局：笔记本12.5% + 页面12.5% + 编辑器75% */}
          <div className="flex-1 flex overflow-hidden">
            {/* 左栏：笔记本列表 - Sidebar宽度的50% = 屏幕的12.5% */}
            <div className="w-1/2 min-w-0 flex-shrink-0 border-r border-gray-200 flex flex-col bg-[#F9FAFB]">
              {/* 笔记本列表 */}
              <div className="flex-1 overflow-y-auto relative">
                {notebooks.map((notebook, index) => {
                  const notebookSections = (notesByParent[notebook.id] || [])
                    .filter((n) => n.type === 'section' || n.type === 'email_account');
                  const isExpanded = expandedNodes.includes(notebook.id);
                  const isShared = sharedNotebookIds.has(notebook.id);

                  return (
                    <div
                      key={notebook.id}
                      data-notebook-index={index}
                    >
                      <NotebookItem
                        notebook={notebook}
                        sections={notebookSections}
                        isExpanded={isExpanded}
                        isActive={false}
                        activeSection={activeSection}
                        onToggle={() => toggleNotebook(notebook.id)}
                        onSectionClick={handleSectionClick}
                        onTitleChange={handleTitleChange}
                        onDelete={handleDelete}
                        onAddSection={handleAddSection}
                        onShare={handleShareNotebook}
                        onIconChange={handleIconChange}
                        onCopyId={handleCopyNotebookId}
                        onViewInvites={handleViewInvites}
                        isShared={isShared}
                        isOwner={notebook.owner_id === user?.id}
                        hasStorage={storageBoundIds.has(notebook.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右栏：页面列表 - Sidebar宽度的50% = 屏幕的12.5% */}
            <div className="w-1/2 min-w-0 flex-shrink-0 flex flex-col bg-gray-50">
              {/* 页面列表 - 简洁设计，无分区名称 */}
              <div className="flex-1 overflow-y-auto flex flex-col">
                {activeSection ? (
                  pages.length > 0 ? (
                    <>
                      <PagesDndArea
                        pageIds={pages.map(p => p.id)}
                        onReorder={(newPageIds) => {
                          reorderPagesRef.current(activeSection, newPageIds);
                        }}
                      >
                        {pages.map((page) => (
                          <PageWrapper key={page.id} id={page.id}>
                            <PageItem
                              page={page}
                              isActive={selectedNoteId === page.id}
                              onClick={() => handlePageClick(page.id)}
                              onTitleChange={handleTitleChange}
                              onDelete={handleDelete}
                              onIconChange={handleIconChange}
                              onViewHistory={(id, title) => {
                                setBackupHistoryNote({ id, title });
                                setShowBackupHistory(true);
                              }}
                            />
                          </PageWrapper>
                        ))}
                      </PagesDndArea>
                      {/* 新建页面按钮 - 只有选中分区时才显示 */}
                      {activeSection && (
                        <div className="p-2 flex-shrink-0">
                          <button
                            onClick={handleAddPage}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            新建页面
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-gray-400 flex-1">
                      <p className="text-sm mb-3">暂无页面</p>
                      <button
                        onClick={handleAddPage}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        创建页面
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 flex-1">
                    <p className="text-sm">选择分区查看页面</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 底部用户头像 + 设置菜单 */}
          <div className="h-[52px] px-3 border-t border-gray-200 bg-white flex items-center justify-between">
            <div className="relative flex items-center" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-sm font-medium text-white">{userInitial}</span>
                </div>
                <span className="text-sm text-gray-700 truncate">{displayName}</span>
              </button>

              {/* 用户菜单下拉 */}
              {showUserMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[200px]">
                  {/* 顶部用户信息 */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-800">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                  </div>

                  {/* 菜单项 */}
                  <button
                    onClick={handleNewNotebook}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-4 h-4 text-purple-500" />
                    新建笔记本
                  </button>
                  <button
                    onClick={() => { syncToCloud(); setShowUserMenu(false); toast.success('已同步到云端'); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="w-4 h-4 text-green-500" />
                    保存到云端
                  </button>
                  <button
                    onClick={() => { setShowExportModal(true); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Upload className="w-4 h-4 text-purple-500" />
                    笔记导出/导入
                  </button>
                  <button
                    onClick={() => { setShowOneDriveModal(true); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Cloud className="w-4 h-4 text-sky-500" />
                    OneDrive 云盘
                  </button>
                  <button
                    onClick={() => { setShowLLMConfigModal(true); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Bot className="w-4 h-4 text-violet-500" />
                    AI大模型配置
                  </button>
                  <button
                    onClick={() => { setShowBackupConfig(true); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <HardDrive className="w-4 h-4 text-blue-500" />
                    本地备份设置
                  </button>

                  {user?.email === '767493611@qq.com' && (
                    <button
                      onClick={() => { setShowAdminConsole(true); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-purple-700 hover:bg-purple-50"
                    >
                      <Shield className="w-4 h-4 text-purple-500" />
                      管理控制台
                    </button>
                  )}
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* 新建按钮 - 加号 */}
            <div className="flex items-center gap-1 ml-[10px]">
              {/* 通知按钮 */}
              <button
                onClick={() => setShowInviteModal(true)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors relative"
                title="通知"
              >
                <Bell className="w-5 h-5 text-gray-500" />
                {pendingInviteCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingInviteCount > 9 ? '9+' : pendingInviteCount}
                  </span>
                )}
              </button>
              {/* 更新日志按钮 */}
              <button
                onClick={() => setShowUpdateLogs(true)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="更新日志"
              >
                <Clock className="w-5 h-5 text-gray-500" />
              </button>
              {/* 加号按钮 */}
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="p-[5px] bg-purple-500 hover:bg-purple-600 rounded-lg transition-colors"
                title="新建"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              {/* 新建弹窗 - 与更新日志风格一致 */}
              {showAddMenu && (
                <>
                  <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setShowAddMenu(false)}
                  />
                  <div className="fixed inset-0 flex items-center justify-center z-[100]">
                    <div className="bg-white rounded-2xl shadow-2xl w-64 overflow-hidden">
                      <div className="bg-gradient-to-r from-purple-500 to-blue-600 px-4 py-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Plus className="w-5 h-5 text-white" />
                          <span className="text-white font-medium">新建</span>
                        </div>
                        <button
                          onClick={() => setShowAddMenu(false)}
                          className="text-white/80 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-3 space-y-1">
                        <button
                          onClick={() => { handleNewNotebook(); setShowAddMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4 text-purple-500" />
                          新建笔记本
                        </button>
                        <button
                          onClick={() => { setShowAddMenu(false); handleAddEmailNotebook(); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <Mail className="w-4 h-4 text-blue-500" />
                          邮箱笔记本
                        </button>
                        <button
                          onClick={() => { setShowAddMenu(false); setShowJoinModal(true); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <Users className="w-4 h-4 text-blue-500" />
                          加入笔记本
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* 管理控制台 */}
      {showAdminConsole && (
        <AdminConsole onClose={() => setShowAdminConsole(false)} />
      )}

      {/* 笔记本分享弹窗 */}
      {sharingNotebook && (
        <NotebookShareModal
          notebook={sharingNotebook}
          onClose={() => setSharingNotebook(null)}
        />
      )}

      {/* 更新日志弹窗 */}
      {showUpdateLogs && (
        <UpdateLogsModal onClose={() => setShowUpdateLogs(false)} />
      )}

      {/* 下载 App 弹窗 */}
      {showDownloadApp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDownloadApp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[380px]" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-800 mb-4">下载 App</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              彩云笔记桌面应用，支持 macOS 和 Windows。
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-sm text-gray-700 mb-2"><span className="text-gray-500">下载链接：</span><a href="https://pan.baidu.com/s/1ezE0eJ4jR44uQiOgQwXoDg" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">https://pan.baidu.com/s/1ezE0eJ4jR44uQiOgQwXoDg</a></p>
              <p className="text-sm text-gray-700"><span className="text-gray-500">提取码：</span><span className="font-mono font-bold text-purple-600">dhjk</span></p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowDownloadApp(false)}
                className="px-5 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm font-medium"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 本地备份配置弹窗 */}
      {showBackupConfig && (
        <BackupConfigModal onClose={() => setShowBackupConfig(false)} />
      )}

      {/* 历史版本弹窗 */}
      {showBackupHistory && backupHistoryNote && (
        <BackupHistoryModal
          noteId={backupHistoryNote.id}
          noteTitle={backupHistoryNote.title}
          onRestore={async (content) => {
            // 检查锁定状态
            const userId = localStorage.getItem('userId') || '';
            const note = useNoteStore.getState().getNoteById(backupHistoryNote.id);
            const notebookId = note?.rootNotebookId || '';
            const isNotebookOwner = useNoteStore.getState().notes.some(
              n => n.id === notebookId && n.createdBy === userId
            );

            const { canEdit, lockedByName } = await canUserEditPage(
              backupHistoryNote.id,
              userId,
              isNotebookOwner
            );

            if (!canEdit) {
              toast.error(`页面被 ${lockedByName || '其他用户'} 锁定，无法恢复`);
              return;
            }

            // 恢复内容
            useNoteStore.getState().updateNote(backupHistoryNote.id, { content });
          }}
          onClose={() => {
            setShowBackupHistory(false);
            setBackupHistoryNote(null);
          }}
        />
      )}

      {/* 笔记导出/导入弹窗 */}
      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} />
      )}

      {/* 加入笔记本弹窗 */}
      {showJoinModal && (
        <JoinNotebookModal onClose={() => setShowJoinModal(false)} />
      )}

      {/* 申请通知弹窗 */}
      {showInviteModal && (
        <InviteManagementModal onClose={() => setShowInviteModal(false)} />
      )}

      {/* OneDrive 云盘弹窗 */}
      {showOneDriveModal && (
        <OneDriveModal onClose={() => setShowOneDriveModal(false)} />
      )}
      <EmailAccountModal
        show={showEmailModal}
        onClose={() => { setShowEmailModal(false); setEmailNotebookId(null); }}
        onSuccess={() => { loadFromCloud(); }}
        notebookId={emailNotebookId || undefined}
      />

      {/* 大模型配置弹窗 */}
      {showLLMConfigModal && (
        <LLMConfigModal onClose={() => setShowLLMConfigModal(false)} />
      )}

      {/* 确认弹窗 */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDanger={confirmModal.isDanger}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
}

// 加入笔记本弹窗组件
const JoinNotebookModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [notebookId, setNotebookId] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!notebookId.trim()) {
      toast.error('请输入笔记本ID');
      return;
    }

    setLoading(true);
    const result = await createInvite(notebookId.trim(), permission);
    setLoading(false);

    if (result.success) {
      toast.success('申请已提交，请等待笔记本所有者审批');
      onClose();
    } else {
      toast.error(result.error || '申请失败');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-white" />
            <span className="text-white font-medium">加入笔记本</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">笔记本ID <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={notebookId}
              onChange={(e) => setNotebookId(e.target.value)}
              placeholder="请输入笔记本ID"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">从笔记本的"复制笔记本ID"获取</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">申请权限</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${permission === 'view' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="permission"
                  value="view"
                  checked={permission === 'view'}
                  onChange={() => setPermission('view')}
                  className="sr-only"
                />
                <Eye className="w-4 h-4" />
                <span className="text-sm">查看</span>
              </label>
              <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${permission === 'edit' ? 'border-purple-500 bg-purple-50 text-purple-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="permission"
                  value="edit"
                  checked={permission === 'edit'}
                  onChange={() => setPermission('edit')}
                  className="sr-only"
                />
                <Edit2 className="w-4 h-4" />
                <span className="text-sm">编辑</span>
              </label>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !notebookId.trim()}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all text-sm font-medium"
          >
            {loading ? '提交中...' : '提交申请'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 申请通知管理弹窗组件
const InviteManagementModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [invites, setInvites] = useState<NotebookInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');

  useEffect(() => {
    const loadInvites = async () => {
      setLoading(true);
      if (activeTab === 'received') {
        const data = await getReceivedInvites();
        setInvites(data);
        // 初始化下拉框权限
        const initPerms: Record<string, 'view' | 'edit'> = {};
        data.forEach(invite => { initPerms[invite.id] = invite.permission; });
        setSelectedPermissions(initPerms);
      } else {
        const data = await getMyInvites();
        setInvites(data);
      }
      setLoading(false);
    };
    loadInvites();
  }, [activeTab]);

  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, 'view' | 'edit'>>({});

  const handlePermissionChange = (inviteId: string, permission: 'view' | 'edit') => {
    setSelectedPermissions(prev => ({ ...prev, [inviteId]: permission }));
  };

  const handleApprove = async (invite: NotebookInvite) => {
    const permission = selectedPermissions[invite.id] ?? invite.permission;
    await handleRespond(invite.id, 'approve', permission);
  };

  const handleRespond = async (inviteId: string, action: 'approve' | 'reject', grantedPermission?: 'view' | 'edit') => {
    const result = await respondToInvite(inviteId, action, grantedPermission);
    if (result.success) {
      toast.success(action === 'approve' ? '已批准申请' : '已拒绝申请');
      // 刷新列表
      const data = await getReceivedInvites();
      setInvites(data);
    } else {
      toast.error(result.error || '操作失败');
    }
  };

  const handleCancel = async (inviteId: string) => {
    const result = await cancelInvite(inviteId);
    if (result.success) {
      toast.success('已取消申请');
      // 刷新列表
      const data = await getMyInvites();
      setInvites(data);
    } else {
      toast.error(result.error || '操作失败');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">待处理</span>;
      case 'approved':
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">已批准</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">已拒绝</span>;
      default:
        return null;
    }
  };

  const getPermissionBadge = (permission: string) => {
    return permission === 'edit'
      ? <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">申请编辑</span>
      : <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">申请查看</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-purple-500 to-blue-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-white" />
            <span className="text-white font-medium">申请通知</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Tab 切换 */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('received')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'received' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            收到的申请
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'sent' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            我发出的申请
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{activeTab === 'received' ? '暂无收到申请' : '暂无发出的申请'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map(invite => (
                <div key={invite.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {invite.notebook_title || '未知笔记本'}
                      </p>
                      {activeTab === 'received' ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          申请人：{invite.requester_name || invite.requester_email || '未知用户'}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">
                          申请时间：{new Date(invite.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {getStatusBadge(invite.status)}
                      {activeTab === 'sent' && invite.status === 'pending' && getPermissionBadge(invite.permission)}
                    </div>
                  </div>
                  
                  {/* 操作按钮 */}
                  {activeTab === 'received' && invite.status === 'pending' && (
                    <div className="flex gap-2 mt-3 items-center">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handlePermissionChange(invite.id, 'view')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            (selectedPermissions[invite.id] ?? invite.permission) === 'view'
                              ? 'bg-blue-500 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePermissionChange(invite.id, 'edit')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            (selectedPermissions[invite.id] ?? invite.permission) === 'edit'
                              ? 'bg-green-500 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          编辑
                        </button>
                      </div>
                      <button
                        onClick={() => handleApprove(invite)}
                        className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-colors"
                      >
                        批准
                      </button>
                      <button
                        onClick={() => handleRespond(invite.id, 'reject')}
                        className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-colors"
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                  {activeTab === 'sent' && invite.status === 'pending' && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => handleCancel(invite.id)}
                        className="px-3 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        取消申请
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 大模型配置弹窗
const LLMConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [protocol, setProtocol] = useState<'openai' | 'anthropic'>('openai');
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [isConfigured, setIsConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; reply?: string; elapsed?: number; error?: string } | null>(null);

  const openaiProviders = [
    { value: 'openai', label: 'OpenAI', defaultBase: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
    { value: 'deepseek', label: 'DeepSeek', defaultBase: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
    { value: 'zhipu', label: '智谱 AI', defaultBase: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash' },
    { value: 'qwen', label: '通义千问', defaultBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-turbo' },
    { value: 'moonshot', label: 'Moonshot', defaultBase: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
    { value: 'custom_openai', label: '自定义 (OpenAI 兼容)', defaultBase: '', defaultModel: '' },
  ];

  const anthropicProviders = [
    { value: 'anthropic', label: 'Anthropic (Claude)', defaultBase: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514' },
    { value: 'custom_anthropic', label: '自定义 (Anthropic 兼容)', defaultBase: '', defaultModel: '' },
  ];

  const currentProviders = protocol === 'openai' ? openaiProviders : anthropicProviders;
  const currentProvider = currentProviders.find(p => p.value === provider) || currentProviders[0];

  useEffect(() => {
    const loadConfig = async () => {
      const result = await checkLLMConfig();
      if (result.configured && result.config) {
        setIsConfigured(true);
        setProtocol(result.config.protocol || 'openai');
        setProvider(result.config.provider || (result.config.protocol === 'anthropic' ? 'anthropic' : 'openai'));
        setApiKey(result.config.api_key || '');
        setBaseUrl(result.config.base_url || '');
        setModelName(result.config.model_name || 'gpt-4o-mini');
      }
    };
    loadConfig();
  }, []);

  const handleProtocolChange = (newProtocol: 'openai' | 'anthropic') => {
    setProtocol(newProtocol);
    const providers = newProtocol === 'openai' ? openaiProviders : anthropicProviders;
    setProvider(providers[0].value);
    if (providers[0].defaultBase) setBaseUrl(providers[0].defaultBase);
    if (providers[0].defaultModel) setModelName(providers[0].defaultModel);
  };

  const handleProviderChange = (val: string) => {
    setProvider(val);
    const opt = currentProviders.find(p => p.value === val);
    if (opt && !val.startsWith('custom')) {
      if (!baseUrl || currentProviders.some(p => p.defaultBase === baseUrl)) {
        setBaseUrl(opt.defaultBase);
      }
      if (!modelName || currentProviders.some(p => p.defaultModel === modelName)) {
        setModelName(opt.defaultModel);
      }
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('请输入 API Key');
      return;
    }
    if (!modelName.trim()) {
      toast.error('请输入模型名称');
      return;
    }
    setSaving(true);
    try {
      const result = await saveLLMConfig({
        provider,
        protocol,
        api_key: apiKey.trim(),
        base_url: baseUrl.trim(),
        model_name: modelName.trim(),
      });
      if (result.success) {
        toast.success('大模型配置已保存');
        setIsConfigured(true);
      } else {
        toast.error(result.error || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const result = await deleteLLMConfig();
      if (result.success) {
        toast.success('已删除大模型配置');
        setApiKey('');
        setBaseUrl('');
        setModelName('gpt-4o-mini');
        setProvider('openai');
        setProtocol('openai');
        setIsConfigured(false);
      } else {
        toast.error(result.error || '删除失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      toast.error('请先输入 API Key');
      return;
    }
    if (!modelName.trim()) {
      toast.error('请先输入模型名称');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testLLMConnection({
        protocol,
        api_key: apiKey.trim(),
        base_url: baseUrl.trim(),
        model_name: modelName.trim(),
      });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const protocolLabel = protocol === 'openai' ? 'OpenAI' : 'Anthropic';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-white" />
            <span className="text-white font-medium">AI大模型配置</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500">
            配置大模型后，你拥有的笔记本可以使用 AI 相关功能。配置信息仅存储在你的账号下，共享者通过你的笔记本使用 AI 时会使用你的配额。
          </p>

          {isConfigured && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <span>✓</span>
              <span>已配置 · {protocolLabel} 协议 · {currentProvider.label} · {modelName}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">接口协议</label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleProtocolChange('openai')}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    protocol === 'openai'
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  OpenAI 协议
                  <span className="block text-[10px] text-gray-400 mt-0.5">/v1/chat/completions</span>
                </button>
                <button
                  onClick={() => handleProtocolChange('anthropic')}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    protocol === 'anthropic'
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Anthropic 协议
                  <span className="block text-[10px] text-gray-400 mt-0.5">/v1/messages</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服务商</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              >
                {currentProviders.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={protocol === 'openai' ? 'sk-...' : 'sk-ant-...'}
                  className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base URL
                <span className="text-gray-400 font-normal ml-1">（可选，自定义接口地址）</span>
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={currentProvider.defaultBase || (protocol === 'openai' ? 'https://api.example.com/v1' : 'https://api.anthropic.com')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">模型名称</label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder={currentProvider.defaultModel || (protocol === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-20250514')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              />
            </div>
          </div>

          {testResult && (
            <div className={`px-3 py-2 rounded-lg text-sm ${
              testResult.success
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}>
              {testResult.success ? (
                <div>
                  <div className="flex items-center gap-1">
                    <span>✓ 连接成功</span>
                    <span className="text-green-500 text-xs">({testResult.elapsed}ms)</span>
                  </div>
                  {testResult.reply && (
                    <div className="mt-1 text-xs text-green-600 truncate">
                      模型回复: {testResult.reply}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <span>✗ 连接失败</span>
                  {testResult.error && (
                    <div className="mt-1 text-xs text-red-500">{testResult.error}</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div>
              {isConfigured && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  删除配置
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={testing || saving}
                className="px-3 py-1.5 text-sm text-violet-600 border border-violet-300 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// OneDrive 云盘管理弹窗
  const OneDriveModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'bind' | 'files'>('bind');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [tenantId, setTenantId] = useState('');
    const [cloudType, setCloudType] = useState<'international' | '世纪互联'>('世纪互联');
    const [isBinding, setIsBinding] = useState(false);
    const [isBound, setIsBound] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
    useEffect(() => {
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (messageHandlerRef.current) window.removeEventListener('message', messageHandlerRef.current);
      };
    }, []);
    // 确认弹窗
    const [confirmModal, setConfirmModal] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    // 调试信息
    const [showDebug, setShowDebug] = useState(false);
    const [debugLog, setDebugLog] = useState<Array<{ step: string; status: 'pending' | 'ok' | 'error'; detail: string }>>([]);

  useEffect(() => {
    checkBindingStatus();
  }, []);

  const checkBindingStatus = async () => {
    if (!user) return;
    const result = await checkOneDriveBinding();
    setIsBound(result.bound);
    // 不自动跳转到文件管理，保持在绑定设置页
  };

  // 调试日志
  const addDebug = (step: string, status: 'pending' | 'ok' | 'error', detail: string) => {
    setDebugLog(prev => {
      const filtered = prev.filter(d => d.step !== step);
      return [...filtered, { step, status, detail }];
    });
  };
  const clearDebug = () => setDebugLog([]);

  // 检查绑定状态（popup 关闭后调用）
  const checkBindStatus = async () => {
    if (!user) return;
    addDebug('检查绑定状态', 'pending', '查询数据库...');
    const result = await getAttachments();
    if (result.success && result.data && result.data.length >= 0) {
      addDebug('检查绑定状态', 'ok', '数据库查询成功');
      setIsBound(true);
      setActiveTab('files');
      loadAttachments();
    } else {
      addDebug('检查绑定状态', 'error', '查询失败或未绑定');
    }
  };

  const loadAttachments = async () => {
    if (!user) return;
    setLoading(true);
    const result = await getAttachments();
    if (result.success) {
      setAttachments(result.data || []);
    }
    setLoading(false);
  };

  // 检测是否在 Tauri APP 中
  const isTauriApp = typeof (window as any).__TAURI__ !== 'undefined' ||
    (navigator.userAgent || '').includes('Tauri') ||
    (navigator.userAgent || '').includes('彩云笔记');

  const handleBind = async () => {
    if (!user || !clientId.trim() || !clientSecret.trim()) {
      toast.error('请填写完整的 Client ID 和 Client Secret');
      return;
    }
    if (cloudType === '世纪互联' && !tenantId.trim()) {
      toast.error('请填写世纪互联的租户 ID');
      return;
    }
    setIsBinding(true);
    clearDebug();

    try {
      // 步骤1：调用本地后端获取授权 URL
      addDebug('① 获取授权 URL', 'pending', '发送请求...');

      const result = await getOneDriveAuthUrl(clientId.trim(), cloudType, cloudType === '世纪互联' ? tenantId.trim() : undefined);
      const authUrl = result.authUrl;

      if (!authUrl) {
        addDebug('① 获取授权 URL', 'error', '返回无 authUrl');
        toast.error('获取授权 URL 失败');
        setIsBinding(false);
        return;
      }

      addDebug('① 获取授权 URL', 'ok', `URL: ${authUrl.slice(0, 100)}...`);

      // Tauri APP：使用外部浏览器打开 + 轮询检查绑定状态
      if (isTauriApp) {
        addDebug('② 打开授权页', 'ok', '正在唤起系统浏览器...');
        toast.success('正在打开系统浏览器，请完成授权后返回...');
        // Tauri 中 window.open 会唤起系统浏览器
        window.open(authUrl, '_blank');
        setIsBinding(false);

        // 轮询检查绑定状态（每3秒检查一次，最多60秒）
        let pollCount = 0;
        const maxPoll = 20;
        const tauriPollTimer = setInterval(async () => {
          pollCount++;
          addDebug('③ 检查绑定', 'pending', `第 ${pollCount}/${maxPoll} 次检查...`);
          const checkResult = await checkOneDriveBinding();
          if (checkResult.bound) {
            clearInterval(tauriPollTimer);
            pollTimerRef.current = null;
            addDebug('③ 授权成功', 'ok', '检测到绑定状态');
            toast.success('OneDrive 绑定成功！');
            setIsBound(true);
            setActiveTab('files');
            loadAttachments();
          } else if (pollCount >= maxPoll) {
            clearInterval(tauriPollTimer);
            pollTimerRef.current = null;
            addDebug('③ 授权超时', 'error', '60秒内未检测到绑定');
            toast.error('授权超时，请重试');
          }
        }, 3000);
        pollTimerRef.current = tauriPollTimer;
        return;
      }

      // 浏览器：使用弹窗 + postMessage 方案
      // 先同步打开空白弹窗（必须在用户点击的同步上下文中，否则会被浏览器拦截）
      const popup = window.open('about:blank', 'onedrive_auth', 'width=600,height=700,left=200,top=100,toolbar=no,menubar=no');

      if (!popup) {
        addDebug('② 打开授权窗口', 'error', '弹窗被浏览器拦截');
        toast.error('弹窗被浏览器拦截，请允许弹窗后重试');
        setIsBinding(false);
        return;
      }

      // 步骤2：在已打开的弹窗中导航到授权 URL
      addDebug('② 导航到授权页', 'ok', '弹窗已打开，正在跳转...');
      toast.success('正在打开授权页面，请在弹窗中完成授权...');
      popup.location.href = authUrl;
      setIsBinding(false);

      // 轮询检测弹窗是否关闭（用户手动关闭的场景）
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          pollTimerRef.current = null;
          if (messageHandlerRef.current) {
            window.removeEventListener('message', messageHandlerRef.current);
            messageHandlerRef.current = null;
          }
        }
      }, 500);
      pollTimerRef.current = pollTimer;

      const messageHandler = (event: MessageEvent) => {
        if (!event.data || typeof event.data !== 'object') return;
        if (event.data.type !== 'onedrive_success' && event.data.type !== 'onedrive_error') return;

        clearInterval(pollTimer);
        pollTimerRef.current = null;
        window.removeEventListener('message', messageHandler);
        messageHandlerRef.current = null;
        if (!popup.closed) popup.close();

        if (event.data.type === 'onedrive_success') {
          addDebug('③ 授权成功', 'ok', '收到 postMessage');
          toast.success('OneDrive 绑定成功！');
          setIsBound(true);
          setActiveTab('files');
          loadAttachments();
        } else {
          addDebug('③ 授权失败', 'error', event.data.error || '未知错误');
          toast.error(event.data.error || '授权失败');
        }
      };
      window.addEventListener('message', messageHandler);
      messageHandlerRef.current = messageHandler;
    } catch (error) {
      console.error('Bind error:', error);
      toast.error('绑定失败');
      setIsBinding(false);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    if (!user) return;
    const result = await downloadFromOneDrive(attachment.id);
    if (result.success && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName || attachment.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.error(result.error || '下载失败');
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: '删除附件',
      message: `确定要删除 "${attachment.file_name}" 吗？`,
      onConfirm: async () => {
        const result = await deleteAttachment(attachment.id);
        if (result.success) {
          toast.success('删除成功');
          loadAttachments();
        } else {
          toast.error(result.error || '删除失败');
        }
      }
    });
  };

  const getFileIcon = (category: string) => {
    switch (category) {
      case 'image': return <Image className="w-5 h-5 text-pink-500" />;
      case 'video': return <Video className="w-5 h-5 text-red-500" />;
      case 'audio': return <Volume2 className="w-5 h-5 text-yellow-500" />;
      case 'document': return <FileText className="w-5 h-5 text-blue-500" />;
      default: return <FileCode className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-white" />
            <span className="text-white font-medium">OneDrive 云盘</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('bind')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'bind' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            绑定设置
          </button>
          <button
            onClick={() => { setActiveTab('files'); loadAttachments(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            文件管理
          </button>
        </div>

        {/* 绑定设置 Tab */}
        {activeTab === 'bind' && (
          <div className="flex flex-1 overflow-hidden">
            {/* 左侧：表单/已绑定区域 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isBound ? (
                /* 已绑定状态 */
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">OneDrive 已绑定</h3>
                  <p className="text-sm text-gray-500 mb-6">你可以开始在笔记中插入附件了</p>
                  <button
                    onClick={() => { setActiveTab('files'); loadAttachments(); }}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    查看附件
                  </button>
                </div>
              ) : (
                /* 未绑定，显示表单 */
                <>
                  {/* 云类型选择 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      选择云版本
                    </label>
                    <div className="flex gap-3">
                      <label className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${cloudType === '世纪互联' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        <input
                          type="radio"
                          name="cloudType"
                          value="世纪互联"
                          checked={cloudType === '世纪互联'}
                          onChange={() => setCloudType('世纪互联')}
                          className="sr-only"
                        />
                        <span className={`text-sm ${cloudType === '世纪互联' ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>☁️ OneDrive 世纪互联版</span>
                      </label>
                      <label className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${cloudType === 'international' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        <input
                          type="radio"
                          name="cloudType"
                          value="international"
                          checked={cloudType === 'international'}
                          onChange={() => setCloudType('international')}
                          className="sr-only"
                        />
                        <span className={`text-sm ${cloudType === 'international' ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>🌐 OneDrive 国际版</span>
                      </label>
                    </div>
                  </div>

                  {/* 一键粘贴说明 */}
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                    💡 <strong>一键粘贴：</strong>将 Azure 门户的三个值（应用程序 ID / 租户 ID / 客户端密码）用换行分隔，一次粘贴进来即可自动填入
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      应用程序(客户端) ID
                    </label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                        if (lines.length >= 1) setClientId(lines[0]);
                        if (lines.length >= 2) setTenantId(lines[1]);
                        if (lines.length >= 3) setClientSecret(lines[2]);
                        e.preventDefault();
                      }}
                      placeholder={'即 Azure 门户"应用程序(客户端) ID"（在概览页面复制）'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* 租户 ID（仅世纪互联需要） */}
                  {cloudType === '世纪互联' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        目录(租户) ID
                      </label>
                      <input
                        type="text"
                        value={tenantId}
                        onChange={e => setTenantId(e.target.value)}
                        placeholder={'即 Azure 门户"概述"页面的"租户 ID"'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      客户端密码值
                    </label>
                    <input
                      type="text"
                      value={clientSecret}
                      onChange={e => setClientSecret(e.target.value)}
                      placeholder={'即 Azure 门户"证书和密码"中的客户端密码值'}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setShowGuide(!showGuide)}
                      className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {showGuide ? '收起配置指南' : '查看配置指南'}
                    </button>
                  </div>

                  <button
                    onClick={handleBind}
                    disabled={isBinding || !clientId.trim() || !clientSecret.trim() || (cloudType === '世纪互联' && !tenantId.trim())}
                    className="w-full py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isBinding ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />授权中...</>
                    ) : (
                      <><Cloud className="w-4 h-4" />绑定 OneDrive 账号</>
                    )}
                  </button>

                  {/* 调试面板 */}
                  {debugLog.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowDebug(!showDebug)}
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                      >
                        🔧 调试信息 {showDebug ? '▲' : '▼'}
                      </button>
                      {showDebug && (
                        <div className="mt-2 bg-gray-900 rounded-lg p-3 text-xs font-mono space-y-1.5 max-h-64 overflow-y-auto">
                          {debugLog.map((d, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="flex-shrink-0 mt-0.5">
                                {d.status === 'pending' ? '⏳' : d.status === 'ok' ? '✅' : '❌'}
                              </span>
                              <div className="min-w-0">
                                <div className="text-gray-300">{d.step}</div>
                                <div className={`mt-0.5 break-all ${d.status === 'pending' ? 'text-yellow-400' : d.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                                  {d.detail}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

            </div>

            {/* 右侧：配置指南面板 */}
            {showGuide && (
              <div className="w-[280px] border-l border-gray-200 overflow-y-auto bg-amber-50 p-4 space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-800">☁️ 配置指南（{cloudType === '世纪互联' ? '世纪互联版' : '国际版'}</p>
                  <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2 text-xs text-amber-700">
                  <p>在 Azure 门户注册应用，授权本应用访问你的 OneDrive：</p>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第一步：注册应用 ⚠️ 必须选择多租户</p>
                    <p>1. 访问 <a href={cloudType === '世纪互联' ? 'https://portal.azure.cn' : 'https://portal.azure.com'} target="_blank" className="text-blue-600 underline">{cloudType === '世纪互联' ? 'portal.azure.cn' : 'portal.azure.com'}</a></p>
                    <p>2. 搜索 <strong>"应用注册"</strong> → <strong>"+ 新注册"</strong></p>
                    <p>3. 名称填 <code className="bg-amber-100 px-1 rounded">彩云笔记</code></p>
                    <p className="text-red-600 font-semibold">⭐ 账户类型必须选 <strong>"任何目录(Microsoft Entra ID) - 多租户)"</strong></p>
                    <p className="text-amber-600 text-[10px]">⚠️ 如果选"仅此组织目录"，会导致授权失败（AADSTS50194）</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第二步：获取 Client ID {cloudType === '世纪互联' ? '和租户 ID' : ''}</p>
                    <p>应用<strong>"概述"</strong>页面 → 复制<strong>"应用程序(客户端) ID"</strong></p>
                    {cloudType === '世纪互联' && (
                      <p className="text-red-600">⭐ 同时复制<strong>"租户 ID"</strong>（用于下方表单填写）</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第三步：创建 Client Secret</p>
                    <p>左侧 <strong>"证书和密码"</strong> → <strong>"+ 新建客户端密码"</strong> → 添加后复制<strong>"值"</strong></p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第四步：配置 Redirect URI</p>
                    <p>左侧 <strong>"身份验证"</strong> → <strong>"+ 添加平台"</strong> → <strong>"Web"</strong></p>
                    <code className="block bg-amber-100 p-1 rounded text-blue-700 break-all">http://49.235.160.8:3011/api/onedrive/callback</code>
                    <p>勾选<strong>"ID 令牌"</strong>和<strong>"访问令牌"</strong>，点击配置</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第六步：配置 API 权限</p>
                    <p>左侧 <strong>"API 权限"</strong> → <strong>"+ 添加权限"</strong> → <strong>"Microsoft Graph"</strong> → <strong>"委托的权限"</strong></p>
                    <div className="ml-1 space-y-0.5">
                      <p>• <code className="bg-amber-100 px-1 rounded">Files.ReadWrite.All</code></p>
                      <p>• <code className="bg-amber-100 px-1 rounded">User.Read</code></p>
                      <p>• <code className="bg-amber-100 px-1 rounded">offline_access</code></p>
                    </div>
                  </div>

                  <p className="text-amber-600">⚠️ 如需管理员同意，请用个人账号或联系管理员审批</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 文件管理 Tab */}
        {activeTab === 'files' && (
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : attachments.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Cloud className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无附件</p>
                <p className="text-xs mt-1">在笔记中插入附件即可在此看到</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group">
                    {getFileIcon(attachment.category)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{attachment.file_name}</p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(attachment.file_size)} · {new Date(attachment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(attachment)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="下载">
                        <Download className="w-4 h-4 text-gray-500" />
                      </button>
                      <button onClick={() => handleDelete(attachment)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="删除">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 确认弹窗 */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDanger={true}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};
