import React, { useState, useEffect } from 'react';
import { X, Bot } from 'lucide-react';
import toast from 'react-hot-toast';
import { checkLLMConfig, saveLLMConfig, deleteLLMConfig, testLLMConnection } from '../lib/llmService';

interface LLMConfigModalProps {
  onClose: () => void;
}

export const LLMConfigModal: React.FC<LLMConfigModalProps> = ({ onClose }) => {
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
