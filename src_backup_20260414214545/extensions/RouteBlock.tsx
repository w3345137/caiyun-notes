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

// 高德地图 API Key
const AMAP_KEY = '9c1d077b3fa7e2dc92f90580d5e768e9';
// 高德地图安全密钥
const AMAP_SECURITY_CODE = '3f3cbacb34cf33d01945a67c82f16721';

interface RoutePoint {
  id: string;
  name: string;
  address?: string;
  lng: number;
  lat: number;
  stayDuration: number; // 停留时间（分钟），默认30
}

interface RouteLeg {
  from: string;
  to: string;
  distance: number; // 米
  duration: number; // 秒
  arriveTime: string;
}

interface RouteBlockAttrs {
  points: RoutePoint[];
  departTime: string; // HH:mm
  legs: RouteLeg[];
}

// 加载高德地图 SDK
const loadAMapScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.AMap) {
      resolve();
      return;
    }

    // 设置安全密钥
    window._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_CODE,
    };

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Driving,AMap.PlaceSearch`;
    script.async = true;
    script.onload = () => {
      // 等待 AMap 真正初始化
      const checkAMap = setInterval(() => {
        if (window.AMap && typeof window.AMap.Map === 'function') {
          clearInterval(checkAMap);
          resolve();
        }
      }, 50);
    };
    script.onerror = () => {
      reject(new Error('SDK 加载失败'));
    };
    document.head.appendChild(script);
  });
};

// 格式化时间
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}min`;
  }
  return `${mins}min`;
};

