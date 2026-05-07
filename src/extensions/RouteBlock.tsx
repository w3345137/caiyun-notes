import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import './RouteBlock.css';

declare global {
  interface Window {
    AMap: any;
    AMapUI: any;
    _AMapSecurityConfig: any;
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    routeBlock: {
      insertRouteBlock: () => ReturnType;
    };
  }
}

// 高德地图 API Key - 优先从环境变量读取，否则从 localStorage 读取用户自定义
const DEFAULT_AMAP_KEY = import.meta.env.VITE_AMAP_KEY || '';
const DEFAULT_AMAP_SECURITY = import.meta.env.VITE_AMAP_SECURITY || '';

// localStorage keys
const LS_KEY_API = 'notesapp_amap_key';
const LS_KEY_SECURITY = 'notesapp_amap_security';

// 预设颜色
const MARKER_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

interface RoutePoint {
  id: string;
  name: string;
  address?: string;
  lng: number;
  lat: number;
  stayDuration: number;
  color: string;       // 标记颜色
}

interface RouteLeg {
  from: string;
  to: string;
  distance: number;
  duration: number;
  arriveTime: string;
}

interface RouteBlockAttrs {
  points: RoutePoint[];
  departTime: string;
  legs: RouteLeg[];
  mode: 'route' | 'markers';     // 路线规划 / 标记地图
  labelMode: 'index' | 'name';   // 序号 / 名称
}

// ===== 工具函数 =====
const getApiKey = () => localStorage.getItem(LS_KEY_API) || DEFAULT_AMAP_KEY;
const getApiSecurity = () => localStorage.getItem(LS_KEY_SECURITY) || DEFAULT_AMAP_SECURITY;

const loadAMapScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.AMap) { resolve(); return; }
    window._AMapSecurityConfig = { securityJsCode: getApiSecurity() };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${getApiKey()}&plugin=AMap.Driving,AMap.PlaceSearch`;
    script.async = true;
    script.onload = () => {
      const check = setInterval(() => {
        if (window.AMap && typeof window.AMap.Map === 'function') {
          clearInterval(check);
          resolve();
        }
      }, 50);
    };
    script.onerror = () => reject(new Error('SDK 加载失败'));
    document.head.appendChild(script);
  });
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
};

const formatDistance = (meters: number): string => {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
};

const calcArriveTime = (departTime: string, durationSeconds: number): string => {
  const [h, m] = departTime.split(':').map(Number);
  const totalMins = h * 60 + m + Math.floor(durationSeconds / 60);
  return `${String(Math.floor(totalMins / 60) % 24).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
};

const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

// ===== API Key 设置面板 =====
const ApiKeySettings: React.FC<{
  show: boolean;
  onClose: () => void;
}> = ({ show, onClose }) => {
  const [key, setKey] = useState(localStorage.getItem(LS_KEY_API) || '');
  const [security, setSecurity] = useState(localStorage.getItem(LS_KEY_SECURITY) || '');

  if (!show) return null;

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem(LS_KEY_API, key.trim());
      localStorage.setItem(LS_KEY_SECURITY, security.trim());
    } else {
      localStorage.removeItem(LS_KEY_API);
      localStorage.removeItem(LS_KEY_SECURITY);
    }
    onClose();
  };

  const handleReset = () => {
    localStorage.removeItem(LS_KEY_API);
    localStorage.removeItem(LS_KEY_SECURITY);
    setKey('');
    setSecurity('');
  };

  return (
    <div className="route-settings-overlay" onClick={onClose}>
      <div className="route-settings-panel" onClick={e => e.stopPropagation()}>
        <div className="route-settings-title">地图 API 设置</div>
        <div className="route-settings-desc">
          使用自有高德地图 API Key，避免公共 Key 并发超限。
          <br />留空则使用公共 Key。
        </div>
        <label className="route-settings-label">
          API Key
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="输入自有 API Key（留空使用默认）"
            className="route-settings-input"
          />
        </label>
        <label className="route-settings-label">
          安全密钥
          <input
            type="text"
            value={security}
            onChange={e => setSecurity(e.target.value)}
            placeholder="输入安全密钥（留空使用默认）"
            className="route-settings-input"
          />
        </label>
        <div className="route-settings-actions">
          <button className="route-settings-btn secondary" onClick={handleReset}>恢复默认</button>
          <button className="route-settings-btn primary" onClick={handleSave}>保存</button>
        </div>
        <div className="route-settings-note">
          ⚠️ 更换 Key 后需刷新页面生效
        </div>
      </div>
    </div>
  );
};

