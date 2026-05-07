import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Trash2, Loader2, Volume2, Copy, Check } from 'lucide-react';
import { uploadToOneDrive, downloadFromOneDrive } from '../lib/onedriveService';
import { uploadToBaidu, downloadFromBaidu } from '../lib/baiduService';
import { uploadToQiniu, downloadFromQiniu } from '../lib/qiniuService';
import { transcribeAudio } from '../lib/llmService';
import toast from 'react-hot-toast';

type StorageProvider = 'onedrive' | 'baidu' | 'qiniu';

interface AudioBlockAttrs {
  noteId: string;
  audioAttachmentId: string;
  audioFileName: string;
  transcriptionText: string;
  uploadEnabled: boolean;
  transcriptionEnabled: boolean;
  storageProvider: StorageProvider;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audioBlock: {
      insertAudioBlock: (attrs: { noteId: string; uploadEnabled?: boolean; transcriptionEnabled?: boolean; storageProvider?: StorageProvider }) => ReturnType;
    };
  }
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getSupportedMimeType = (): string => {
  if (typeof window === 'undefined' || !window.MediaRecorder) return '';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    if (window.MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
};

const getExtension = (mimeType: string): string => {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  return 'webm';
};

const blobToHex = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const providerLabels: Record<StorageProvider, string> = {
  onedrive: 'OneDrive',
  baidu: '百度网盘',
  qiniu: '七牛云',
};

const getProvider = (provider?: string): StorageProvider => {
  return provider === 'baidu' || provider === 'qiniu' ? provider : 'onedrive';
};

const downloadAudio = (provider: StorageProvider, attachmentId: string) => {
  if (provider === 'baidu') return downloadFromBaidu(attachmentId);
  if (provider === 'qiniu') return downloadFromQiniu(attachmentId);
  return downloadFromOneDrive(attachmentId);
};

const uploadAudio = async (provider: StorageProvider, blob: Blob, fileName: string, mimeType: string, noteId: string) => {
  if (provider === 'baidu') {
    return uploadToBaidu(noteId, fileName, await blobToBase64(blob));
  }
  if (provider === 'qiniu') {
    return uploadToQiniu(noteId, fileName, await blobToBase64(blob));
  }

  const file = new File([blob], fileName, { type: mimeType });
  return uploadToOneDrive(file, noteId, '/彩云笔记', '录音文件');
};

const getMicrophoneErrorMessage = (error: { name?: string; message?: string }) => {
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '无法访问麦克风：请在系统和浏览器权限里允许彩云笔记录音';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '未找到可用麦克风';
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风正被其他应用占用，请关闭占用后重试';
    default:
      return `无法访问麦克风：${error.message || '请检查权限设置'}`;
  }
};