// 格式化距离
const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${meters}m`;
};

// 计算到达时间
const calcArriveTime = (departTime: string, durationSeconds: number): string => {
  const [h, m] = departTime.split(':').map(Number);
  const totalMins = h * 60 + m + Math.floor(durationSeconds / 60);
  const arriveH = Math.floor(totalMins / 60) % 24;
  const arriveM = totalMins % 60;
  return `${String(arriveH).padStart(2, '0')}:${String(arriveM).padStart(2, '0')}`;
};

// 复制到剪贴板
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

// ==================== 左侧列表区 ====================
interface ListPanelProps {
  points: RoutePoint[];
  departTime: string;
  legs: RouteLeg[];
  onPointsChange: (points: RoutePoint[]) => void;
  onDepartTimeChange: (time: string) => void;
  onLegsChange: (legs: RouteLeg[]) => void;
  onCopy: () => void;
}

const ListPanel: React.FC<ListPanelProps> = ({
  points,
  departTime,
  legs,
  onPointsChange,
  onDepartTimeChange,
  onLegsChange,
  onCopy,
}) => {
  const [listReady, setListReady] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const placeSearchRef = useRef<any>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 初始化 PlaceSearch
  useEffect(() => {
    loadAMapScript()
      .then(() => {
        window.AMap.plugin('AMap.PlaceSearch', () => {
          placeSearchRef.current = new window.AMap.PlaceSearch({ pageSize: 5, pageIndex: 1 });
          setListReady(true);
        });
      })
      .catch(() => {
        setListError('搜索服务加载失败');
      });
  }, []);

  // 搜索地点
  const searchPlace = useCallback((keyword: string) => {
    if (!placeSearchRef.current || !keyword.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    placeSearchRef.current.search(keyword, (status: string, result: any) => {
      setIsSearching(false);
      // 高德 API 返回: result.poiList.pois
      const pois = result?.poiList?.pois || [];
      if (status === 'complete' && pois.length > 0) {
        const tips = pois.map((poi: any) => ({
          name: poi.name,
          address: poi.address || poi.district || '',
          location: poi.location,
        })).filter((tip: any) => tip.location).slice(0, 5);
        setSuggestions(tips);
      } else {
        setSuggestions([]);
      }
    });
  }, []);

  // 防抖搜索
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchPlace(value), 300);
  };

  // 添加地点
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
      lng,
      lat,
      stayDuration: 30, // 默认停留30分钟
    };
    onPointsChange([...points, newPoint]);
    setSearchInput('');
    setSuggestions([]);
  };

  // 删除地点
  const removePoint = (id: string) => {
    onPointsChange(points.filter((p) => p.id !== id));
  };

  // 拖拽排序
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newPoints = [...points];
    const [dragged] = newPoints.splice(draggedIndex, 1);
    newPoints.splice(index, 0, dragged);
    onPointsChange(newPoints);
    // 拖拽后清空 legs，重新计算
    onLegsChange([]);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // 计算路线（暴露给外部调用）
  const calculateRoute = useCallback(async () => {
    // 这个函数由 MapPanel 调用，不在这里实现
  }, []);

  // ==================== 渲染 ====================
  return (
    <div className={`route-list-panel ${!listReady ? 'route-list-loading' : ''} ${listError ? 'route-list-error' : ''}`}>
      {listError && (
        <div className="route-list-state">
          <span>❌ {listError}</span>
        </div>
      )}
      {!listReady && !listError && (
        <div className="route-list-state">
          <div className="route-spinner" />
          <span>搜索服务加载中...</span>
        </div>
      )}
      {/* 搜索框 */}
      <div className="route-search">
        <input
          type="text"
          placeholder="🔍 搜索地点..."
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && suggestions.length > 0) {
              addPoint(suggestions[0]);
            }
          }}
          className="route-search-input"
        />
        {isSearching && <div className="route-search-loading">搜索中...</div>}
        {suggestions.length > 0 && (
          <div className="route-suggestions">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="route-suggestion-item"
                onClick={() => addPoint(s)}
              >
                <div className="suggestion-name">{s.name}</div>
                <div className="suggestion-address">{s.address}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 地点列表 */}
      <div className="route-points">
        <div className="route-depart">
          <span>出发时间：</span>
          <input
            type="time"
            value={departTime}
            onChange={(e) => onDepartTimeChange(e.target.value)}
            className="route-time-input"
          />
        </div>

        {points.map((point, index) => (
          <React.Fragment key={point.id}>
            {index > 0 && legs[index - 1] && (
              <div className="route-leg">
                <span className="leg-arrow">↓</span>
                <span className="leg-info">
                  {formatDistance(legs[index - 1].distance)} / {formatDuration(legs[index - 1].duration)}
                </span>
                <span className="leg-arrive">
                  到达 {legs[index - 1].arriveTime}
                </span>
              </div>
            )}
            <div
              className={`route-point ${draggedIndex === index ? 'dragging' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <span className="point-drag">≡</span>
              <span className="point-index">{index + 1}</span>
              <span className="point-name">{point.name}</span>
              <span className="point-stay">
                <input
                  type="number"
                  min="0"
                  max="480"
                  value={point.stayDuration}
                  onChange={(e) => {
                    const newPoints = points.map((p) =>
                      p.id === point.id
                        ? { ...p, stayDuration: Math.max(0, Math.min(480, parseInt(e.target.value) || 0)) }
                        : p
                    );
                    onPointsChange(newPoints);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="route-stay-input"
                />
                <span className="stay-unit">分钟</span>
              </span>
              <button
                className="point-remove"
                onClick={() => removePoint(point.id)}
              >
                ×
              </button>
            </div>
          </React.Fragment>
        ))}

        {points.length === 0 && (
          <div className="route-empty">搜索并添加地点开始规划</div>
        )}
      </div>

      {/* 复制按钮 */}
      <button
        onClick={onCopy}
        className="route-copy-btn"
        disabled={legs.length === 0 && points.length < 2}
      >
        📋 复制到笔记
      </button>
    </div>
  );
};

// ==================== 右侧地图区 ====================
interface MapPanelProps {
  points: RoutePoint[];
  departTime: string;
  onLegsChange: (legs: RouteLeg[]) => void;
  refreshKey?: number; // 刷新触发器
}

