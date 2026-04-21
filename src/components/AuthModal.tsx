import { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Loader2, Shield, Database, CheckCircle, AlertCircle, Key, RefreshCw } from 'lucide-react';
import { signIn, signUp, sendVerificationCode, verifyCode, resetPassword } from '../lib/auth';
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
  onSuccess?: () => void;
}

type AuthStep = 'login' | 'register' | 'forgot-password';

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');

  // 验证码相关
  const [verifyCodeValue, setVerifyCodeValue] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);

  // 倒计时（必须在所有条件返回之前，保持 hooks 调用数量一致）
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (!isOpen) return null;

  const showError = (msg: string) => setAlertMsg(msg);
  const closeAlert = () => setAlertMsg('');

  const handleSendCode = async (purpose: 'register' | 'reset-password') => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      showError('请输入邮箱地址');
      return;
    }
    if (!emailRegex.test(email)) {
      showError('请输入有效的邮箱地址');
      return;
    }

    setSendingCode(true);
    try {
      await sendVerificationCode(email, purpose);
      setCodeSent(true);
      setCountdown(60);
      toast.success('验证码已发送到您的邮箱');
    } catch (error: any) {
      let msg = error?.message || '发送验证码失败';
      showError(msg);
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async (purpose: 'register' | 'reset-password') => {
    if (!verifyCodeValue) {
      showError('请输入验证码');
      return;
    }
    if (verifyCodeValue.length !== 6) {
      showError('请输入6位验证码');
      return;
    }

    setLoading(true);
    try {
      const data = await verifyCode(email, verifyCodeValue, purpose);
      setVerifyToken(data.verifyToken);
      toast.success('邮箱验证成功');
    } catch (error: any) {
      showError(error?.message || '验证码错误');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showError('请填写邮箱和密码');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success('登录成功');
      onSuccess?.();
      onClose();
      setTimeout(() => window.location.reload(), 300);
    } catch (error: any) {
      let msg = error?.message || '登录失败，请检查邮箱和密码';
      if (msg === 'Invalid credentials') msg = '邮箱或密码错误';
      if (msg === 'No local password') {
        msg = '该账号尚未设置本地密码，请点击"忘记密码"通过邮箱验证设置新密码后登录';
      }
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!verifyToken) {
      showError('请先完成邮箱验证');
      return;
    }
    if (!displayName) {
      showError('请输入昵称');
      return;
    }
    if (password.length < 6) {
      showError('密码至少需要6位');
      return;
    }
    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, displayName, verifyToken);
      await signIn(email, password);
      toast.success('注册成功');
      resetForm();
      onSuccess?.();
      onClose();
      setTimeout(() => window.location.reload(), 300);
    } catch (error: any) {
      let msg = error?.message || '注册失败，请重试';
      if (msg.includes('already exists') || msg.includes('already registered')) msg = '该邮箱已注册';
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!verifyToken) {
      showError('请先完成邮箱验证');
      return;
    }
    if (password.length < 6) {
      showError('密码至少需要6位');
      return;
    }
    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, password, verifyToken);
      toast.success('密码重置成功，请使用新密码登录');
      resetForm();
      setStep('login');
    } catch (error: any) {
      showError(error?.message || '密码重置失败');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail(''); setPassword(''); setConfirmPassword(''); setDisplayName('');
    setVerifyCodeValue(''); setVerifyToken(''); setCodeSent(false); setCountdown(0);
  };

  const switchToLogin = () => { setStep('login'); resetForm(); };
  const switchToRegister = () => { setStep('register'); resetForm(); };
  const switchToForgotPassword = () => { setStep('forgot-password'); resetForm(); };

  const renderEmailVerification = (purpose: 'register' | 'reset-password') => (
    <div className="space-y-3">
      {/* 邮箱输入 + 发送验证码 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={!!verifyToken}
              required
            />
          </div>
          <button
            onClick={() => handleSendCode(purpose)}
            disabled={sendingCode || countdown > 0 || !!verifyToken}
            className="px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5"
          >
            {sendingCode ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 发送中</>
            ) : verifyToken ? (
              <><CheckCircle className="w-3.5 h-3.5" /> 已验证</>
            ) : countdown > 0 ? (
              `${countdown}s`
            ) : codeSent ? (
              <><RefreshCw className="w-3.5 h-3.5" /> 重新发送</>
            ) : (
              '发送验证码'
            )}
          </button>
        </div>
      </div>

      {/* 验证码输入 */}
      {!verifyToken && codeSent && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">验证码</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={verifyCodeValue}
                onChange={(e) => setVerifyCodeValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="输入6位数字验证码"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all tracking-widest text-center font-mono text-lg"
                maxLength={6}
                required
              />
            </div>
            <button
              onClick={() => handleVerifyCode(purpose)}
              disabled={verifyCodeValue.length !== 6 || loading}
              className="px-4 py-2.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '验证'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">验证码已发送到 {email}，请查收（可能在垃圾邮件中）</p>
        </div>
      )}

      {/* 验证成功提示 */}
      {verifyToken && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <span className="text-sm text-green-700 font-medium">邮箱验证成功</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-white">
              {step === 'login' ? '欢迎回来' : step === 'register' ? '注册账号' : '重置密码'}
            </h2>
            <p className="text-blue-100 text-sm mt-0.5">
              {step === 'login' ? '登录以同步您的笔记' : step === 'register' ? '创建账号开始使用' : '通过邮箱验证重置密码'}
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

          {/* ========== 注册流程 ========== */}
          {step === 'register' && (
            <>
              {/* 昵称 */}
              {verifyToken && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">昵称</label>
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

              {/* 邮箱验证 */}
              {renderEmailVerification('register')}

              {/* 设置密码（验证通过后显示） */}
              {verifyToken && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="设置登录密码（至少6位）"
                        className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        required
                        minLength={6}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">确认密码</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="再次输入密码"
                        className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        minLength={6}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 注册说明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700">
                    <p className="font-medium mb-1">邮箱验证注册</p>
                    <p className="text-blue-600">验证邮箱后即可注册使用，确保账号安全。</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ========== 忘记密码流程 ========== */}
          {step === 'forgot-password' && (
            <>
              {/* 邮箱验证 */}
              {renderEmailVerification('reset-password')}

              {/* 设置新密码（验证通过后显示） */}
              {verifyToken && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">新密码</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="设置新密码（至少6位）"
                        className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        required
                        minLength={6}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">确认新密码</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="再次输入新密码"
                        className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        minLength={6}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ========== 登录流程 ========== */}
          {step === 'login' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                    minLength={6}
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
              {/* 忘记密码 */}
              <div className="text-right">
                <button
                  onClick={switchToForgotPassword}
                  className="text-sm text-blue-500 hover:text-blue-600"
                >
                  忘记密码？
                </button>
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
            onClick={
              step === 'login' ? handleLogin :
              step === 'register' ? handleRegister :
              handleResetPassword
            }
            disabled={loading || (step !== 'login' && !verifyToken)}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {step === 'login' ? '登录中...' : step === 'register' ? '注册中...' : '重置中...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {step === 'login' ? '登录' : step === 'register' ? '注册' : '重置密码'}
              </>
            )}
          </button>

          {/* 切换 */}
          <div className="text-center pt-2 flex items-center justify-center gap-3">
            {step === 'login' && (
              <button
                onClick={switchToRegister}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                还没有账号？立即注册
              </button>
            )}
            {step === 'register' && (
              <button
                onClick={switchToLogin}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                已有账号？立即登录
              </button>
            )}
            {step === 'forgot-password' && (
              <button
                onClick={switchToLogin}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                返回登录
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