const AudioBlockView: React.FC<{
  node: { attrs: AudioBlockAttrs };
  deleteNode: () => void;
  updateAttributes: (attrs: Partial<AudioBlockAttrs>) => void;
}> = ({ node, deleteNode, updateAttributes }) => {
  const attrs = node.attrs;

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [localAudioFileName, setLocalAudioFileName] = useState('');
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const blobUrlRef = useRef<string | null>(null);

  const loadAudio = useCallback(async () => {
    if (!attrs.audioAttachmentId) return;
    setIsLoadingAudio(true);
    try {
      const result = await downloadAudio(getProvider(attrs.storageProvider), attrs.audioAttachmentId);
      if (result.success && result.blob) {
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(result.blob);
        blobUrlRef.current = url;
        setAudioBlobUrl(url);
      }
    } catch (e) {
      console.error('Load audio error:', e);
    } finally {
      setIsLoadingAudio(false);
    }
  }, [attrs.audioAttachmentId, attrs.storageProvider]);

  useEffect(() => {
    if (attrs.audioAttachmentId && !audioBlobUrl && !isLoadingAudio) {
      loadAudio();
    }
  }, [attrs.audioAttachmentId, audioBlobUrl, isLoadingAudio, loadAudio]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      const isTauri = !!(window as any).__TAURI_INTERNALS__;
      toast.error(isTauri ? '当前系统 WebView 不支持录音，请更新 APP 或系统 WebView' : '您的浏览器不支持录音功能');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });

      const mimeType = getSupportedMimeType();
      const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream?.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size < 100) {
          toast.error('录音数据异常，请检查麦克风权限');
          setIsTranscribing(false);
          setIsUploading(false);
          return;
        }
        await processRecording(blob, mimeType || 'audio/webm');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setDuration(0);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err: any) {
      stream?.getTracks().forEach(t => t.stop());
      console.error('[AudioBlock] startRecording error:', err);
      toast.error(getMicrophoneErrorMessage(err));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const processRecording = async (blob: Blob, mimeType: string) => {
    const ext = getExtension(mimeType);
    const now = new Date();
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const fileName = `录音_${ts}.${ext}`;

    const canTranscribe = attrs.transcriptionEnabled !== false;
    const canUpload = attrs.uploadEnabled !== false;
    setIsTranscribing(canTranscribe);
    setIsUploading(canUpload);
    setLocalAudioFileName(fileName);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setAudioBlobUrl(url);

    if (canTranscribe) {
      void blobToHex(blob).then(async (hex) => {
        try {
          if (!attrs.noteId) {
            setIsTranscribing(false);
            return;
          }
          const result = await transcribeAudio(attrs.noteId, hex);
          if (result.success && result.text) {
            updateAttributes({ transcriptionText: result.text });
          } else {
            console.warn('[AudioBlock] transcribe failed:', result.error);
            toast.error(result.error || '转写失败');
          }
        } catch (e) {
          console.error('[AudioBlock] transcribe exception:', e);
          toast.error('转写请求失败');
        } finally {
          setIsTranscribing(false);
        }
      });
    }

    if (!canUpload) {
      toast.success('录音已完成，可在当前页面播放；绑定云盘后可持久保存');
      setIsUploading(false);
      return;
    }

    try {
      const provider = getProvider(attrs.storageProvider);
      const result = await uploadAudio(provider, blob, fileName, mimeType, attrs.noteId);
      if (result.success && result.data) {
        updateAttributes({
          audioAttachmentId: result.data.id,
          audioFileName: fileName,
          storageProvider: provider,
        });
        toast.success('录音已保存');
      } else {
        toast.error(`录音已保留在当前页面，但上传失败：${result.error || `请检查${providerLabels[provider]}绑定`}`);
      }
    } catch (e) {
      const provider = getProvider(attrs.storageProvider);
      toast.error(`录音已保留在当前页面，但上传到${providerLabels[provider]}失败`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopy = () => {
    if (attrs.transcriptionText) {
      navigator.clipboard.writeText(attrs.transcriptionText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasAudio = !!attrs.audioAttachmentId || !!audioBlobUrl;
  const hasTranscription = !!attrs.transcriptionText;
  const isProcessing = isTranscribing || isUploading;

  return (
    <NodeViewWrapper>
      <div className="my-3 border border-slate-200 rounded-lg bg-white overflow-hidden" data-drag-handle>
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-b border-slate-100">
          <Mic className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">录音机</span>
          {hasAudio && (attrs.audioFileName || localAudioFileName) && (
            <span className="text-xs text-slate-400 truncate max-w-[200px]">{attrs.audioFileName || localAudioFileName}</span>
          )}
          <div className="flex-1" />
          <button
            onClick={deleteNode}
            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="移除录音机"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="p-3 space-y-2">
          {isRecording && (
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-500 font-mono">{formatDuration(duration)}</span>
              <button
                onClick={stopRecording}
                className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                <Square className="w-3 h-3" fill="currentColor" />
                停止
              </button>
            </div>
          )}

          {!isRecording && !hasAudio && !isProcessing && (
            <button
              onClick={startRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              <Mic className="w-3.5 h-3.5" />
              开始录音
            </button>
          )}

          {isProcessing && (
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {isTranscribing && (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  正在转写
                </span>
              )}
              {isUploading && (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  正在上传
                </span>
              )}
            </div>
          )}

          {hasAudio && !isUploading && (
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {isLoadingAudio ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : audioBlobUrl ? (
                <audio src={audioBlobUrl} controls className="h-8 flex-1" style={{ minWidth: 200 }} />
              ) : (
                <span className="text-xs text-slate-400">音频加载失败</span>
              )}
            </div>
          )}

          {hasTranscription && (
            <div className="relative bg-slate-50 rounded p-2.5 text-sm text-slate-700 leading-relaxed">
              {attrs.transcriptionText}
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                title="复制文字"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const AudioBlock = Node.create({
  name: 'audioBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      noteId: { default: '' },
      audioAttachmentId: { default: '' },
      audioFileName: { default: '' },
      transcriptionText: { default: '' },
      uploadEnabled: { default: true },
      transcriptionEnabled: { default: true },
      storageProvider: { default: 'onedrive' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-audio-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-audio-block': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioBlockView as React.ComponentType<any>);
  },

  addCommands() {
    return {
      insertAudioBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