const MapPanel: React.FC<MapPanelProps> = ({
  points,
  departTime,
  onLegsChange,
  refreshKey = 0,
}) => {
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const drivingInstanceRef = useRef<any>(null);
  const drivingForMapRef = useRef<any>(null); // 专门用于地图渲染的 driving 实例
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  // 用 ref 存储最新值，避免闭包问题
  const pointsRef = useRef(points);
  const departTimeRef = useRef(departTime);
  const onLegsChangeRef = useRef(onLegsChange);

  // 同步最新值
  useEffect(() => {
    pointsRef.current = points;
    departTimeRef.current = departTime;
    onLegsChangeRef.current = onLegsChange;
  });

  // 初始化地图
  useEffect(() => {
    loadAMapScript()
      .then(() => {
        if (!mapRef.current) {
          setMapError('地图容器不存在');
          return;
        }

        const map = new window.AMap.Map(mapRef.current, {
          zoom: 10,
          center: [116.397428, 39.90923],
          viewMode: '2D',
        });
        mapInstanceRef.current = map;

        window.AMap.plugin('AMap.Driving', () => {
          drivingInstanceRef.current = new window.AMap.Driving({
            map,
            showTraffic: false,
            hideMarkers: true,
          });
          // 创建第二个 driving 实例专门用于地图路线渲染，避免与 calculateLegs 冲突
          drivingForMapRef.current = new window.AMap.Driving({
            map,
            showTraffic: false,
            hideMarkers: true,
          });
          setMapReady(true);
        });
      })
      .catch(() => {
        setMapError('地图加载失败');
      });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 更新地图标记和路线
  const updateMapRoute = useCallback(async () => {
    const map = mapInstanceRef.current;
    const driving = drivingForMapRef.current;
    const currentPoints = pointsRef.current;
    if (!map || !driving || currentPoints.length < 2) return;

    console.log('[MapPanel] 更新路线, points:', currentPoints.length);

    // 清除旧标记和路线
    markersRef.current.forEach((m) => map.remove(m));
    markersRef.current = [];
    if (polylineRef.current) {
      map.remove(polylineRef.current);
      polylineRef.current = null;
    }

    // 添加新标记
    currentPoints.forEach((point, index) => {
      const marker = new window.AMap.Marker({
        position: [point.lng, point.lat],
        title: `${index + 1}. ${point.name}`,
        label: {
          content: String(index + 1),
          offset: [-8, -5],
        },
      });
      map.add(marker);
      markersRef.current.push(marker);
    });

    // 对每相邻两点分别规划路线，然后合并所有路径
    setIsCalculating(true);
    const allPaths: any[] = [];

    console.log('[MapPanel] 开始规划路线，共', currentPoints.length, '个点，', currentPoints.length - 1, '段');

    for (let i = 0; i < currentPoints.length - 1; i++) {
      const from = currentPoints[i];
      const to = currentPoints[i + 1];

      console.log(`[MapPanel] 规划第 ${i + 1} 段: ${from.name} → ${to.name}`);

      await new Promise<void>((resolve) => {
        driving.search(
          new window.AMap.LngLat(from.lng, from.lat),
          new window.AMap.LngLat(to.lng, to.lat),
          {},
          (status: string, result: any) => {
            if (status === 'complete' && result.routes && result.routes.length > 0) {
              const route = result.routes[0];
              
              // 高德地图返回的 route.path 是完整路径点数组
              if (route.path && route.path.length > 0) {
                const segPath = route.path.map((p: any) => {
                  if (Array.isArray(p)) return p;
                  if (typeof p.lng === 'number' && typeof p.lat === 'number') return [p.lng, p.lat];
                  return null;
                }).filter(Boolean);
                console.log(`[MapPanel] 第 ${i + 1} 段从 route.path 获得 ${segPath.length} 个路径点`);
                allPaths.push(...segPath);
              }
              // 从 steps 提取路径
              else if (route.steps && route.steps.length > 0) {
                const segPath: any[] = [];
                route.steps.forEach((step: any, idx: number) => {
                  // 尝试获取更详细的路径
                  if (step.path && step.path.length > 0) {
                    step.path.forEach((p: any) => {
                      if (Array.isArray(p)) segPath.push(p);
                      else if (typeof p.lng === 'number' && typeof p.lat === 'number') {
                        segPath.push([p.lng, p.lat]);
                      }
                    });
                  } else {
                    // 退而求其次，使用 start_location
                    if (step.start_location) {
                      segPath.push([step.start_location.lng, step.start_location.lat]);
                    }
                    if (idx === route.steps.length - 1 && step.end_location) {
                      segPath.push([step.end_location.lng, step.end_location.lat]);
                    }
                  }
                });
                console.log(`[MapPanel] 第 ${i + 1} 段获得 ${segPath.length} 个路径点`);
                allPaths.push(...segPath);
              }
            } else {
              console.log(`[MapPanel] 第 ${i + 1} 段规划失败: ${status}`);
            }
            resolve();
          }
        );
      });

      // 高德地图 API 有 QPS 限制，每段之间加 500ms 延迟
      if (i < currentPoints.length - 2) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[MapPanel] 路线规划完成，总计 ${allPaths.length} 个路径点`);
    setIsCalculating(false);

    if (allPaths.length > 0) {
      // 确保所有路径点都是有效的 [lng, lat] 数字格式
      const validPaths: number[][] = [];
      for (const p of allPaths) {
        if (Array.isArray(p) && p.length >= 2) {
          const [lng, lat] = p;
          if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
            validPaths.push([lng, lat]);
          }
        }
      }
      console.log(`[MapPanel] 有效路径点数: ${validPaths.length}`);
      
      // 对路径点进行插值，增加平滑度
      const interpolatedPaths: number[][] = [];
      for (let i = 0; i < validPaths.length - 1; i++) {
        const [lng1, lat1] = validPaths[i];
        const [lng2, lat2] = validPaths[i + 1];
        interpolatedPaths.push([lng1, lat1]);
        // 在相邻两点之间插入插值点
        const dist = Math.sqrt((lng2 - lng1) ** 2 + (lat2 - lat1) ** 2);
        const numInterpolate = Math.max(1, Math.floor(dist / 0.01)); // 每 0.01 度插入一个点
        for (let j = 1; j < numInterpolate; j++) {
          const t = j / numInterpolate;
          interpolatedPaths.push([
            lng1 + (lng2 - lng1) * t,
            lat1 + (lat2 - lat1) * t
          ]);
        }
      }
      // 最后一个点
      if (validPaths.length > 0) {
        interpolatedPaths.push(validPaths[validPaths.length - 1]);
      }
      console.log(`[MapPanel] 插值后路径点数: ${interpolatedPaths.length}`);
      
      polylineRef.current = new window.AMap.Polyline({
        path: interpolatedPaths,
        strokeColor: '#3b82f6',
        strokeWeight: 5,
      });
      map.add(polylineRef.current);
      
      // 设置视野
      if (currentPoints.length > 0) {
        const lngs = currentPoints.map(p => p.lng);
        const lats = currentPoints.map(p => p.lat);
        const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        map.setCenter([centerLng, centerLat]);
        const lngRange = Math.max(...lngs) - Math.min(...lngs);
        const latRange = Math.max(...lats) - Math.min(...lats);
        const maxRange = Math.max(lngRange, latRange);
        let zoom = 6;
        if (maxRange < 0.5) zoom = 10;
        else if (maxRange < 2) zoom = 8;
        else if (maxRange < 10) zoom = 6;
        else if (maxRange < 50) zoom = 5;
        map.setZoom(zoom);
      }
    }
  }, []);

  // 计算路线详情
  const calculateLegs = useCallback(async () => {
    const currentPoints = pointsRef.current;
    if (currentPoints.length < 2 || !drivingInstanceRef.current) return;

    console.log('[MapPanel] 计算路线详情, points:', currentPoints.length);
    setIsCalculating(true);
    const newLegs: RouteLeg[] = [];
    let currentTime = departTimeRef.current;

    for (let i = 0; i < currentPoints.length - 1; i++) {
      const from = currentPoints[i];
      const to = currentPoints[i + 1];

      await new Promise<void>((resolve) => {
        drivingInstanceRef.current.search(
          new window.AMap.LngLat(from.lng, from.lat),
          new window.AMap.LngLat(to.lng, to.lat),
          {},
          (status: string, result: any) => {
            if (status === 'complete' && result.routes && result.routes.length > 0) {
              const route = result.routes[0];
              // 到达时间 = 出发时间 + 行驶时间
              const arriveTime = calcArriveTime(currentTime, route.time);
              newLegs.push({
                from: from.name,
                to: to.name,
                distance: route.distance,
                duration: route.time,
                arriveTime,
              });
              // 下一段出发时间 = 到达时间 + 停留时间
              currentTime = calcArriveTime(arriveTime, to.stayDuration * 60);
            }
            resolve();
          }
        );
      });

      // 高德地图 API 有 QPS 限制，每段之间加 500ms 延迟
      if (i < currentPoints.length - 2) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    onLegsChangeRef.current(newLegs);
    setIsCalculating(false);
  }, []);

  // points 或 departTime 或 refreshKey 变化时，重新计算和渲染
  useEffect(() => {
    if (mapReady) {
      if (points.length >= 2) {
        // 先更新地图路线，等完成后再计算详情，避免竞争
        updateMapRoute().then(() => {
          calculateLegs();
        });
      } else if (points.length === 1) {
        // 单点时只设置中心
        mapInstanceRef.current?.setCenter([points[0].lng, points[0].lat]);
      }
    }
  }, [points, departTime, refreshKey, mapReady, updateMapRoute, calculateLegs]);

  // 渲染 - ref 的 div 必须始终存在
  return (
    <div className="route-map-panel" ref={mapRef}>
      {mapError && (
        <div className="route-map-error">
          <span>❌ {mapError}</span>
        </div>
      )}
      {!mapError && !mapReady && (
        <div className="route-map-loading">
          <div className="route-spinner" />
          <span>地图加载中...</span>
        </div>
      )}
      {mapReady && points.length < 2 && !isCalculating && (
        <div className="route-map-hint">添加至少2个地点显示路线</div>
      )}
      {mapReady && isCalculating && (
        <div className="route-map-calculating">
          <div className="route-spinner" />
          <span>计算路线中...</span>
        </div>
      )}
    </div>
  );
};

// ==================== 主组件 ====================
const RouteBlockView: React.FC<{
  node: any;
  updateAttributes: any;
  selected: boolean;
  deleteNode: any;
  getPos: any;
  editor: any;
}> = ({ node, updateAttributes, selected, deleteNode, getPos, editor }) => {
  const [points, setPoints] = useState<RoutePoint[]>(node.attrs.points || []);
  const [departTime, setDepartTime] = useState(node.attrs.departTime || '08:00');
  const [legs, setLegs] = useState<RouteLeg[]>(node.attrs.legs || []);
  const [refreshKey, setRefreshKey] = useState(0);

  // 更新 attributes
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

  // 复制到笔记
  const handleCopyToNote = useCallback(() => {
    if (legs.length === 0) return;

    let text = `🚗 行程规划 (${departTime} 出发)\n\n`;
    legs.forEach((leg, i) => {
      text += `${i + 1}. ${leg.from} → ${leg.to}\n`;
      text += `   距离: ${formatDistance(leg.distance)} | 时长: ${formatDuration(leg.duration)}\n`;
      text += `   到达: ${leg.arriveTime}\n`;
      // 显示停留时间（最后一个地点不需要显示）
      if (i < points.length - 1 && points[i + 1].stayDuration > 0) {
        text += `   停留: ${points[i + 1].stayDuration}分钟\n`;
      }
      text += '\n';
    });

    copyToClipboard(text);
  }, [legs, departTime, points]);

  // 删除组件
  const handleDelete = useCallback(() => {
    deleteNode();
  }, [deleteNode]);

  // 刷新地图和路线
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <NodeViewWrapper className="route-block-wrapper">
      <div className={`route-block ${selected ? 'selected' : ''}`}>
        {/* 头部 */}
        <div className="route-header">
          <span className="route-title">🚗 行程规划</span>
          <div className="route-actions">
            <button onClick={handleRefresh} className="route-btn" title="刷新路线">
              🔄
            </button>
            <button onClick={handleDelete} className="route-btn" title="删除">
              🗑️
            </button>
          </div>
        </div>

        {/* 主体：左右分区 */}
        <div className="route-body">
          {/* 左侧：列表区 */}
          <ListPanel
            points={points}
            departTime={departTime}
            legs={legs}
            onPointsChange={handlePointsChange}
            onDepartTimeChange={handleDepartTimeChange}
            onLegsChange={handleLegsChange}
            onCopy={handleCopyToNote}
          />

          {/* 右侧：地图区 */}
          <MapPanel
            key={refreshKey}
            points={points}
            departTime={departTime}
            onLegsChange={handleLegsChange}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const RouteBlock = Node.create({
  name: 'routeBlock',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      points: {
        default: [],
      },
      departTime: {
        default: '08:00',
      },
      legs: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-route-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-route-block': '',
        class: 'route-block-wrapper',
      }),
    ];
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
            },
          });
        },
    };
  },
});

export default RouteBlock;