import React, { useState, useEffect, useRef } from 'react';
import { Send, RefreshCw, Loader2, Mail, MailOpen, Paperclip, User } from 'lucide-react';
import { getEmailThread, getEmailContent, sendEmail } from '../lib/emailService';
import toast from 'react-hot-toast';

interface EmailThreadViewProps {
  accountId: string;
  otherAddr: string;
  otherName?: string;
  myEmail: string;
}

interface EmailItem {
  id: string;
  uid: number;
  folder: string;
  from_addr: string;
  from_name: string;
  to_list: string;
  subject: string;
  date: string;
  is_read: boolean;
  has_attachments: boolean;
}

const EmailThreadView: React.FC<EmailThreadViewProps> = ({ accountId, otherAddr, otherName, myEmail }) => {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEmails();
  }, [accountId, otherAddr]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [emails]);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const result = await getEmailThread(accountId, otherAddr);
      if (result.success) {
        setEmails(result.emails || []);
        if (result.emails?.length > 0) {
          const lastEmail = result.emails[result.emails.length - 1];
          if (lastEmail.subject) setComposeSubject(lastEmail.subject.replace(/^Re:\s*/i, ''));
        }
      }
    } catch (e) {
      toast.error('加载邮件失败');
    } finally {
      setLoading(false);
    }
  };

  const loadContent = async (email: EmailItem) => {
    if (contentCache[email.id]) {
      setExpandedId(expandedId === email.id ? null : email.id);
      return;
    }
    try {
      const result = await getEmailContent(accountId, email.folder, email.uid);
      if (result.success) {
        let textContent = '';
        if (result.html) {
          textContent = result.html;
        } else if (result.text) {
          textContent = result.text.replace(/\r\n/g, '\n').trim();
        } else if (result.source) {
          textContent = result.source.substring(0, 500);
        }
        setContentCache(prev => ({ ...prev, [email.id]: textContent }));
        setExpandedId(email.id);
      }
    } catch (e) {
      toast.error('加载邮件内容失败');
    }
  };

  const handleSend = async () => {
    if (!composeText.trim()) return;
    setSending(true);
    try {
      const result = await sendEmail({
        account_id: accountId,
        to: otherAddr,
        subject: composeSubject || '(无主题)',
        text: composeText,
      });
      if (result.success) {
        toast.success('邮件已发送');
        setComposeText('');
        setShowCompose(false);
        setTimeout(loadEmails, 2000);
      } else {
        toast.error(result.error || '发送失败');
      }
    } catch (e) {
      toast.error('发送失败');
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isFromMe = (email: EmailItem) => email.from_addr?.toLowerCase() === myEmail?.toLowerCase();

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="font-medium text-sm">{otherName || otherAddr}</div>
            <div className="text-xs text-gray-500">{otherAddr}</div>
          </div>
        </div>
        <button onClick={loadEmails} className="p-1.5 hover:bg-gray-200 rounded" title="刷新">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {emails.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            <Mail className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>暂无邮件记录</p>
            <p className="text-sm">点击下方发送按钮开始对话</p>
          </div>
        )}
        {emails.map(email => {
          const fromMe = isFromMe(email);
          return (
            <div key={email.id} className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-xl px-4 py-3 ${
                fromMe ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs opacity-70">{fromMe ? '我' : (email.from_name || email.from_addr)}</span>
                  <span className="text-xs opacity-50">{formatDate(email.date)}</span>
                  {email.has_attachments && <Paperclip className="w-3 h-3 opacity-50" />}
                </div>
                {email.subject && !fromMe && (
                  <div className={`text-xs font-medium mb-1 ${fromMe ? 'text-blue-100' : 'text-gray-500'}`}>
                    {email.subject}
                  </div>
                )}
                <button onClick={() => loadContent(email)} className="text-left w-full">
                  {expandedId === email.id && contentCache[email.id] ? (
                    contentCache[email.id].includes('<') && contentCache[email.id].includes('>') ? (
                      <div className={`text-sm prose prose-sm max-w-none ${fromMe ? 'text-white prose-invert' : 'text-gray-700'}`} dangerouslySetInnerHTML={{ __html: contentCache[email.id] }} />
                    ) : (
                      <div className={`text-sm whitespace-pre-wrap ${fromMe ? 'text-white' : 'text-gray-700'}`}>
                        {contentCache[email.id]}
                      </div>
                    )
                  ) : (
                    <div className={`text-sm ${fromMe ? 'text-blue-100' : 'text-gray-500'}`}>
                      点击查看邮件内容 ▼
                    </div>
                  )}
                </button>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {showCompose ? (
        <div className="border-t p-3 bg-gray-50">
          <input type="text" value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
            placeholder="主题" className="w-full px-3 py-1.5 text-sm border rounded-lg mb-2 outline-none focus:ring-1 focus:ring-blue-500" />
          <textarea value={composeText} onChange={e => setComposeText(e.target.value)}
            placeholder="输入邮件内容..." rows={3}
            className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          <div className="flex justify-between mt-2">
            <button onClick={() => setShowCompose(false)} className="text-sm text-gray-500 hover:text-gray-700">取消</button>
            <button onClick={handleSend} disabled={sending || !composeText.trim()}
              className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              发送
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t p-3">
          <button onClick={() => setShowCompose(true)}
            className="w-full px-4 py-2 text-sm text-left text-gray-400 bg-gray-50 rounded-lg hover:bg-gray-100 border">
            写邮件给 {otherName || otherAddr}...
          </button>
        </div>
      )}
    </div>
  );
};

export default EmailThreadView;
