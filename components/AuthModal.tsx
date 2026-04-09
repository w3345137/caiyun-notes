import { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Loader2, Shield, Database, CheckCircle, AlertCircle } from 'lucide-react';
import { signIn, signUp } from '../lib/auth';
import toast from 'react-hot-toast';

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1001]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-red-500 px-6 py-4 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-white" />
          <span className="text-white font-medium">出错了</span>
        </div>
        <div className="p-6">
          <p className="text-gray-700 mb-6">{message}</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-all"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AuthStep = 'login' | 'register';

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');

  if (!isOpen) return null;

  // 显示错误弹窗
  const showError = (msg: string) => {
    setAlertMsg(msg);
  };

  // 关闭错误弹窗
  const closeAlert = () => {
    setAlertMsg('');
  };

  // 登录
  const handleLogin = async () => {
    if (!email || !password) {
      showError('请填写邮箱和密码');
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      toast.success('登录成功');
      onSuccess();
      onClose();
    } catch (error: any) {
      let msg = error?.message || '登录失败，请检查邮箱和密码';
      // 翻译 Supabase 英文错误
      if (msg === 'Invalid login credentials') msg = '邮箱或密码错误';
      if (msg === 'Email not confirmed') msg = '邮箱未验证';
      if (msg.includes('rate limit')) msg = '操作太频繁，请稍后再试';
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 注册
  const handleRegister = async () => {
    // 昵称验证
    if (!displayName) {
      showError('请输入昵称');
      return;
    }
    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      showError('请输入邮箱');
      return;
    }
    if (!emailRegex.test(email)) {
      showError('请输入有效的邮箱地址');
      return;
    }
    // 密码验证（8位）
    if (password.length < 8) {
      showError('密码至少需要8位');
      return;
    }
    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, displayName);
      // 注册成功后自动登录
      await signIn(email, password);
      toast.success('注册成功');
      // 清空表单并关闭
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setDisplayName('');
      onSuccess();
      onClose();
    } catch (error: any) {
      let msg = error?.message || '注册失败，请重试';
      // 翻译 Supabase 英文错误
      if (msg.includes('already registered')) msg = '该邮箱已注册';
      if (msg.includes('rate limit')) msg = '操作太频繁，请稍后再试';
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 切换登录/注册
  const switchToLogin = () => {
    setStep('login');
    setPassword('');
    setConfirmPassword('');
  };

  const switchToRegister = () => {
    setStep('register');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">
              {step === 'login' ? '欢迎回来' : '注册账号'}
            </h2>
            <p className="text-blue-100 text-sm mt-0.5">
              {step === 'login' ? '登录以同步您的笔记' : '创建账号开始使用'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* 注册-昵称输入 - 放在第一位 */}
          {step === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                昵称
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="输入您的昵称"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>
          )}

          {/* 邮箱输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              邮箱
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>

          {/* 密码输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={step === 'login' ? '输入密码' : '设置登录密码（至少8位）'}
                className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 注册-确认密码 */}
          {step === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  确认密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    minLength={8}
                  />
                </div>
              </div>

              {/* 注册说明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700">
                    <p className="font-medium mb-1">注册即用，无需验证</p>
                    <p className="text-blue-600">注册成功后可直接登录使用。</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 信息卡片 */}
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
              <Database className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-700">
                <p className="font-medium mb-1">自建数据库，安全可靠</p>
                <p className="text-green-600">使用独立部署的PostgreSQL数据库存储您的笔记数据。</p>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
              <Shield className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-700">
                <p className="font-medium mb-1">您的数据完全属于您</p>
                <p className="text-green-600">密码使用加密存储。</p>
              </div>
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            onClick={step === 'login' ? handleLogin : handleRegister}
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {step === 'login' ? '登录中...' : '注册中...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {step === 'login' ? '登录' : '注册'}
              </>
            )}
          </button>

          {/* 切换登录/注册 */}
          <div className="text-center pt-2">
            {step === 'login' ? (
              <button
                onClick={switchToRegister}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                还没有账号？立即注册
              </button>
            ) : (
              <button
                onClick={switchToLogin}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                已有账号？立即登录
              </button>
            )}
          </div>

          {/* 版权信息 */}
          <div className="text-center pt-4 border-t border-gray-100 mt-4">
            <p className="text-xs text-gray-400">
              献给热爱知识管理的你——彬
            </p>
          </div>
        </div>
      </div>

      {/* 错误弹窗 */}
      {alertMsg && <AlertModal message={alertMsg} onClose={closeAlert} />}
    </div>
  );
}
