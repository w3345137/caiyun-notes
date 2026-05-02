import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Loader2, Volume2, Copy, Check } from 'lucide-react';
import { uploadToOneDrive, downloadFromOneDrive } from '../lib/onedriveService';
import { transcribeAudio } from '../lib/llmService';
import { useAuth } from '../components/AuthProvider';
import toast from 'react-hot-toast';

interface AudioBlockAttrs {
  noteId: string;
  audioAttachmentId: string;
  audioFileName: string;
  transcriptionText: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audioBlock: {
      insertAudioBlock: (attrs: { noteId: string }) => ReturnType;
    };
  }
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getSupportedMimeType = (): string => {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
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

const AudioBlockView: React.FC<{
  node: { attrs: AudioBlockAttrs };
  deleteNode: () => void;
  updateAttributes: (attrs: Partial<AudioBlockAttrs>) => void;
}> = ({ node, deleteNode, updateAttributes }) => {
  const { user } = useAuth();
  const attrs = node.attrs;

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (attrs.audioAttachmentId && !audioBlobUrl && !isLoadingAudio) {
      loadAudio();
    }
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [attrs.audioAttachmentId]);

  const loadAudio = async () => {
    if (!attrs.audioAttachmentId) return;
    setIsLoadingAudio(true);
    try {
      const result = await downloadFromOneDrive(attrs.audioAttachmentId);
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
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isTauri = !!(window as any).__TAURI_INTERNALS__;
      toast.error(isTauri ? '录音功能需要更新APP版本，请检查更新' : '您的浏览器不支持录音功能');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });
      console.log('[AudioBlock] getUserMedia success, tracks:', stream.getTracks().length, stream.getTracks().map(t => t.label));

      const mimeType = getSupportedMimeType();
      console.log('[AudioBlock] using mimeType:', mimeType);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        console.log('[AudioBlock] dataavailable, size:', e.data.size);
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        console.log('[AudioBlock] recording stopped, chunks:', chunksRef.current.length, 'blob size:', blob.size);
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
      console.error('[AudioBlock] startRecording error:', err);
      toast.error('无法访问麦克风：' + (err.message || '请检查权限设置'));
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

    setIsTranscribing(true);
    setIsUploading(true);

    blobToHex(blob).then(async (hex) => {
      try {
        console.log('[AudioBlock] transcribeAudio start, noteId:', attrs.noteId, 'hex length:', hex.length);
        const result = await transcribeAudio(attrs.noteId, hex);
        console.log('[AudioBlock] transcribeAudio result:', JSON.stringify(result));
        if (result.success && result.text) {
          console.log('[AudioBlock] setting transcriptionText:', result.text);
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

    try {
      const file = new File([blob], fileName, { type: mimeType });
      const result = await uploadToOneDrive(file, attrs.noteId, '/彩云笔记', '录音文件');
      if (result.success && result.data) {
        updateAttributes({
          audioAttachmentId: result.data.id,
          audioFileName: fileName,
        });
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setAudioBlobUrl(url);
        toast.success('录音已保存');
      } else {
        toast.error(result.error || '上传失败');
      }
    } catch (e) {
      toast.error('上传录音失败');
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

  const hasAudio = !!attrs.audioAttachmentId;
  const hasTranscription = !!attrs.transcriptionText;
  const isProcessing = isTranscribing || isUploading;

  return (
    <NodeViewWrapper>
      <div className="my-3 border border-slate-200 rounded-lg bg-white overflow-hidden" data-drag-handle>
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-b border-slate-100">
          <Mic className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">录音机</span>
          {hasAudio && attrs.audioFileName && (
            <span className="text-xs text-slate-400 truncate max-w-[200px]">{attrs.audioFileName}</span>
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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-audio-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-audio-block': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioBlockView);
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
