"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  BellRing,
  CheckCheck,
  ExternalLink,
  Loader2,
  Mail,
  Pencil,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Volume2,
  VolumeX,
  X as XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CODEX_RESET_ACCOUNTS,
  DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS,
  DEFAULT_CODEX_RESET_KEYWORDS,
} from "@/lib/codex-reset-notifier";
import type {
  CodexResetNotice,
  CodexResetNotifierResponse,
  CodexResetNotifierStatus,
} from "@/lib/types";

const STORAGE_KEY = "codex-reset-notifier-state-v1";
const POLL_OPTIONS = [
  { label: "1 分钟", value: 60_000 },
  { label: "3 分钟", value: 180_000 },
  { label: "5 分钟", value: 300_000 },
];

type StoredState = {
  isMonitoring?: boolean;
  intervalMs?: number;
  notificationsEnabled?: boolean;
  soundEnabled?: boolean;
  accounts?: string[];
  emailRecipients?: string[];
  emailedIds?: string[];
  keywordInput?: string;
  readIds?: string[];
  notifiedIds?: string[];
  notices?: CodexResetNotice[];
  checkedAt?: string;
};

function readStoredState(): StoredState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredState;
  } catch {
    return {};
  }
}

function writeStoredState(state: StoredState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parseKeywords(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAccounts(value: unknown, fallback = DEFAULT_CODEX_RESET_ACCOUNTS) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((item) => String(item).trim().replace(/^@+/, ""))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeEmailRecipients(value: unknown, fallback = DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((item) => String(item).trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return Array.from(new Set(normalized));
}

function formatDate(value: string) {
  if (!value) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCheckedAt(value?: string) {
  if (!value) return "尚未检查";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function statusCopy(status: CodexResetNotifierStatus, count: number) {
  if (status === "checking") return "正在检查 X 最新公告";
  if (status === "config_error") return "X API 凭据未配置完整";
  if (status === "rate_limited") return "X API 暂时限流";
  if (status === "error") return "检查失败";
  if (status === "empty") return "暂未发现 reset 公告";
  if (status === "success") return count > 0 ? `发现 ${count} 条相关公告` : "检查完成";
  return "等待开始";
}

function playNoticeTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.3);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export default function CodexResetNotifierPage() {
  const [initialStoredState] = useState(readStoredState);
  const [isMonitoring, setIsMonitoring] = useState(initialStoredState.isMonitoring ?? true);
  const [intervalMs, setIntervalMs] = useState(
    initialStoredState.intervalMs && POLL_OPTIONS.some((option) => option.value === initialStoredState.intervalMs)
      ? initialStoredState.intervalMs
      : 180_000,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(initialStoredState.notificationsEnabled ?? false);
  const [soundEnabled, setSoundEnabled] = useState(initialStoredState.soundEnabled ?? true);
  const [accounts, setAccounts] = useState(() => normalizeAccounts(initialStoredState.accounts));
  const [accountInput, setAccountInput] = useState("");
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [emailRecipients, setEmailRecipients] = useState(() => normalizeEmailRecipients(initialStoredState.emailRecipients));
  const [emailInput, setEmailInput] = useState("");
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState(initialStoredState.keywordInput ?? DEFAULT_CODEX_RESET_KEYWORDS.join(", "));
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(initialStoredState.readIds ?? []));
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(() => new Set(initialStoredState.notifiedIds ?? []));
  const [emailedIds, setEmailedIds] = useState<Set<string>>(() => new Set(initialStoredState.emailedIds ?? []));
  const [notices, setNotices] = useState<CodexResetNotice[]>(initialStoredState.notices ?? []);
  const [status, setStatus] = useState<CodexResetNotifierStatus>("idle");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | undefined>(initialStoredState.checkedAt);
  const [rateLimit, setRateLimit] = useState<CodexResetNotifierResponse["rateLimit"]>();
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
  );
  const inFlightRef = useRef(false);
  const checkNowRef = useRef<() => Promise<void>>(async () => {});

  const keywords = useMemo(() => parseKeywords(keywordInput), [keywordInput]);
  const unreadCount = notices.filter((notice) => !readIds.has(notice.id)).length;

  const persistState = useCallback((next?: Partial<StoredState>) => {
    writeStoredState({
      isMonitoring,
      intervalMs,
      notificationsEnabled,
      soundEnabled,
      accounts,
      emailRecipients,
      emailedIds: Array.from(emailedIds),
      keywordInput,
      readIds: Array.from(readIds),
      notifiedIds: Array.from(notifiedIds),
      notices,
      checkedAt,
      ...next,
    });
  }, [
    checkedAt,
    accounts,
    emailRecipients,
    emailedIds,
    intervalMs,
    isMonitoring,
    keywordInput,
    notifiedIds,
    notices,
    notificationsEnabled,
    readIds,
    soundEnabled,
  ]);

  const sendBrowserNotifications = useCallback((newNotices: CodexResetNotice[]) => {
    if (!notificationsEnabled || Notification.permission !== "granted") return;
    for (const notice of newNotices.slice(0, 3)) {
      new Notification("Codex reset notice", {
        body: `@${notice.username}: ${notice.text.slice(0, 120)}`,
      });
    }
  }, [notificationsEnabled]);

  const sendLatestEmailNotification = useCallback(async () => {
    const latestNotice = notices[0];
    if (!latestNotice) {
      setEmailError("还没有可发送的公告。");
      setEmailMessage("");
      return;
    }
    if (emailRecipients.length === 0) {
      setEmailError("请先添加至少一个邮箱。");
      setEmailMessage("");
      return;
    }

    setIsEmailSending(true);
    setEmailError("");
    setEmailMessage("");
    try {
      const response = await fetch("/api/codex-reset-notifier/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipients: emailRecipients,
          notices: [latestNotice],
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "邮件提醒发送失败。");
      }
      setEmailedIds((current) => {
        const updated = new Set(current);
        updated.add(latestNotice.id);
        persistState({ emailedIds: Array.from(updated) });
        return updated;
      });
      setEmailMessage(`已发送最新公告：@${latestNotice.username}`);
    } catch (sendEmailError) {
      setEmailError(sendEmailError instanceof Error ? sendEmailError.message : "邮件提醒发送失败。");
    } finally {
      setIsEmailSending(false);
    }
  }, [emailRecipients, notices, persistState]);

  const checkNow = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus("checking");
    setError("");
    try {
      const response = await fetch("/api/codex-reset-notifier/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            accounts,
            keywords,
            maxResults: 25,
          },
        }),
      });
      const payload = (await response.json()) as CodexResetNotifierResponse;
      const nextCheckedAt = payload.checkedAt;
      setCheckedAt(nextCheckedAt);
      setRateLimit(payload.rateLimit);
      if (!response.ok || !payload.success) {
        const message = payload.error || "检查失败。";
        setError(message);
        setStatus(response.status === 429 ? "rate_limited" : message.includes("credentials") ? "config_error" : "error");
        persistState({ checkedAt: nextCheckedAt });
        return;
      }

      const nextNotices = payload.notices;
      const newNotices = nextNotices.filter((notice) => !notifiedIds.has(notice.id));
      setNotices(nextNotices);
      setStatus(nextNotices.length > 0 ? "success" : "empty");
      setNotifiedIds((current) => {
        const updated = new Set(current);
        newNotices.forEach((notice) => updated.add(notice.id));
        return updated;
      });
      if (newNotices.length > 0) {
        sendBrowserNotifications(newNotices);
        if (soundEnabled) playNoticeTone();
      }
      persistState({
        notices: nextNotices,
        checkedAt: nextCheckedAt,
        notifiedIds: Array.from(new Set([...Array.from(notifiedIds), ...newNotices.map((notice) => notice.id)])),
      });
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "检查失败。");
      setStatus("error");
    } finally {
      inFlightRef.current = false;
    }
  }, [accounts, keywords, notifiedIds, persistState, sendBrowserNotifications, soundEnabled]);

  useEffect(() => {
    checkNowRef.current = checkNow;
  }, [checkNow]);

  async function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    const enabled = permission === "granted";
    setNotificationsEnabled(enabled);
    persistState({ notificationsEnabled: enabled });
  }

  function markAsRead(id: string) {
    setReadIds((current) => {
      const updated = new Set(current);
      updated.add(id);
      persistState({ readIds: Array.from(updated) });
      return updated;
    });
  }

  function markAllRead() {
    const next = new Set(notices.map((notice) => notice.id));
    setReadIds(next);
    persistState({ readIds: Array.from(next) });
  }

  function upsertAccount() {
    const nextAccount = accountInput.trim().replace(/^@+/, "");
    if (!nextAccount) return;
    setAccounts((current) => {
      const withoutEdited = editingAccount
        ? current.filter((account) => account.toLowerCase() !== editingAccount.toLowerCase())
        : current;
      const updated = Array.from(new Set([...withoutEdited, nextAccount]));
      persistState({ accounts: updated });
      return updated;
    });
    setAccountInput("");
    setEditingAccount(null);
  }

  function editAccount(account: string) {
    setEditingAccount(account);
    setAccountInput(account);
  }

  function cancelAccountEdit() {
    setEditingAccount(null);
    setAccountInput("");
  }

  function deleteAccount(account: string) {
    setAccounts((current) => {
      if (current.length <= 1) return current;
      const updated = current.filter((item) => item !== account);
      persistState({ accounts: updated });
      return updated;
    });
  }

  function resetAccounts() {
    const defaults = [...DEFAULT_CODEX_RESET_ACCOUNTS];
    setAccounts(defaults);
    setAccountInput("");
    setEditingAccount(null);
    persistState({ accounts: defaults });
  }

  function upsertEmailRecipient() {
    const nextEmail = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return;
    setEmailRecipients((current) => {
      const withoutEdited = editingEmail
        ? current.filter((email) => email.toLowerCase() !== editingEmail.toLowerCase())
        : current;
      const updated = Array.from(new Set([...withoutEdited, nextEmail]));
      persistState({ emailRecipients: updated });
      return updated;
    });
    setEmailInput("");
    setEditingEmail(null);
  }

  function editEmailRecipient(email: string) {
    setEditingEmail(email);
    setEmailInput(email);
  }

  function cancelEmailEdit() {
    setEditingEmail(null);
    setEmailInput("");
  }

  function deleteEmailRecipient(email: string) {
    setEmailRecipients((current) => {
      if (current.length <= 1) return current;
      const updated = current.filter((item) => item !== email);
      persistState({ emailRecipients: updated });
      return updated;
    });
  }

  function resetEmailRecipients() {
    const defaults = [...DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS];
    setEmailRecipients(defaults);
    setEmailInput("");
    setEditingEmail(null);
    persistState({ emailRecipients: defaults });
  }

  useEffect(() => {
    persistState();
  }, [persistState]);

  useEffect(() => {
    if (!isMonitoring) return;
    const firstCheck = window.setTimeout(() => {
      void checkNowRef.current();
    }, 0);
    const interval = window.setInterval(() => {
      void checkNowRef.current();
    }, intervalMs);
    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [intervalMs, isMonitoring]);

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-lime-100">
              <ArrowLeft size={16} aria-hidden="true" />
              返回首页
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md border border-lime-300/20 bg-lime-300/10 text-lime-100">
                <BellRing size={22} aria-hidden="true" />
              </div>
              <div>
                <p className="font-mono text-xs text-zinc-500">X API · Codex · Reset</p>
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Codex Reset 通知器</h1>
              </div>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[520px]">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-zinc-500">状态</p>
              <p className="mt-1 text-sm font-semibold text-lime-100">{statusCopy(status, notices.length)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-zinc-500">未读</p>
              <p className="mt-1 font-mono text-xl font-semibold text-white">{unreadCount}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-zinc-500">上次检查</p>
              <p className="mt-1 font-mono text-sm text-zinc-200">{formatCheckedAt(checkedAt)}</p>
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#080b08] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">监听控制</h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">页面保持打开时轮询 X recent search。</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isMonitoring;
                    setIsMonitoring(next);
                    persistState({ isMonitoring: next });
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-md border transition ${
                    isMonitoring
                      ? "border-lime-300/30 bg-lime-300/15 text-lime-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-100"
                  }`}
                  aria-label={isMonitoring ? "暂停监听" : "开始监听"}
                >
                  {isMonitoring ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => void checkNow()}
                disabled={status === "checking"}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-lime-300/25 bg-lime-300 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "checking" ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <RefreshCw size={16} aria-hidden="true" />}
                立即检查
              </button>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">轮询间隔</p>
                <div className="grid grid-cols-3 gap-2">
                  {POLL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setIntervalMs(option.value);
                        persistState({ intervalMs: option.value });
                      }}
                      className={`h-9 rounded-md border text-xs font-semibold transition ${
                        intervalMs === option.value
                          ? "border-lime-300/40 bg-lime-300/15 text-lime-100"
                          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#080b08] p-4">
              <h2 className="text-sm font-semibold text-white">提醒方式</h2>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!("Notification" in window)) return;
                    if (Notification.permission === "default") {
                      void requestNotificationPermission();
                    } else {
                      const next = !notificationsEnabled;
                      setNotificationsEnabled(next);
                      persistState({ notificationsEnabled: next });
                    }
                  }}
                  className={`flex h-11 items-center justify-between rounded-md border px-3 text-sm font-semibold transition ${
                    notificationsEnabled
                      ? "border-lime-300/30 bg-lime-300/10 text-lime-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:text-zinc-100"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Bell size={16} aria-hidden="true" />
                    浏览器通知
                  </span>
                  <span className="text-[11px] text-zinc-500">{notificationPermission}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    persistState({ soundEnabled: next });
                  }}
                  className={`flex h-11 items-center justify-between rounded-md border px-3 text-sm font-semibold transition ${
                    soundEnabled
                      ? "border-lime-300/30 bg-lime-300/10 text-lime-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:text-zinc-100"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {soundEnabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
                    声音提示
                  </span>
                  <span className="text-[11px] text-zinc-500">{soundEnabled ? "on" : "off"}</span>
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#080b08] p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">邮件提醒</h2>
                <button
                  type="button"
                  onClick={resetEmailRecipients}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[11px] font-semibold text-zinc-300 transition hover:border-lime-300/30 hover:text-lime-100"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  默认
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {emailRecipients.map((email) => (
                  <div key={email} className="flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3">
                    <Mail size={14} aria-hidden="true" className="shrink-0 text-zinc-500" />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-100">{email}</span>
                    <button
                      type="button"
                      onClick={() => editEmailRecipient(email)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-lime-100"
                      aria-label={`编辑邮箱 ${email}`}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEmailRecipient(email)}
                      disabled={emailRecipients.length <= 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`删除邮箱 ${email}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void sendLatestEmailNotification()}
                disabled={isEmailSending || notices.length === 0 || emailRecipients.length === 0}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-lime-300/25 bg-lime-300 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEmailSending ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <Mail size={15} aria-hidden="true" />}
                发送最新一条
              </button>
              <div className="mt-3 flex gap-2">
                <label className="sr-only" htmlFor="codex-reset-email-input">提醒邮箱</label>
                <input
                  id="codex-reset-email-input"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      upsertEmailRecipient();
                    }
                    if (event.key === "Escape") {
                      cancelEmailEdit();
                    }
                  }}
                  placeholder="name@example.com"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/25 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-300/50"
                />
                {editingEmail ? (
                  <button
                    type="button"
                    onClick={cancelEmailEdit}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:border-lime-300/30 hover:text-lime-100"
                    aria-label="取消编辑邮箱"
                  >
                    <XIcon size={16} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={upsertEmailRecipient}
                  disabled={!emailInput.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-lime-300/25 bg-lime-300 text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={editingEmail ? "保存邮箱" : "新增邮箱"}
                >
                  {editingEmail ? <Save size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                </button>
              </div>
              {emailMessage ? <p className="mt-3 text-xs leading-5 text-lime-100">{emailMessage}</p> : null}
              {emailError ? <p className="mt-3 text-xs leading-5 text-red-200">{emailError}</p> : null}
              <p className="mt-2 text-xs leading-5 text-zinc-500">手动发送当前公告列表里的最新一条。</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#080b08] p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">监控账号</h2>
                <button
                  type="button"
                  onClick={resetAccounts}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[11px] font-semibold text-zinc-300 transition hover:border-lime-300/30 hover:text-lime-100"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  默认
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {accounts.map((account) => (
                  <div key={account} className="flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-100">@{account}</span>
                    <button
                      type="button"
                      onClick={() => editAccount(account)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-lime-100"
                      aria-label={`编辑 @${account}`}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAccount(account)}
                      disabled={accounts.length <= 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`删除 @${account}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <label className="sr-only" htmlFor="codex-reset-account-input">X 账号</label>
                <input
                  id="codex-reset-account-input"
                  value={accountInput}
                  onChange={(event) => setAccountInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      upsertAccount();
                    }
                    if (event.key === "Escape") {
                      cancelAccountEdit();
                    }
                  }}
                  placeholder="@username"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/25 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-300/50"
                />
                {editingAccount ? (
                  <button
                    type="button"
                    onClick={cancelAccountEdit}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:border-lime-300/30 hover:text-lime-100"
                    aria-label="取消编辑"
                  >
                    <XIcon size={16} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={upsertAccount}
                  disabled={!accountInput.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-lime-300/25 bg-lime-300 text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={editingAccount ? "保存账号" : "新增账号"}
                >
                  {editingAccount ? <Save size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#080b08] p-4">
              <label className="block">
                <span className="text-sm font-semibold text-white">关键词</span>
                <textarea
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  onBlur={() => persistState({ keywordInput })}
                  rows={5}
                  className="mt-3 w-full resize-none rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-300/50"
                />
              </label>
              <p className="mt-2 text-xs leading-5 text-zinc-500">用英文逗号分隔。当前监听 {accounts.length} 个账号。</p>
            </div>

            {rateLimit ? (
              <div className="rounded-lg border border-white/10 bg-[#080b08] p-4">
                <h2 className="text-sm font-semibold text-white">X API 限额</h2>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border border-white/10 bg-black/25 px-2 py-3">
                    <p className="text-[10px] uppercase text-zinc-600">limit</p>
                    <p className="mt-1 font-mono text-sm text-zinc-200">{rateLimit.limit ?? "-"}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/25 px-2 py-3">
                    <p className="text-[10px] uppercase text-zinc-600">left</p>
                    <p className="mt-1 font-mono text-sm text-zinc-200">{rateLimit.remaining ?? "-"}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/25 px-2 py-3">
                    <p className="text-[10px] uppercase text-zinc-600">reset</p>
                    <p className="mt-1 font-mono text-sm text-zinc-200">{rateLimit.reset ?? "-"}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </aside>

          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-[#080b08] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">公告列表</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{statusCopy(status, notices.length)}</p>
                {error ? <p className="mt-2 text-xs leading-5 text-red-200">{error}</p> : null}
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={notices.length === 0}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-zinc-200 transition hover:border-lime-300/30 hover:text-lime-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck size={15} aria-hidden="true" />
                全部已读
              </button>
            </div>

            {notices.length === 0 ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <div>
                  <BellRing size={34} aria-hidden="true" className="mx-auto text-zinc-600" />
                  <p className="mt-4 text-sm font-semibold text-zinc-200">还没有捕捉到 Codex reset 公告</p>
                  <p className="mt-2 max-w-md text-xs leading-5 text-zinc-500">保持页面打开，或点击“立即检查”手动刷新。</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {notices.map((notice) => {
                  const unread = !readIds.has(notice.id);
                  return (
                    <article
                      key={notice.id}
                      className={`rounded-lg border p-4 transition ${
                        unread
                          ? "border-lime-300/35 bg-lime-300/[0.07]"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">@{notice.username}</span>
                            <span className="text-sm text-zinc-500">{notice.name}</span>
                            <span className="font-mono text-xs text-zinc-600">{formatDate(notice.createdAt)}</span>
                            {unread ? (
                              <span className="rounded-full border border-lime-300/30 bg-lime-300/10 px-2 py-0.5 text-[10px] font-semibold text-lime-100">NEW</span>
                            ) : null}
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{notice.text}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {notice.matchedKeywords.map((keyword) => (
                              <span key={keyword} className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-semibold text-zinc-400">
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => markAsRead(notice.id)}
                            disabled={!unread}
                            className="flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-zinc-200 transition hover:border-lime-300/30 hover:text-lime-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            已读
                          </button>
                          <a
                            href={notice.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-zinc-200 transition hover:border-lime-300/30 hover:text-lime-100"
                          >
                            原帖
                            <ExternalLink size={13} aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