// ===== 左侧列表区 =====
interface ListPanelProps {
  points: RoutePoint[];
  departTime: string;
  legs: RouteLeg[];
  mode: 'route' | 'markers';
  labelMode: 'index' | 'name';
  onPointsChange: (points: RoutePoint[]) => void;
  onDepartTimeChange: (time: string) => void;
  onLegsChange: (legs: RouteLeg[]) => void;
  onModeChange: (mode: 'route' | 'markers') => void;
  onLabelModeChange: (mode: 'index' | 'name') => void;
  onCopy: () => void;
}

const ListPanel: React.FC<ListPanelProps> = ({
  points, departTime, legs, mode, labelMode,
  onPointsChange, onDepartTimeChange, onLegsChange,
  onModeChange, onLabelModeChange, onCopy,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const placeSearchRef = useRef<any>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  // 初始化搜索 SDK（轻量，只加载搜索插件）
  useEffect(() => {
    loadAMapScript()
      .then(() => {
        window.AMap.plugin('AMap.PlaceSearch', () => {
          placeSearchRef.current = new window.AMap.PlaceSearch({ pageSize: 5, pageIndex: 1 });
          setSdkReady(true);
        });
      })
      .catch(() => setSdkError('搜索服务加载失败'));
  }, []);

  const searchPlace = useCallback((keyword: string) => {
    if (!placeSearchRef.current || !keyword.trim()) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    placeSearchRef.current.search(keyword, (status: string, result: any) => {
      setIsSearching(false);
      const pois = result?.poiList?.pois || [];
      if (status === 'complete' && pois.length > 0) {
        setSuggestions(pois.map((poi: any) => ({
          name: poi.name,
          address: poi.address || poi.district || '',
          location: poi.location,
        })).filter((t: any) => t.location).slice(0, 5));
      } else {
        setSuggestions([]);
      }
    });
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchPlace(value), 300);
  };

  const addPoint = (suggestion: any) => {
    let lng: number, lat: number;
    if (typeof suggestion.location === 'string') {
      [lng, lat] = suggestion.location.split(',').map(Number);
    } else {
      lng = suggestion.location.lng;
      lat = suggestion.location.lat;
    }
    const newPoint: RoutePoint = {
      id: uuidv4(),
      name: suggestion.name,
      address: suggestion.address || '',
      lng, lat,
      stayDuration: 30,
      color: MARKER_COLORS[points.length % MARKER_COLORS.length],
    };
    onPointsChange([...points, newPoint]);
    setSearchInput('');
    setSuggestions([]);
  };

  const removePoint = (id: string) => {
    onPointsChange(points.filter(p => p.id !== id));
  };

  const updatePointColor = (id: string, color: string) => {
    onPointsChange(points.map(p => p.id === id ? { ...p, color } : p));
  };

  // 拖拽排序
  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newPoints = [...points];
    const [dragged] = newPoints.splice(draggedIndex, 1);
    newPoints.splice(index, 0, dragged);
    onPointsChange(newPoints);
    onLegsChange([]);
    setDraggedIndex(index);
  };
  const handleDragEnd = () => setDraggedIndex(null);

  return (
    <div className="route-list-panel">
      {sdkError && <div className="route-list-state error">❌ {sdkError}</div>}
      {!sdkReady && !sdkError && (
        <div className="route-list-state"><div className="route-spinner" /><span>搜索服务加载中...</span></div>
      )}

      {/* 搜索框 */}
      <div className="route-search">
        <input
          type="text"
          placeholder="🔍 搜索地点..."
          value={searchInput}
          onChange={e => handleSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && suggestions.length > 0) addPoint(suggestions[0]); }}
          className="route-search-input"
        />
        {isSearching && <div className="route-search-loading">搜索中...</div>}
        {suggestions.length > 0 && (
          <div className="route-suggestions">
            {suggestions.map((s, i) => (
              <div key={i} className="route-suggestion-item" onClick={() => addPoint(s)}>
                <div className="suggestion-name">{s.name}</div>
                <div className="suggestion-address">{s.address}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 模式切换 */}
      <div className="route-mode-switch">
        <button
          className={`route-mode-btn ${mode === 'route' ? 'active' : ''}`}
          onClick={() => onModeChange('route')}
        >🚗 路线规划</button>
        <button
          className={`route-mode-btn ${mode === 'markers' ? 'active' : ''}`}
          onClick={() => onModeChange('markers')}
        >📍 标记地图</button>
      </div>

      {/* 标记模式下：显示模式切换 */}
      {mode === 'markers' && (
        <div className="route-label-switch">
          <span>标记显示：</span>
          <button
            className={`route-label-btn ${labelMode === 'index' ? 'active' : ''}`}
            onClick={() => onLabelModeChange('index')}
          >序号</button>
          <button
            className={`route-label-btn ${labelMode === 'name' ? 'active' : ''}`}
            onClick={() => onLabelModeChange('name')}
          >名称</button>
        </div>
      )}

      {/* 路线模式下：出发时间 */}
      {mode === 'route' && (
        <div className="route-depart">
          <span>出发时间：</span>
          <input
            type="time"
            value={departTime}
            onChange={e => onDepartTimeChange(e.target.value)}
            className="route-time-input"
          />
        </div>
      )}

      {/* 地点列表 */}
      <div className="route-points">
        {points.map((point, index) => (
          <React.Fragment key={point.id}>
            {mode === 'route' && index > 0 && legs[index - 1] && (
              <div className="route-leg">
                <span className="leg-arrow">↓</span>
                <span className="leg-info">
                  {formatDistance(legs[index - 1].distance)} / {formatDuration(legs[index - 1].duration)}
                </span>
                <span className="leg-arrive">到达 {legs[index - 1].arriveTime}</span>
              </div>
            )}
            <div
              className={`route-point ${draggedIndex === index ? 'dragging' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <span className="point-drag">≡</span>
              {/* 颜色标记 */}
              <input
                type="color"
                value={point.color}
                onChange={e => updatePointColor(point.id, e.target.value)}
                className="point-color-picker"
                title="标记颜色"
              />
              <span className="point-name">{point.name}</span>
              {mode === 'route' && (
                <span className="point-stay">
                  <input
                    type="number" min="0" max="480"
                    value={point.stayDuration}
                    onChange={e => {
                      const v = Math.max(0, Math.min(480, parseInt(e.target.value) || 0));
                      onPointsChange(points.map(p => p.id === point.id ? { ...p, stayDuration: v } : p));
                    }}
                    onClick={e => e.stopPropagation()}
                    className="route-stay-input"
                  />
                  <span className="stay-unit">分钟</span>
                </span>
              )}
              <button className="point-remove" onClick={() => removePoint(point.id)}>×</button>
            </div>
          </React.Fragment>
        ))}
        {points.length === 0 && (
          <div className="route-empty">搜索并添加地点开始规划</div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="route-list-footer">
        {mode === 'route' && (
          <button
            onClick={onCopy}
            className="route-copy-btn"
            disabled={legs.length === 0}
          >📋 复制行程到笔记</button>
        )}
      </div>
    </div>
  );
};

// ===== 右侧地图区 =====
interface MapPanelProps {
  points: RoutePoint[];
  departTime: string;
  mode: 'route' | 'markers';
  labelMode: 'index' | 'name';
  legs: RouteLeg[];
  onLegsChange: (legs: RouteLeg[]) => void;
  onExport: () => void;
  onMapReady?: (map: any | null) => void;
}

const MapPanel: React.FC<MapPanelProps> = ({
  points, departTime, mode, labelMode, legs, onLegsChange, onExport, onMapReady,
}) => {
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [manualTrigger, setManualTrigger] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const pointsRef = useRef(points);
  const departTimeRef = useRef(departTime);
  const onLegsChangeRef = useRef(onLegsChange);

  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { departTimeRef.current = departTime; }, [departTime]);
  useEffect(() => { onLegsChangeRef.current = onLegsChange; }, [onLegsChange]);

  // 初始化地图（仅在手动触发或标记模式时）
  const initMap = useCallback(async () => {
    if (mapInstanceRef.current) return; // 已经初始化
    try {
      await loadAMapScript();
      if (!mapRef.current) return;

      const map = new window.AMap.Map(mapRef.current, {
        zoom: 10,
        center: [116.397428, 39.90923],
        viewMode: '2D',
      });
      mapInstanceRef.current = map;
      onMapReady?.(map);
      setSdkLoaded(true);
      setMapReady(true);
    } catch {
      setMapError('地图加载失败');
    }
  }, [onMapReady]);

  // 更新标记点（标记模式 & 路线模式通用）
  const updateMarkers = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 清除旧标记
    markersRef.current.forEach(m => map.remove(m));
    markersRef.current = [];

    points.forEach((point, index) => {
      const displayText = labelMode === 'index' ? String(index + 1) : point.name;
      const marker = new window.AMap.Marker({
        position: [point.lng, point.lat],
        title: `${index + 1}. ${point.name}`,
        label: {
          content: `<div style="
            background:${point.color || '#3b82f6'};
            color:#fff;
            padding:2px 6px;
            border-radius:4px;
            font-size:12px;
            white-space:nowrap;
            max-width:120px;
            overflow:hidden;
            text-overflow:ellipsis;
          ">${displayText}</div>`,
          offset: new window.AMap.Pixel(-20, -30),
        },
      });
      map.add(marker);
      markersRef.current.push(marker);
    });

    // 自适应视野
    if (points.length > 0) {
      const lngs = points.map(p => p.lng);
      const lats = points.map(p => p.lat);
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      map.setCenter([centerLng, centerLat]);
      const maxRange = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
      let zoom = 6;
      if (maxRange < 0.5) zoom = 12;
      else if (maxRange < 2) zoom = 10;
      else if (maxRange < 10) zoom = 7;
      else zoom = 5;
      map.setZoom(zoom);
    }
  }, [points, labelMode]);

  // 路线规划（仅路线模式）
  const calculateRoute = useCallback(async () => {
    const map = mapInstanceRef.current;
    if (!map || points.length < 2) return;

    // 清除旧路线
    if (polylineRef.current) {
      map.remove(polylineRef.current);
      polylineRef.current = null;
    }

    setIsCalculating(true);

    // 确保 Driving 插件已加载
    await new Promise<void>(resolve => {
      if (window.AMap.Driving) { resolve(); return; }
      window.AMap.plugin('AMap.Driving', () => resolve());
    });

    // 创建独立的 Driving 实例（不绑定 map，避免自动渲染覆盖物覆盖前段路线）
    const driving = new window.AMap.Driving({
      showTraffic: false,
      hideMarkers: true,
    });

    // 逐段规划路线，同时收集路径点和 legs 信息
    const allPaths: any[] = [];
    const newLegs: RouteLeg[] = [];
    let currentTime = departTimeRef.current;

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      await new Promise<void>(resolve => {
        driving.search(
          new window.AMap.LngLat(from.lng, from.lat),
          new window.AMap.LngLat(to.lng, to.lat),
          {},
          (status: string, result: any) => {
            if (status === 'complete' && result.routes?.length > 0) {
              const route = result.routes[0];
              // 收集路径点（兼容 LngLat 对象和数组两种格式）
              const segPath = (route.path || []).map((p: any) => {
                if (Array.isArray(p)) return p;
                if (typeof p.lng === 'number' && typeof p.lat === 'number') return [p.lng, p.lat];
                if (typeof p.getLng === 'function') return [p.getLng(), p.getLat()];
                return null;
              }).filter(Boolean);
              allPaths.push(...segPath);

              // 计算 legs 信息
              const arriveTime = calcArriveTime(currentTime, route.time);
              newLegs.push({
                from: from.name,
                to: to.name,
                distance: route.distance,
                duration: route.time,
                arriveTime,
              });
              currentTime = calcArriveTime(arriveTime, to.stayDuration * 60);
            }
            resolve();
          }
        );
      });
      if (i < points.length - 2) await new Promise(r => setTimeout(r, 500));
    }

    // 渲染完整路线（所有段合为一条 Polyline）
    if (allPaths.length > 0) {
      polylineRef.current = new window.AMap.Polyline({
        path: allPaths,
        strokeColor: '#3b82f6',
        strokeWeight: 5,
        lineJoin: 'round',
        lineCap: 'round',
      });
      map.add(polylineRef.current);
      // 自适应视野到路线范围
      map.setFitView([polylineRef.current], false, [60, 60, 60, 60]);
    }

    onLegsChangeRef.current(newLegs);
    setIsCalculating(false);
  }, [points]);

  // 手动触发：初始化地图 + 规划
  const handleStartMap = useCallback(async () => {
    await initMap();
    setManualTrigger(true);
  }, [initMap]);

  const handlePlanRoute = useCallback(async () => {
    if (!mapInstanceRef.current) {
      await initMap();
    }
    setManualTrigger(true);
    // 等地图 ready 后规划
    setTimeout(() => {
      updateMarkers();
      calculateRoute();
    }, 200);
  }, [initMap, updateMarkers, calculateRoute]);

  // 地图初始化后，标记模式下自动更新标记
  useEffect(() => {
    if (mapReady && manualTrigger) {
      updateMarkers();
    }
  }, [mapReady, manualTrigger, updateMarkers, points, labelMode]);

  // 清理
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
        onMapReady?.(null);
      }
    };
  }, [onMapReady]);

  return (
    <div className="route-map-panel" ref={mapRef}>
      {mapError && (
        <div className="route-map-error"><span>❌ {mapError}</span></div>
      )}
      {/* 未初始化时：显示开始按钮 */}
      {!sdkLoaded && !mapError && (
        <div className="route-map-prompt">
          {mode === 'route' ? (
            <button className="route-start-btn" onClick={handlePlanRoute}>
              🚗 开始规划路线
            </button>
          ) : (
            <button className="route-start-btn" onClick={handleStartMap}>
              📍 显示标记地图
            </button>
          )}
          <div className="route-map-prompt-hint">
            点击后加载地图（避免自动占用资源）
          </div>
        </div>
      )}
      {/* SDK 加载中 */}
      {sdkLoaded && !mapReady && !mapError && (
        <div className="route-map-loading"><div className="route-spinner" /><span>地图加载中...</span></div>
      )}
      {/* 路线模式：已初始化地图，显示重新规划按钮 */}
      {mapReady && mode === 'route' && (
        <div className="route-map-toolbar">
          <button className="route-toolbar-btn" onClick={() => { updateMarkers(); calculateRoute(); }}>
            🔄 重新规划
          </button>
        </div>
      )}
      {/* 标记模式：已初始化地图，显示导出按钮 */}
      {mapReady && mode === 'markers' && (
        <div className="route-map-toolbar">
          <button className="route-toolbar-btn" onClick={onExport}>
            📥 导出地图
          </button>
        </div>
      )}
      {/* 计算中 */}
      {isCalculating && (
        <div className="route-map-calculating">
          <div className="route-spinner" /><span>计算路线中...</span>
        </div>
      )}
    </div>
  );
};

