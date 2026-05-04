import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, BookOpen, ChevronDown, ChevronRight, Folder, MoreHorizontal, Trash2, Plus, User, Settings, Download, Info, Sun, Flower, Glasses, Star, Heart, Zap, Moon, Cloud, Music, Coffee, Book, Camera, Users, LogOut, Share2, X, Tag, Bell, Briefcase, Calendar, Flag, Globe, Home, Map, MessageSquare, Phone, ShoppingCart, Target, Trophy, Umbrella, Video, Wallet, Award, BookMarked, BriefcaseBusiness, Building, Car, Clock, Code, Compass, DollarSign, Droplet, Feather, FileText, FolderOpen, Gift, Globe2, Hammer, Key, Lightbulb, Link, Lock, Mail, MapPin, Monitor, Notebook, Package, Palette, Pencil, PieChart, Plane, Printer, Puzzle, Rocket, Scissors, Shield, Smile, Smartphone, Snowflake, Stamp, SunMoon, Tent, Timer, TreePine, Truck, Tv, Wrench, Send, Bug, GripVertical, Upload, Copy, RefreshCw, PanelLeftClose, PanelLeft, History } from 'lucide-react';
import { useNoteStore } from '../store/noteStore';
import { useAuth } from './AuthProvider';
import { signOut } from '../lib/auth';
import EmailAccountModal from './EmailAccountModal';
import { isAdminEmail } from '../lib/adminApi';
import { AdminConsole } from './AdminConsole';
import { ExportModal } from './ExportModal';
import { Note } from '../types';
import toast from 'react-hot-toast';
import { getSharedNotebookIds } from '../lib/initDatabase';
import { getPendingInviteCount } from '../lib/inviteService';
import { NotebookSkeleton, SectionSkeleton, PageSkeleton } from './SkeletonItems';
import { ConfirmModal } from './ConfirmModal';
import { HardDrive, Bot } from 'lucide-react';
import { uploadToOneDrive, getFileIconType, checkNotebooksStorageBatch } from '../lib/onedriveService';
import { SectionsDndArea, SectionWrapper, PageWrapper, PagesDndArea } from './DndComponents';
import { BackupHistoryModal } from './BackupHistoryModal';
import { BackupConfigModal } from './BackupConfigModal';
import { UpdateLogsModal } from './UpdateLogsModal';
import { NotebookShareModal } from './NotebookShareModal';
import { JoinNotebookModal } from './JoinNotebookModal';
import { InviteManagementModal } from './InviteManagementModal';
import { LLMConfigModal } from './LLMConfigModal';
import { CloudStorageHubModal } from './CloudStorageHubModal';
import { checkNotebooksBaiduBatch } from '../lib/baiduService';
import { checkNotebookOnedrive } from '../lib/onedriveService';
import { apiGetCloudProvider, apiSetCloudProvider } from '../lib/edgeApi';
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
  hasBaiduStorage?: boolean;
}> = ({ notebook, sections, isExpanded, isActive, activeSection, onToggle, onSectionClick, onTitleChange, onDelete, onAddSection, onShare, onIconChange, onCopyId, onViewInvites, isShared = false, isOwner = false, hasStorage = false, hasBaiduStorage = false }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [dragOverSectionIndex, setDragOverSectionIndexLocal] = useState<number | null>(null);
  const [showCloudSwitch, setShowCloudSwitch] = useState(false);
  const [cloudProvider, setCloudProvider] = useState<string | null>(null);
  const [cloudOptions, setCloudOptions] = useState<{key: string; label: string; icon: string; bound: boolean}[]>([]);
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
              {isOwner && (
                <button
                  onClick={async () => {
                    setShowCloudSwitch(true);
                    // 检查可用云存储
                    const [odRes, bdRes] = await Promise.all([
                      checkNotebookOnedrive(notebook.id).catch(() => ({bound: false})),
                      import('../lib/baiduService').then(m => m.checkNotebookBaidu(notebook.id)).catch(() => ({bound: false})),
                    ]);
                    const qnRes = await import('../lib/qiniuService').then(m => m.checkNotebookQiniu(notebook.id)).catch(() => ({bound: false}));
                    // 获取当前设置
                    const cpRes = await apiGetCloudProvider(notebook.id);
                    const current = cpRes?.success ? cpRes.data?.cloud_provider : null;
                    setCloudProvider(current);
                    setCloudOptions([
                      { key: '', label: '无（未设置）', icon: '', bound: true },
                      { key: 'onedrive', label: 'OneDrive', icon: '☁️', bound: odRes.bound },
                      { key: 'baidu', label: '百度网盘', icon: '💾', bound: bdRes.bound },
                      { key: 'qiniu', label: '七牛云', icon: '🗄️', bound: qnRes.bound },
                    ].filter(o => o.bound));
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <HardDrive className="w-4 h-4 text-orange-500" />
                  切换云存储
                </button>
              )}
              {hasStorage && (
                <div className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-500 cursor-default">
                  <HardDrive className="w-4 h-4" />
                  已绑定OneDrive储存空间
                </div>
              )}
              {hasBaiduStorage && (
                <div className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-500 cursor-default">
                  <HardDrive className="w-4 h-4" />
                  已绑定百度网盘
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
          {/* 云存储切换子菜单 */}
          {showCloudSwitch && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[60] min-w-[160px]">
              <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">选择云存储</div>
              {cloudOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={async () => {
                    await apiSetCloudProvider(notebook.id, opt.key || null);
                    setCloudProvider(opt.key || null);
                    setShowCloudSwitch(false);
                    setShowMenu(false);
                    toast.success(opt.key ? `已切换至 ${opt.label}` : '已取消云存储绑定');
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${cloudProvider === opt.key || (!cloudProvider && !opt.key) ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                  {(cloudProvider === opt.key || (!cloudProvider && !opt.key)) && <span className="ml-auto text-blue-500">✓</span>}
                </button>
              ))}
            </div>
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
  const [showCloudHub, setShowCloudHub] = useState(false);
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
  const [baiduBoundIds, setBaiduBoundIds] = useState<Set<string>>(new Set());
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
        // 同步检查百度网盘绑定
        const baiduResult = await checkNotebooksBaiduBatch(ids);
        const bdBoundSet = new Set<string>();
        baiduResult.forEach((bound, nid) => { if (bound) bdBoundSet.add(nid); });
        setBaiduBoundIds(bdBoundSet);
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
  const handleCopyNotebookId = useCallback(async (notebook: Note) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(notebook.id);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = notebook.id;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      toast.success('笔记本ID已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
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
                        hasBaiduStorage={baiduBoundIds.has(notebook.id)}
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
                    onClick={() => { setShowCloudHub(true); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Cloud className="w-4 h-4 text-indigo-500" />
                    绑定个人云盘
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
        <UpdateLogsModal isAdmin={user?.email === '767493611@qq.com'} onClose={() => setShowUpdateLogs(false)} />
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

      {/* 个人云盘绑定弹窗 */}
      {showCloudHub && (
        <CloudStorageHubModal onClose={() => setShowCloudHub(false)} />
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

