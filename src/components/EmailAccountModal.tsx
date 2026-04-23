import React, { useState, useEffect } from 'react';
import { Mail, X, Loader2, Check, AlertCircle, Server, Shield } from 'lucide-react';
import { detectProvider, addEmailAccount } from '../lib/emailService';
import toast from 'react-hot-toast';

interface EmailAccountModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  notebookId?: string;
}

const EmailAccountModal: React.FC<EmailAccountModalProps> = ({ show, onClose, onSuccess, notebookId }) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<any>(null);
  const [manualMode, setManualMode] = useState(false);
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapSsl, setImapSsl] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpSsl, setSmtpSsl] = useState(true);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'testing' | 'done'>('input');

  useEffect(() => {
    if (email.includes('@')) {
      const timer = setTimeout(async () => {
        const result = await detectProvider(email);
        if (result.success && result.provider) {
          setDetectedProvider(result.provider);
          if (!manualMode) {
            setImapHost(result.provider.imap_host || '');
            setImapPort(String(result.provider.imap_port || 993));
            setSmtpHost(result.provider.smtp_host || '');
            setSmtpPort(String(result.provider.smtp_port || 465));
            setImapSsl(result.provider.imap_ssl !== false);
            setSmtpSsl(result.provider.smtp_ssl !== false);
          }
        } else {
          setDetectedProvider(null);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setDetectedProvider(null);
    }
  }, [email, manualMode]);

  const handleSubmit = async () => {
    if (!email || !password) {
      toast.error('请填写邮箱地址和密码/授权码');
      return;
    }
    setLoading(true);
    setStep('testing');
    try {
      const result = await addEmailAccount({
        email_address: email,
        display_name: displayName,
        password,
        notebook_id: notebookId,
        imap_host: manualMode ? imapHost : undefined,
        imap_port: manualMode ? parseInt(imapPort) : undefined,
        imap_ssl: manualMode ? imapSsl : undefined,
        smtp_host: manualMode ? smtpHost : undefined,
        smtp_port: manualMode ? parseInt(smtpPort) : undefined,
        smtp_ssl: manualMode ? smtpSsl : undefined,
      });
      if (result.success) {
        setStep('done');
        toast.success('邮箱账号添加成功，正在同步邮件...');
        setTimeout(() => {
          onSuccess();
          onClose();
          resetForm();
        }, 1500);
      } else {
        setStep('input');
        toast.error(result.error || '添加失败');
      }
    } catch (e: any) {
      setStep('input');
      toast.error('添加失败：' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setDisplayName('');
    setPassword('');
    setDetectedProvider(null);
    setManualMode(false);
    setStep('input');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">添加邮箱账号</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {step === 'done' ? (
            <div className="flex flex-col items-center py-8 text-green-500">
              <Check className="w-12 h-12 mb-3" />
              <p className="text-lg font-medium">添加成功！</p>
              <p className="text-sm text-gray-500 mt-1">正在同步邮件，请稍候...</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱地址</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="例如：you@qq.com"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                {detectedProvider && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    已识别：{detectedProvider.name}（IMAP: {detectedProvider.imap_host}）
                  </div>
                )}
                {!detectedProvider && email.includes('@') && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-sm text-amber-600">
                    <AlertCircle className="w-4 h-4" />
                    未识别服务商，需手动配置
                    <button onClick={() => setManualMode(true)} className="text-blue-500 underline ml-1">手动配置</button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">显示名称（可选）</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="发件人显示名"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码 / 授权码
                  <a href="https://service.mail.qq.com/detail/0/53" target="_blank" rel="noopener noreferrer"
                    className="text-blue-500 text-xs ml-2 hover:underline">QQ邮箱如何获取授权码？</a>
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="邮箱密码或IMAP/SMTP授权码"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>

              {manualMode && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Server className="w-4 h-4" /> 手动服务器配置
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">IMAP 服务器</label>
                      <input type="text" value={imapHost} onChange={e => setImapHost(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">IMAP 端口</label>
                      <input type="text" value={imapPort} onChange={e => setImapPort(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SMTP 服务器</label>
                      <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SMTP 端口</label>
                      <input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-sm">
                      <Shield className="w-3.5 h-3.5" /> IMAP SSL
                      <input type="checkbox" checked={imapSsl} onChange={e => setImapSsl(e.target.checked)} />
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <Shield className="w-3.5 h-3.5" /> SMTP SSL
                      <input type="checkbox" checked={smtpSsl} onChange={e => setSmtpSsl(e.target.checked)} />
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                <button onClick={handleSubmit} disabled={loading || !email || !password}
                  className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {step === 'testing' ? '验证连接中...' : '添加邮箱'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailAccountModal;