// ===== 导出面板 =====
const ExportPanel: React.FC<{
  points: RoutePoint[];
  mapInstance: any;
  onClose: () => void;
}> = ({ points, mapInstance, onClose }) => {
  const [exporting, setExporting] = useState(false);

  const handleExportImage = useCallback(() => {
    if (points.length === 0) return;
    setExporting(true);

    try {
      // 使用高德静态地图 API 生成图片
      const key = getApiKey();
      const size = '800x600';

      // 计算 markers 参数
      const markersParts = points.map((p, i) => {
        const label = String(i + 1);
        // 格式: style锚点,label经度,lat
        return `mid,${label},${p.lng},${p.lat}`;
      });
      const markersStr = markersParts.join('|');

      // 计算中心点和缩放级别
      const lngs = points.map(p => p.lng);
      const lats = points.map(p => p.lat);
      const centerLng = ((Math.min(...lngs) + Math.max(...lngs)) / 2).toFixed(6);
      const centerLat = ((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(6);
      const maxRange = Math.max(
        Math.max(...lngs) - Math.min(...lngs),
        Math.max(...lats) - Math.min(...lats)
      );
      let zoom = 10;
      if (maxRange < 0.05) zoom = 15;
      else if (maxRange < 0.2) zoom = 13;
      else if (maxRange < 0.5) zoom = 12;
      else if (maxRange < 2) zoom = 10;
      else if (maxRange < 5) zoom = 8;
      else if (maxRange < 10) zoom = 7;
      else zoom = 5;

      const url = `https://restapi.amap.com/v3/staticmap?key=${key}&location=${centerLng},${centerLat}&zoom=${zoom}&size=${size}&markers=${encodeURIComponent(markersStr)}&traffic=0`;

      // 下载图片
      const link = document.createElement('a');
      link.download = `地图导出_${new Date().toLocaleDateString()}.png`;
      link.href = url;
      link.target = '_blank';
      link.click();
    } catch {
      alert('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }, [points]);

  const handleExportCSV = useCallback(() => {
    if (points.length === 0) return;
    let csv = '\uFEFF序号,名称,地址,经度,纬度,颜色\n';
    points.forEach((p, i) => {
      csv += `${i + 1},"${p.name}","${p.address || ''}",${p.lng},${p.lat},"${p.color}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = `标记点_${new Date().toLocaleDateString()}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
  }, [points]);

  return (
    <div className="route-settings-overlay" onClick={onClose}>
      <div className="route-settings-panel" onClick={e => e.stopPropagation()}>
        <div className="route-settings-title">📥 导出地图</div>

        <div className="route-export-section">
          <div className="route-export-label">标记点列表</div>
          <table className="route-export-table">
            <thead>
              <tr><th>序号</th><th>名称</th><th>地址</th><th>颜色</th></tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{p.name}</td>
                  <td>{p.address || '-'}</td>
                  <td><span className="export-color-dot" style={{ background: p.color }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="route-settings-actions">
          <button className="route-settings-btn secondary" onClick={handleExportCSV}>
            📊 导出 CSV
          </button>
          <button className="route-settings-btn primary" onClick={handleExportImage}>
            🖼️ 导出地图图片
          </button>
        </div>

        <button className="route-settings-btn secondary" style={{ marginTop: 8, width: '100%' }} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
};

// ===== 主组件 =====
const RouteBlockView: React.FC<{
  node: any;
  updateAttributes: any;
  selected: boolean;
  deleteNode: any;
  getPos: any;
  editor: any;
}> = ({ node, updateAttributes, selected, deleteNode }) => {
  const attrs = node.attrs || {};
  const [points, setPoints] = useState<RoutePoint[]>(attrs.points || []);
  const [departTime, setDepartTime] = useState(attrs.departTime || '08:00');
  const [legs, setLegs] = useState<RouteLeg[]>(attrs.legs || []);
  const [mode, setMode] = useState<'route' | 'markers'>(attrs.mode || 'route');
  const [labelMode, setLabelMode] = useState<'index' | 'name'>(attrs.labelMode || 'index');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const mapInstanceRef = useRef<any>(null);

  const handlePointsChange = useCallback((newPoints: RoutePoint[]) => {
    setPoints(newPoints);
    updateAttributes({ points: newPoints });
  }, [updateAttributes]);

  const handleDepartTimeChange = useCallback((newTime: string) => {
    setDepartTime(newTime);
    updateAttributes({ departTime: newTime });
  }, [updateAttributes]);

  const handleLegsChange = useCallback((newLegs: RouteLeg[]) => {
    setLegs(newLegs);
    updateAttributes({ legs: newLegs });
  }, [updateAttributes]);

  const handleModeChange = useCallback((newMode: 'route' | 'markers') => {
    setMode(newMode);
    setLegs([]);
    updateAttributes({ mode: newMode, legs: [] });
  }, [updateAttributes]);

  const handleLabelModeChange = useCallback((newLabelMode: 'index' | 'name') => {
    setLabelMode(newLabelMode);
    updateAttributes({ labelMode: newLabelMode });
  }, [updateAttributes]);

  const handleCopyToNote = useCallback(() => {
    if (legs.length === 0) return;
    let text = `🚗 行程规划 (${departTime} 出发)\n\n`;
    legs.forEach((leg, i) => {
      text += `${i + 1}. ${leg.from} → ${leg.to}\n`;
      text += `   距离: ${formatDistance(leg.distance)} | 时长: ${formatDuration(leg.duration)}\n`;
      text += `   到达: ${leg.arriveTime}\n`;
      if (i < points.length - 1 && points[i + 1].stayDuration > 0) {
        text += `   停留: ${points[i + 1].stayDuration}分钟\n`;
      }
      text += '\n';
    });
    copyToClipboard(text);
  }, [legs, departTime, points]);

  return (
    <NodeViewWrapper className="route-block-wrapper">
      <div className={`route-block ${selected ? 'selected' : ''}`}>
        {/* 头部 */}
        <div className="route-header">
          <span className="route-title">
            {mode === 'route' ? '🚗 行程规划' : '📍 标记地图'}
          </span>
          <div className="route-actions">
            <button onClick={() => setShowApiSettings(true)} className="route-btn" title="API Key 设置">
              ⚙️
            </button>
            <button onClick={() => deleteNode()} className="route-btn" title="删除">🗑️</button>
          </div>
        </div>

        {/* 主体 */}
        <div className="route-body">
          <ListPanel
            points={points}
            departTime={departTime}
            legs={legs}
            mode={mode}
            labelMode={labelMode}
            onPointsChange={handlePointsChange}
            onDepartTimeChange={handleDepartTimeChange}
            onLegsChange={handleLegsChange}
            onModeChange={handleModeChange}
            onLabelModeChange={handleLabelModeChange}
            onCopy={handleCopyToNote}
          />
          <MapPanel
            points={points}
            departTime={departTime}
            mode={mode}
            labelMode={labelMode}
            legs={legs}
            onLegsChange={handleLegsChange}
            onExport={() => setShowExport(true)}
            onMapReady={(map) => { mapInstanceRef.current = map; }}
          />
        </div>
      </div>

      <ApiKeySettings show={showApiSettings} onClose={() => setShowApiSettings(false)} />
      {showExport && (
        <ExportPanel
          points={points}
          mapInstance={mapInstanceRef.current}
          onClose={() => setShowExport(false)}
        />
      )}
    </NodeViewWrapper>
  );
};

// ===== TipTap Node 定义 =====
export const RouteBlock = Node.create({
  name: 'routeBlock',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      points: { default: [] },
      departTime: { default: '08:00' },
      legs: { default: [] },
      mode: { default: 'route' },
      labelMode: { default: 'index' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-route-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-route-block': '',
      class: 'route-block-wrapper',
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RouteBlockView);
  },

  addCommands() {
    return {
      insertRouteBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              points: [],
              departTime: '08:00',
              legs: [],
              mode: 'route',
              labelMode: 'index',
            },
          });
        },
    };
  },
});

export default RouteBlock;
