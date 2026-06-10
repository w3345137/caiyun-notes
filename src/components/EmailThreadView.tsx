import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, RefreshCw, Loader2, Mail, Paperclip, User, Download } from 'lucide-react';
import { getEmailThread, getEmailContent, sendEmail, syncEmails, downloadEmailAttachment } from '../lib/emailService';
import {
  getCachedEmailContent,
  getCachedEmailThread,
  getEmailContentCacheKey,
  getEmailThreadCacheKey,
  normalizeEmailContentPayload,
  setCachedEmailContent,
  setCachedEmailThread,
  type EmailContentDisplay,
  type EmailAttachmentMeta,
} from '../lib/emailContentCache';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';

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
  const [htmlContentCache, setHtmlContentCache] = useState<Record<string, boolean>>({});
  const [attachmentCache, setAttachmentCache] = useState<Record<string, EmailAttachmentMeta[]>>({});
  const [contentErrorIds, setContentErrorIds] = useState<Set<string>>(() => new Set());
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const contentCacheRef = useRef<Record<string, string>>({});
  const htmlContentCacheRef = useRef<Record<string, boolean>>({});
  const attachmentCacheRef = useRef<Record<string, EmailAttachmentMeta[]>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [emails]);

  useEffect(() => {
    contentCacheRef.current = contentCache;
  }, [contentCache]);

  useEffect(() => {
    htmlContentCacheRef.current = htmlContentCache;
  }, [htmlContentCache]);

  useEffect(() => {
    attachmentCacheRef.current = attachmentCache;
  }, [attachmentCache]);

  const sanitizeEmailHtml = useCallback((html: string) => DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  }), []);

  const storeEmailBody = useCallback((emailId: string, content: EmailContentDisplay) => {
    contentCacheRef.current = { ...contentCacheRef.current, [emailId]: content.body };
    htmlContentCacheRef.current = { ...htmlContentCacheRef.current, [emailId]: content.isHtml };
    attachmentCacheRef.current = { ...attachmentCacheRef.current, [emailId]: content.attachments || [] };
    setContentCache(contentCacheRef.current);
    setHtmlContentCache(htmlContentCacheRef.current);
    setAttachmentCache(attachmentCacheRef.current);
  }, []);

  const loadContentForEmail = useCallback(async (email: EmailItem) => {
    if (Object.prototype.hasOwnProperty.call(contentCacheRef.current, email.id)) return;

    const cacheKey = getEmailContentCacheKey(accountId, email.folder, email.uid);
    const cachedContent = getCachedEmailContent(cacheKey);
    if (cachedContent) {
      storeEmailBody(email.id, cachedContent);
      return;
    }

    setContentErrorIds(prev => {
      const next = new Set(prev);
      next.delete(email.id);
      return next;
    });
    try {
      const result = await getEmailContent(accountId, email.folder, email.uid);
      if (result.success) {
        const normalized = normalizeEmailContentPayload(result);
        const displayContent = {
          body: normalized.isHtml ? sanitizeEmailHtml(normalized.body) : normalized.body,
          isHtml: normalized.isHtml,
          attachments: normalized.attachments,
        };
        storeEmailBody(email.id, displayContent);
        setCachedEmailContent(cacheKey, displayContent);
      } else {
        setContentErrorIds(prev => new Set(prev).add(email.id));
      }
    } catch (e) {
      setContentErrorIds(prev => new Set(prev).add(email.id));
      toast.error('加载邮件内容失败');
    }
  }, [accountId, sanitizeEmailHtml, storeEmailBody]);

  const preloadEmailContents = useCallback(async (nextEmails: EmailItem[]) => {
    const pendingEmails = nextEmails.filter(email => !Object.prototype.hasOwnProperty.call(contentCacheRef.current, email.id));
    const workers = Array.from({ length: Math.min(4, pendingEmails.length) }, async (_, workerIndex) => {
      for (let i = workerIndex; i < pendingEmails.length; i += 4) {
        await loadContentForEmail(pendingEmails[i]);
      }
    });
    await Promise.all(workers);
  }, [loadContentForEmail]);

  const applyEmails = useCallback((nextEmails: EmailItem[]) => {
    setEmails(nextEmails);
    void preloadEmailContents(nextEmails);
    if (nextEmails.length > 0) {
      const lastEmail = nextEmails[nextEmails.length - 1];
      if (lastEmail.subject) setComposeSubject(lastEmail.subject.replace(/^Re:\s*/i, ''));
    }
  }, [preloadEmailContents]);

  const loadEmails = useCallback(async (opts: { syncFirst?: boolean } = {}) => {
    const threadCacheKey = getEmailThreadCacheKey(accountId, otherAddr);
    if (!opts.syncFirst) {
      const cachedThread = getCachedEmailThread<EmailItem>(threadCacheKey);
      if (cachedThread) {
        applyEmails(cachedThread.emails);
        setLoading(false);
        setSyncing(false);
        return;
      }
    }

    setLoading(true);
    try {
      if (opts.syncFirst) {
        setSyncing(true);
        const syncResult = await syncEmails(accountId);
        if (!syncResult.success) {
          toast.error(syncResult.error || '收取邮件失败');
        } else {
          window.dispatchEvent(new CustomEvent('refresh-notes'));
        }
      }
      const result = await getEmailThread(accountId, otherAddr);
      if (result.success) {
        const nextEmails = result.emails || [];
        applyEmails(nextEmails);
        setCachedEmailThread(threadCacheKey, nextEmails);
      }
    } catch (e) {
      toast.error('加载邮件失败');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [accountId, applyEmails, otherAddr]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

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
        setTimeout(() => loadEmails({ syncFirst: true }), 2000);
      } else {
        toast.error(result.error || '发送失败');
      }
    } catch (e) {
      toast.error('发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleDownloadAttachment = async (email: EmailItem, attachmentIndex: number, attachment?: EmailAttachmentMeta) => {
    try {
      const result = await downloadEmailAttachment(accountId, email.folder, email.uid, attachmentIndex);
      if (!result.success || !result.blob) {
        toast.error(result.error || '附件下载失败');
        return;
      }

      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName || attachment?.filename || `attachment-${attachmentIndex + 1}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('附件下载失败');
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
        <button onClick={() => loadEmails({ syncFirst: true })} className="p-1.5 hover:bg-gray-200 rounded" title="收取并刷新">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${syncing ? 'animate-spin' : ''}`} />
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
          const hasContent = Object.prototype.hasOwnProperty.call(contentCache, email.id);
          const bodyContent = contentCache[email.id] || '';
          const attachments = attachmentCache[email.id] || [];
          return (
            <div key={email.id} className={`flex w-full ${fromMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`email-message-bubble max-w-[75%] rounded-xl px-4 py-3 overflow-hidden ${
                fromMe ? 'bg-blue-50 text-gray-800 border border-blue-100' : 'bg-gray-100 text-gray-800'
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
                <div className="text-left w-full">
                  {hasContent ? (
                    htmlContentCache[email.id] ? (
                      bodyContent.trim() ? (
                        <div className="email-html-body text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: bodyContent }} />
                      ) : (
                        <div className={`text-sm ${fromMe ? 'text-blue-700' : 'text-gray-500'}`}>（空白邮件）</div>
                      )
                    ) : (
                      <div className="email-text-body text-sm leading-6 whitespace-pre-wrap break-words text-gray-700">
                        {bodyContent.trim() || '（空白邮件）'}
                      </div>
                    )
                  ) : contentErrorIds.has(email.id) ? (
                    <div className={`text-sm ${fromMe ? 'text-blue-700' : 'text-gray-500'}`}>
                      邮件内容加载失败
                    </div>
                  ) : (
                    <div className={`text-sm flex items-center gap-1.5 ${fromMe ? 'text-blue-700' : 'text-gray-500'}`}>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      正在加载邮件内容...
                    </div>
                  )}
                  {attachments.length > 0 && (
                    <div className="email-attachment-list mt-3 flex flex-wrap gap-2">
                      {attachments.map((attachment, index) => (
                        <button
                          key={`${email.id}-${index}`}
                          onClick={() => handleDownloadAttachment(email, index, attachment)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                          title={attachment.filename || `附件 ${index + 1}`}
                        >
                          <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                          <span className="truncate">{attachment.filename || `附件 ${index + 1}`}</span>
                          <Download className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
