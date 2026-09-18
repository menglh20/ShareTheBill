import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  House,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ChevronDown,
  X,
  Wallet,
  ReceiptText,
  CalendarClock,
  Users,
  LogOut,
  Copy,
  Globe2,
  Shuffle,
  Upload,
  Pencil,
  Trash2,
  LockKeyhole,
  LoaderCircle,
  Sprout,
  CircleCheck,
  Clock3,
  Coffee,
  ShoppingBasket,
  Wifi,
  Bus,
  Sparkles,
  Lightbulb,
  CircleEllipsis,
} from "lucide-react";
import { LangContext, useLanguageState, useLang, weekdayNames } from "./i18n";
import {
  AVATARS,
  CATEGORIES,
  money,
  decimal,
  allocate,
  balances,
  settlements,
  beijingDate,
  nextOccurrence,
} from "../shared/domain.mjs";
import "./styles.css";

async function request(path, { method = "GET", body, token } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("networkError");
  }
  const data = await response
    .json()
    .catch(() => ({ error: "serverUnavailable" }));
  if (!response.ok) throw new Error(data.error || "serverError");
  return data;
}
function Brand({ small = false }) {
  const { t } = useLang();
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <House size={25} strokeWidth={1.7} />
      </span>
      <div>
        <strong>{t("brand")}</strong>
        <span>{t("brandSub")}</span>
      </div>
    </div>
  );
}
function LanguageButton() {
  const { lang, setLang, t } = useLang();
  return (
    <button
      className="language-button"
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      aria-label={t("language")}
    >
      <Globe2 size={16} />
      {lang === "zh" ? "EN" : "中文"}
    </button>
  );
}
function Avatar({ member, size = "", className = "" }) {
  const value = member?.avatar || "🌻";
  const color =
    (member?.name || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 5;
  return (
    <span className={`avatar ${size} avatar-${color} ${className}`}>
      {value.startsWith("data:") ? <img src={value} alt="" /> : value}
    </span>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const { t } = useLang();
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    element
      .querySelector("input:not([type=file]):not([readonly]), textarea, select")
      ?.focus();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ErrorNotice({ error }) {
  const { t } = useLang();
  return error ? (
    <div className="error-notice" role="alert">
      {t(error)}
    </div>
  ) : null;
}
function Empty({ icon: Icon = Sprout, title, text, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={30} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Submit({ busy, children }) {
  const { t } = useLang();
  return (
    <button className="button primary" disabled={busy} type="submit">
      {busy ? <LoaderCircle className="spin" size={17} /> : null}
      {busy ? t("saving") : children}
    </button>
  );
}
function useFormTask() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return {
    busy,
    error,
    setError,
    run: async (fn) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
  };
}
function ShareDialog({ url, onClose, title }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title || t("share")} onClose={onClose}>
      <div className="modal-body">
        <div className="share-art">
          <House size={40} />
          <span>🌿</span>
        </div>
        <p>{t("shareHint")}</p>
        <input
          className="share-url"
          value={url}
          readOnly
          aria-label={t("copyLink")}
          onFocus={(e) => e.target.select()}
        />
        <ErrorNotice error={error} />
        <button
          className="button primary full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setError("copyError");
            }
          }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
          {t(copied ? "copied" : "copyLink")}
        </button>
        <a className="button subtle full" href={url}>
          {t("enterBook")}
          <ArrowRight size={17} />
        </a>
      </div>
    </Modal>
  );
}
function Admin() {
  const { t } = useLang();
  const [books, setBooks] = useState(null),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(""),
    [modal, setModal] = useState(null);
  const form = useFormTask();
  const load = async () => {
    setLoadError("");
    try {
      setBooks(await request("/admin/books"));
    } catch (e) {
      if (e.message !== "unauthorized") setLoadError(e.message);
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="admin-page">
      <header className="public-header">
        <Brand />
        <div className="header-actions">
          <LanguageButton />
          {books && (
            <button
              className="button subtle"
              onClick={() =>
                form.run(async () => {
                  await request("/admin/logout", { method: "POST" });
                  setBooks(null);
                })
              }
            >
              <LogOut size={17} />
              {t("logout")}
            </button>
          )}
        </div>
      </header>
      {!loaded ? (
        <div className="loading">
          <LoaderCircle className="spin" />
          {t("loading")}
        </div>
      ) : books ? (
        <main className="admin-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t("adminOnly")}</span>
              <h1>{t("booksTitle")}</h1>
              <p>{t("booksIntro")}</p>
            </div>
            <button
              className="button primary"
              onClick={() => setModal({ type: "create" })}
            >
              <Plus size={18} />
              {t("newBook")}
            </button>
          </div>
          <div className="book-grid">
            {books.map((book, i) => (
              <article
                className={`book-card book-color-${i % 3}`}
                key={book.id}
              >
                <a href={`/b/${book.id}`} className="book-card-link">
                  <span className="book-illustration">
                    <House size={38} strokeWidth={1.3} />
                  </span>
                  <span className="currency-tag">{book.currency}</span>
                  <h2>{book.name}</h2>
                  <p>
                    <Users size={15} />
                    {t("people", { n: book.memberCount })}
                  </p>
                  <span className="book-open">
                    {t("enterBook")}
                    <ArrowUpRight size={20} />
                  </span>
                </a>
                <button
                  className="icon-button book-copy"
                  aria-label={t("copyLink")}
                  onClick={() =>
                    setModal({
                      type: "share",
                      url: `${location.origin}/b/${book.id}`,
                    })
                  }
                >
                  <Copy size={17} />
                </button>
              </article>
            ))}
          </div>
          {!books.length && (
            <Empty title={t("noBooks")} text={t("noBooksHint")} />
          )}
          <ErrorNotice error={form.error} />
        </main>
      ) : (
        <main className="login-wrap">
          <div className="login-art">
            <div className="house-drawing">
              <House size={112} strokeWidth={1} />
              <span className="plant">🌿</span>
              <span className="sun">✳</span>
            </div>
            <p>
              MAKE ROOM FOR
              <br />
              <em>living together.</em>
            </p>
          </div>
          <form
            className="login-card"
            onSubmit={(e) => {
              e.preventDefault();
              const password = new FormData(e.currentTarget).get("password");
              form.run(async () => {
                await request("/admin/login", {
                  method: "POST",
                  body: { password },
                });
                await load();
              });
            }}
          >
            <span className="eyebrow">
              <LockKeyhole size={14} />
              {t("adminOnly")}
            </span>
            <h1>{t("adminTitle")}</h1>
            <p>{t("adminIntro")}</p>
            <label>
              {t("password")}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </label>
            <ErrorNotice error={form.error || loadError} />
            <Submit busy={form.busy}>
              {t("login")}
              <ArrowRight size={18} />
            </Submit>
          </form>
        </main>
      )}
      {modal?.type === "create" && (
        <Modal title={t("newBook")} onClose={() => setModal(null)}>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              form.run(async () => {
                const book = await request("/admin/books", {
                  method: "POST",
                  body: values,
                });
                await load();
                setModal({
                  type: "share",
                  url: `${location.origin}/b/${book.id}`,
                  title: t("bookCreated"),
                });
              });
            }}
          >
            <label>
              {t("bookName")}
              <input
                name="name"
                maxLength={60}
                placeholder={t("bookPlaceholder")}
                required
                autoFocus
              />
            </label>
            <label>
              {t("currency")}
              <select name="currency">
                <option value="USD">{t("usd")}</option>
                <option value="CNY">{t("cny")}</option>
              </select>
            </label>
            <ErrorNotice error={form.error} />
            <div className="form-footer">
              <button
                className="button subtle"
                type="button"
                onClick={() => setModal(null)}
              >
                {t("cancel")}
              </button>
              <Submit busy={form.busy}>{t("createBook")}</Submit>
            </div>
          </form>
        </Modal>
      )}
      {modal?.type === "share" && (
        <ShareDialog {...modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
function ProfileForm({ existing, bookId, token, onSaved, onClose }) {
  const { t } = useLang();
  const [name, setName] = useState(existing?.name || ""),
    [avatar, setAvatar] = useState(
      existing?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
    );
  const form = useFormTask();
  async function upload(file) {
    if (!file) return;
    form.setError("");
    if (file.size > 5 * 1024 * 1024) return form.setError("fileTooLarge");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return form.setError("invalidAvatar");
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 192;
      const context = canvas.getContext("2d");
      const edge = Math.min(bitmap.width, bitmap.height);
      context.drawImage(
        bitmap,
        (bitmap.width - edge) / 2,
        (bitmap.height - edge) / 2,
        edge,
        edge,
        0,
        0,
        192,
        192,
      );
      bitmap.close();
      setAvatar(canvas.toDataURL("image/webp", 0.85));
    } catch {
      form.setError("invalidAvatar");
    }
  }
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        form.run(async () => {
          const result = await request(
            `/books/${bookId}/members${existing ? "/me" : ""}`,
            {
              method: existing ? "PATCH" : "POST",
              token,
              body: { name, avatar },
            },
          );
          await onSaved(existing?.id || result.id);
        });
      }}
    >
      <div className="avatar-editor">
        <Avatar member={{ name, avatar }} size="xl" />
        <div>
          <button
            className="button subtle"
            type="button"
            onClick={() =>
              setAvatar(
                AVATARS.filter((a) => a !== avatar)[
                  Math.floor(
                    Math.random() *
                      (AVATARS.length - (AVATARS.includes(avatar) ? 1 : 0)),
                  )
                ],
              )
            }
          >
            <Shuffle size={16} />
            {t("randomAvatar")}
          </button>
          <label className="button subtle upload-label">
            <Upload size={16} />
            {t("uploadAvatar")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => upload(e.target.files[0])}
            />
          </label>
        </div>
      </div>
      <p className="field-hint">{t("avatarHint")}</p>
      <label>
        {t("name")}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={t("namePlaceholder")}
          required
          autoFocus
        />
      </label>
      <ErrorNotice error={form.error} />
      <div className="form-footer">
        <button className="button subtle" type="button" onClick={onClose}>
          {t("cancel")}
        </button>
        <Submit busy={form.busy}>{t(existing ? "saveProfile" : "join")}</Submit>
      </div>
    </form>
  );
}
function IdentityPicker({ data, onSelect, onCreate, error }) {
  const { t } = useLang();
  return (
    <div className="identity-content">
      <span className="eyebrow">{data.book.name}</span>
      <h1>{t("chooseIdentity")}</h1>
      <p>{t("chooseHint")}</p>
      <div className="identity-grid">
        {data.members.map((member) => (
          <button
            key={member.id}
            className="identity-card"
            onClick={() => onSelect(member.id)}
          >
            <Avatar member={member} size="xl" />
            <strong>{member.name}</strong>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      {!data.members.length && <p>{t("noMembers")}</p>}
      <ErrorNotice error={error} />
      <div className="identity-footer">
        <span>{t("firstHere")}</span>
        <button className="button primary" onClick={onCreate}>
          <Plus size={18} />
          {t("newIdentity")}
        </button>
      </div>
    </div>
  );
}
function App() {
  const language = useLanguageState();
  useEffect(() => {
    document.documentElement.lang = language.lang === "zh" ? "zh-CN" : "en";
    document.title =
      language.lang === "zh"
        ? "同一屋檐 · ShareTheBill"
        : "Under one roof · ShareTheBill";
  }, [language.lang]);
  const match = location.pathname.match(/^\/b\/([a-zA-Z0-9-]+)\/?$/);
  return (
    <LangContext.Provider value={language}>
      {match ? <Book bookId={match[1]} /> : <Admin />}
    </LangContext.Provider>
  );
}
const CATEGORY_ICONS = {
  rent: House,
  utilities: Lightbulb,
  internet: Wifi,
  household: Sparkles,
  groceries: ShoppingBasket,
  dining: Coffee,
  transport: Bus,
  fun: Sparkles,
  other: CircleEllipsis,
};
const COLORS = [
  "#678272",
  "#d2a17e",
  "#8f9bad",
  "#b9aa87",
  "#91a889",
  "#cb917d",
  "#b4bca9",
  "#b6a1b7",
  "#c4beb1",
];
function Book({ bookId }) {
  const { t, lang } = useLang();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [identity, setIdentity] = useState(() => {
      try {
        return JSON.parse(sessionStorage.getItem(`stb-${bookId}`));
      } catch {
        return null;
      }
    });
  const [tab, setTab] = useState("overview"),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState("");
  const selectForm = useFormTask();
  const load = async () => {
    const result = await request(`/books/${bookId}`);
    setData(result);
    setError("");
    return result;
  };
  useEffect(() => {
    let active = true;
    const refresh = () =>
      request(`/books/${bookId}`)
        .then((result) => {
          if (active) {
            setData(result);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [bookId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function select(memberId) {
    await selectForm.run(async () => {
      const result = await request(`/books/${bookId}/identity`, {
        method: "POST",
        body: { memberId },
      });
      const selected = { memberId, token: result.token };
      setIdentity(selected);
      try {
        sessionStorage.setItem(`stb-${bookId}`, JSON.stringify(selected));
      } catch {
        /* Keep identity in memory. */
      }
      setModal(null);
    });
  }
  async function changed(message = "saved") {
    await load();
    setModal(null);
    setToast(t(message));
  }
  const me = data?.members.find((m) => m.id === identity?.memberId);
  if (!data)
    return (
      <div>
        <header className="public-header">
          <Brand />
          <LanguageButton />
        </header>
        <div className="loading">
          {error ? (
            <>
              <ErrorNotice error={error} />
              <button
                className="button primary"
                onClick={() => load().catch((e) => setError(e.message))}
              >
                {t("retry")}
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" />
              {t("loading")}
            </>
          )}
        </div>
      </div>
    );
  if (!me)
    return (
      <div className="identity-page">
        <header className="public-header">
          <Brand />
          <LanguageButton />
        </header>
        <IdentityPicker
          data={data}
          onSelect={select}
          onCreate={() => setModal({ type: "profile" })}
          error={selectForm.error || error}
        />
        {modal?.type === "profile" && (
          <Modal title={t("newIdentity")} onClose={() => setModal(null)}>
            <ProfileForm
              bookId={bookId}
              onClose={() => setModal(null)}
              onSaved={async (id) => {
                await load();
                await select(id);
              }}
            />
          </Modal>
        )}
      </div>
    );
  const memberById = (id) => data.members.find((m) => m.id === id);
  const name = (id) => memberById(id)?.name || "—";
  const format = (cents) =>
    new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: data.book.currency,
      currencyDisplay: "narrowSymbol",
    }).format(cents / 100);
  const dateLabel = (date, withTime = false) =>
    new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Shanghai",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(date.length === 10 ? `${date}T00:00:00Z` : date));
  const balanceMap = balances(data.members, data.records),
    mine = balanceMap[me.id],
    transfers = settlements(balanceMap);
  const categories = CATEGORIES.map((category, i) => ({
    category,
    color: COLORS[i],
    amount: data.records
      .filter(
        (r) => r.kind === "expense" && !r.deletedAt && r.category === category,
      )
      .reduce(
        (sum, r) =>
          sum + (r.shares.find((s) => s.memberId === me.id)?.amount || 0),
        0,
      ),
  })).filter((c) => c.amount);
  let degree = 0;
  const gradient = categories
    .map((c) => {
      const start = degree;
      degree += (c.amount / mine.spent) * 360;
      return `${c.color} ${start}deg ${degree}deg`;
    })
    .join(",");
  const activeTimers = data.timers.filter((timer) => !timer.deletedAt);
  const common = {
    bookId,
    token: identity.token,
    me,
    members: data.members,
    format,
    name,
    dateLabel,
    onClose: () => setModal(null),
    onSaved: changed,
  };
  const openExpense = () => setModal({ type: "expense" });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-book">
          <span className="eyebrow">{data.book.currency} · SHARED HOME</span>
          <strong>{data.book.name}</strong>
        </div>
        <nav className="main-nav" aria-label={t("overview")}>
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <Wallet size={19} />
            {t("overview")}
          </button>
          <button
            className={tab === "recurring" ? "active" : ""}
            onClick={() => setTab("recurring")}
          >
            <CalendarClock size={19} />
            {t("recurring")}
            <span className="nav-count">{activeTimers.length}</span>
          </button>
        </nav>
        <div className="sidebar-members">
          <span className="section-label">
            {t("roommates")}
            <span>{data.members.length}</span>
          </span>
          {data.members.map((member) => (
            <div className="member-row" key={member.id}>
              <Avatar member={member} size="sm" />
              <span>{member.name}</span>
              {member.id === me.id && <small>{t("you")}</small>}
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="mini-house">
            <House size={28} strokeWidth={1.2} />
            <span>
              SHARED SPACE.
              <br />
              SHARED STORIES.
            </span>
          </div>
          <button onClick={() => setModal({ type: "identity" })}>
            <LogOut size={17} />
            {t("switchIdentity")}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div className="breadcrumb">
            <House size={16} />
            <span>{data.book.name}</span>
            <ChevronRight size={14} />
            <strong>{t(tab)}</strong>
          </div>
          <div className="header-actions">
            <LanguageButton />
            <button
              className="profile-button"
              onClick={() => setModal({ type: "profile", item: me })}
              title={t("profile")}
              aria-label={t("profile")}
            >
              <Avatar member={me} size="sm" />
              <span>{me.name}</span>
              <ChevronDown size={14} />
            </button>
            <button
              className="icon-button mobile-switch"
              aria-label={t("switchIdentity")}
              onClick={() => setModal({ type: "identity" })}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="dashboard">
          <div className="page-heading">
            <div>
              <div className="greeting-label">
                <span className="little-dot" />
                {data.book.name}
              </div>
              <h1>
                {tab === "overview"
                  ? t("greeting", { name: me.name })
                  : t("recurring")}
                <span className="greeting-icon">
                  {tab === "overview" ? "☀" : "◷"}
                </span>
              </h1>
              <p>{t(tab === "overview" ? "greetingSub" : "timerHint")}</p>
            </div>
            <button
              className="button outlined invite-button"
              onClick={() => setModal({ type: "share" })}
            >
              <Users size={17} />
              {t("share")}
            </button>
          </div>
          <ErrorNotice error={error} />
          {tab === "overview" ? (
            <>
              <section className="summary-grid" aria-label={t("balance")}>
                <div className="balance-card">
                  <div className="card-label">
                    <span>{t("balance")}</span>
                    <Wallet size={19} />
                  </div>
                  <span className="balance-direction">
                    {t(
                      mine.net > 0
                        ? "owedToYou"
                        : mine.net < 0
                          ? "youOwe"
                          : "allSettled",
                    )}
                  </span>
                  <strong className="balance-amount">
                    {format(Math.abs(mine.net))}
                    <span>{data.book.currency}</span>
                  </strong>
                  <div className="balance-foot">
                    <span className="balance-check">
                      <Check size={12} />
                    </span>
                    {t(mine.net === 0 ? "settledHint" : "balanceHint")}
                  </div>
                </div>
                <div className="metric-card">
                  <span className="metric-icon peach">
                    <ShoppingBasket size={21} />
                  </span>
                  <div>
                    <span>{t("mySpent")}</span>
                    <strong>{format(mine.spent)}</strong>
                    <small>{t("allTime")}</small>
                  </div>
                </div>
                <div className="metric-card">
                  <span className="metric-icon sage">
                    <ArrowUpRight size={22} />
                  </span>
                  <div>
                    <span>{t("myPaid")}</span>
                    <strong>{format(mine.paid)}</strong>
                    <small>{t("allTime")}</small>
                  </div>
                </div>
              </section>
              <div className="transfer-stats">
                <span>
                  <ArrowUpRight size={15} />
                  {t("mySent")}
                  <strong>{format(mine.sent)}</strong>
                </span>
                <span>
                  <ArrowDownLeft size={15} />
                  {t("myReceived")}
                  <strong>{format(mine.received)}</strong>
                </span>
              </div>
              <div className="quick-actions">
                <button className="button primary" onClick={openExpense}>
                  <Plus size={19} />
                  {t("addExpense")}
                </button>
                <button
                  className="button outlined"
                  onClick={() => setModal({ type: "payment" })}
                >
                  <ArrowUpRight size={18} />
                  {t("addPayment")}
                </button>
                <button
                  className="button subtle recurring-action"
                  onClick={() => setModal({ type: "timer" })}
                >
                  <CalendarClock size={18} />
                  {t("addRecurring")}
                </button>
              </div>
              <div className="content-grid">
                <section className="panel ledger-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {t("records")}
                        <span className="count">{data.records.length}</span>
                      </h2>
                      <p>{t("recordsHint")}</p>
                    </div>
                    <ReceiptText size={21} />
                  </div>
                  <div
                    className="filter-tabs"
                    role="group"
                    aria-label={t("records")}
                  >
                    {["all", "expense", "payment"].map((value) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        className={filter === value ? "selected" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {t(value)}
                      </button>
                    ))}
                  </div>
                  <div className="record-list">
                    {data.records
                      .filter((r) => filter === "all" || r.kind === filter)
                      .map((record) => {
                        const Icon =
                          record.kind === "payment"
                            ? ArrowUpRight
                            : CATEGORY_ICONS[record.category];
                        const share = record.shares?.find(
                          (s) => s.memberId === me.id,
                        )?.amount;
                        return (
                          <button
                            key={record.id}
                            className={`record-row ${record.deletedAt ? "is-deleted" : ""}`}
                            onClick={() =>
                              setModal({
                                type: "detail",
                                item: record,
                                entity: "records",
                              })
                            }
                          >
                            <span
                              className={`category-icon category-${record.kind === "payment" ? "payment" : record.category}`}
                            >
                              <Icon size={21} strokeWidth={1.7} />
                            </span>
                            <div className="record-main">
                              <div className="record-title">
                                <strong>
                                  {record.kind === "payment"
                                    ? t("paymentBetween", {
                                        from: name(record.ownerId),
                                        to: name(record.recipientId),
                                      })
                                    : record.title}
                                </strong>
                                {record.deletedAt ? (
                                  <span className="badge deleted-badge">
                                    {t("deleted")}
                                  </span>
                                ) : record.revision > 1 ? (
                                  <span className="badge">{t("edited")}</span>
                                ) : null}
                              </div>
                              <div className="record-meta">
                                <span>{dateLabel(record.date)}</span>
                                <span>·</span>
                                <span>
                                  {record.kind === "expense"
                                    ? t("paidBy", {
                                        name: name(record.ownerId),
                                      })
                                    : t("payment")}
                                </span>
                                {record.timerId && (
                                  <CalendarClock
                                    size={13}
                                    aria-label={t("automatic")}
                                  />
                                )}
                              </div>
                            </div>
                            <div className="record-amount">
                              <strong>{format(record.amount)}</strong>
                              <small>
                                {record.kind === "expense"
                                  ? share !== undefined
                                    ? t("yourShare", { amount: format(share) })
                                    : t("notInvolved")
                                  : t("payment")}
                              </small>
                            </div>
                            <ChevronRight className="row-chevron" size={16} />
                          </button>
                        );
                      })}
                  </div>
                  {!data.records.some(
                    (r) => filter === "all" || r.kind === filter,
                  ) && (
                    <Empty
                      icon={ReceiptText}
                      title={t("noRecords")}
                      text={t("noRecordsHint")}
                    >
                      <button className="button subtle" onClick={openExpense}>
                        <Plus size={16} />
                        {t("addExpense")}
                      </button>
                    </Empty>
                  )}
                </section>
                <div className="right-column">
                  <section className="panel settlement-panel">
                    <div className="panel-heading">
                      <h2>{t("suggestions")}</h2>
                      <span className="tiny-icon">
                        <ArrowRight size={17} />
                      </span>
                    </div>
                    <p className="section-description">
                      {t("suggestionsHint")}
                    </p>
                    {transfers.length ? (
                      <div className="settlement-list">
                        {transfers.map((transfer, i) => (
                          <div
                            className={`settlement ${transfer.from === me.id || transfer.to === me.id ? "involved" : ""}`}
                            key={i}
                          >
                            <div className="settlement-people">
                              <Avatar
                                member={memberById(transfer.from)}
                                size="sm"
                              />
                              <span>{name(transfer.from)}</span>
                              <ArrowRight size={15} />
                              <span>{name(transfer.to)}</span>
                            </div>
                            <div className="settlement-value">
                              <strong>{format(transfer.amount)}</strong>
                              {transfer.from === me.id && (
                                <button
                                  title={t("recordThis")}
                                  aria-label={t("recordThis")}
                                  onClick={() =>
                                    setModal({
                                      type: "payment",
                                      preset: transfer,
                                    })
                                  }
                                >
                                  <ArrowUpRight size={17} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="settled-state">
                        <span>
                          <CircleCheck size={28} strokeWidth={1.5} />
                        </span>
                        <strong>{t("noSuggestions")}</strong>
                        <p>{t("noSuggestionsHint")}</p>
                      </div>
                    )}
                  </section>
                  <section className="panel breakdown-panel">
                    <div className="panel-heading">
                      <h2>{t("categoryBreakdown")}</h2>
                      <span className="tiny-icon peach">
                        <ShoppingBasket size={17} />
                      </span>
                    </div>
                    <div
                      className="donut"
                      style={{
                        background: gradient
                          ? `conic-gradient(${gradient})`
                          : "#eaece5",
                      }}
                      role="img"
                      aria-label={`${t("mySpent")}: ${format(mine.spent)}`}
                    >
                      <div>
                        <span>{t("total")}</span>
                        <strong>{format(mine.spent)}</strong>
                      </div>
                    </div>
                    <div className="category-legend">
                      {categories.map((c) => (
                        <div key={c.category}>
                          <span>
                            <i style={{ background: c.color }} />
                            {t(c.category)}
                          </span>
                          <strong>{format(c.amount)}</strong>
                        </div>
                      ))}
                      {!categories.length && <p>{t("noSpending")}</p>}
                    </div>
                  </section>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="timers-toolbar">
                <span className="time-note">
                  <Clock3 size={17} />
                  {t("beijing")}
                </span>
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "timer" })}
                >
                  <Plus size={18} />
                  {t("addRecurring")}
                </button>
              </div>
              <div className="timer-grid">
                {data.timers.map((timer) => (
                  <button
                    key={timer.id}
                    className={`timer-card ${timer.deletedAt ? "is-stopped" : ""}`}
                    onClick={() =>
                      setModal({
                        type: "detail",
                        item: timer,
                        entity: "timers",
                      })
                    }
                  >
                    <div className="timer-top">
                      <span
                        className={`category-icon category-${timer.expense.category}`}
                      >
                        <CalendarClock size={23} />
                      </span>
                      <span
                        className={`badge ${timer.deletedAt ? "" : "active-badge"}`}
                      >
                        {t(timer.deletedAt ? "stopped" : "activeTimers")}
                      </span>
                    </div>
                    <h3>{timer.expense.title}</h3>
                    <strong className="timer-amount">
                      {format(timer.expense.amount)}
                    </strong>
                    <p>{scheduleLabel(timer.schedule, t, lang)}</p>
                    <div className="timer-bottom">
                      <span>{t("paidBy", { name: name(timer.ownerId) })}</span>
                      <span>
                        {timer.deletedAt
                          ? t("stopped")
                          : `${t("nextRun")} · ${dateLabel(timer.nextDate)}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {!data.timers.length && (
                <Empty
                  icon={CalendarClock}
                  title={t("noTimers")}
                  text={t("noTimersHint")}
                />
              )}
            </>
          )}
          <footer className="dashboard-footer">
            <House size={14} />
            {t("brand")}
            <span>·</span>SHARE THE BILL
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal?.type === "share" && (
        <ShareDialog
          url={`${location.origin}/b/${bookId}`}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "identity" && (
        <Modal title={t("switchIdentity")} onClose={() => setModal(null)} wide>
          <IdentityPicker
            data={data}
            onSelect={select}
            onCreate={() => setModal({ type: "profile" })}
            error={selectForm.error}
          />
        </Modal>
      )}
      {modal?.type === "profile" && (
        <Modal
          title={t(modal.item ? "profile" : "newIdentity")}
          onClose={() => setModal(null)}
        >
          <ProfileForm
            existing={modal.item}
            {...common}
            onSaved={async (id) => {
              await load();
              if (!modal.item) await select(id);
              else setModal(null);
            }}
          />
        </Modal>
      )}
      {["expense", "payment", "timer"].includes(modal?.type) && (
        <Modal
          title={t(
            modal.item
              ? "editAction"
              : modal.type === "timer"
                ? "addRecurring"
                : modal.type === "expense"
                  ? "addExpense"
                  : "addPayment",
          )}
          onClose={() => setModal(null)}
          wide
        >
          <EntryForm
            key={`${modal.type}-${modal.item?.id || "new"}`}
            {...common}
            type={modal.type}
            item={modal.item}
            preset={modal.preset}
          />
        </Modal>
      )}
      {modal?.type === "detail" && (
        <Modal
          title={t(modal.entity === "timers" ? "timerDetails" : "details")}
          onClose={() => setModal(null)}
          wide
        >
          <Details
            {...common}
            item={modal.item}
            entity={modal.entity}
            onEdit={() =>
              setModal({
                type: modal.entity === "timers" ? "timer" : modal.item.kind,
                item: modal.item,
              })
            }
          />
        </Modal>
      )}
    </div>
  );
}
function scheduleLabel(schedule, t, lang) {
  return t(
    `schedule${schedule.frequency[0].toUpperCase()}${schedule.frequency.slice(1)}`,
    {
      day:
        schedule.frequency === "weekly"
          ? weekdayNames(lang)[schedule.weekday]
          : schedule.day,
      month: schedule.month,
    },
  );
}
function EntryForm({
  type,
  item,
  preset,
  bookId,
  token,
  me,
  members,
  format,
  onClose,
  onSaved,
}) {
  const { t, lang } = useLang();
  const form = useFormTask();
  const source = type === "timer" ? item?.expense : item;
  const [title, setTitle] = useState(source?.title || ""),
    [amount, setAmount] = useState(
      source ? decimal(source.amount) : preset ? decimal(preset.amount) : "",
    ),
    [category, setCategory] = useState(source?.category || "groceries"),
    [date, setDate] = useState(source?.date || beijingDate()),
    [note, setNote] = useState(source?.note || "");
  const [recipient, setRecipient] = useState(
      source?.recipientId || preset?.to || "",
    ),
    [mode, setMode] = useState(source?.splitMode || "equal");
  const [selected, setSelected] = useState(
      source?.shares?.map((s) => s.memberId) || members.map((m) => m.id),
    ),
    [values, setValues] = useState(
      Object.fromEntries(
        source?.shares?.map((s) => [s.memberId, s.value]) || [],
      ),
    );
  const [schedule, setSchedule] = useState(
    item?.schedule || { frequency: "monthly", day: 1, month: 1, weekday: 1 },
  );
  const requestId = useRef(crypto.randomUUID());
  const shareEntries = selected.map((memberId) => ({
    memberId,
    value: values[memberId] || "0",
  }));
  let preview = [],
    previewError = "";
  if (type !== "payment" && amount) {
    try {
      preview = allocate(money(amount), mode, shareEntries);
    } catch (e) {
      previewError = e.message;
    }
  }
  let nextDate = "";
  if (type === "timer") {
    try {
      nextDate = nextOccurrence(schedule, beijingDate());
    } catch {
      /* Form validation displays schedule errors on submit. */
    }
  }
  function changeMode(nextMode) {
    setMode(nextMode);
    if (nextMode === "equal" || !selected.length) return;
    let total = 10000;
    if (nextMode === "exact") {
      try {
        total = money(amount);
      } catch {
        total = 0;
      }
    }
    setValues(
      Object.fromEntries(
        allocate(
          total,
          "equal",
          selected.map((memberId) => ({ memberId })),
        ).map((s) => [s.memberId, decimal(s.amount)]),
      ),
    );
  }
  const maxDay =
    schedule.frequency === "yearly"
      ? new Date(Date.UTC(2000, schedule.month, 0)).getUTCDate()
      : 31;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.run(async () => {
          money(amount);
          if (type !== "payment") allocate(money(amount), mode, shareEntries);
          const body = {
            requestId: requestId.current,
            revision: item?.revision,
            kind: type === "payment" ? "payment" : "expense",
            title,
            amount,
            category,
            date,
            note,
            recipientId: recipient,
            splitMode: mode,
            shares: shareEntries,
            ...(type === "timer" ? { schedule } : {}),
          };
          await request(
            `/books/${bookId}/${type === "timer" ? "timers" : "records"}${item ? `/${item.id}` : ""}`,
            { method: item ? "PATCH" : "POST", token, body },
          );
          await onSaved();
        });
      }}
    >
      <div className="modal-body entry-body">
        <div className="payer-strip">
          <Avatar member={me} size="sm" />
          <div>
            <span>{t("payer")}</span>
            <strong>{me.name}</strong>
          </div>
          <span className="badge">{t("you")}</span>
        </div>
        {type === "payment" ? (
          <>
            <p className="info-box">
              <ArrowUpRight size={18} />
              {t("paymentHint")}
            </p>
            <label>
              {t("recipient")}
              <select
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required
              >
                <option value="">{t("chooseRecipient")}</option>
                {members
                  .filter((m) => m.id !== me.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            {members.length < 2 && (
              <p className="field-hint">{t("noRecipient")}</p>
            )}
          </>
        ) : (
          <label>
            {t("title")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={100}
              placeholder={t("titlePlaceholder")}
              autoFocus
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            {t("amount")}
            <input
              className="amount-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
          {type !== "payment" ? (
            <label>
              {t("category")}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              {t("date")}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min="2000-01-01"
                max="2100-12-31"
                required
              />
            </label>
          )}
        </div>
        {type === "expense" && (
          <label>
            {t("date")}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min="2000-01-01"
              max="2100-12-31"
              required
            />
          </label>
        )}
        {type !== "payment" && (
          <>
            <div className="field-heading">
              <strong>{t("splitWith")}</strong>
              <button
                className="text-button"
                type="button"
                onClick={() => setSelected(members.map((m) => m.id))}
              >
                {t("selectAll")}
              </button>
            </div>
            <p className="field-hint no-margin">{t("payerHint")}</p>
            <div
              className="segmented"
              role="group"
              aria-label={t("splitMethod")}
            >
              {["equal", "percent", "exact"].map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={mode === value}
                  className={mode === value ? "selected" : ""}
                  onClick={() => changeMode(value)}
                >
                  {t(value)}
                </button>
              ))}
            </div>
            <div className="split-people">
              {members.map((member) => (
                <div
                  className={`split-row ${selected.includes(member.id) ? "included" : ""}`}
                  key={member.id}
                >
                  <label className="split-person">
                    <input
                      type="checkbox"
                      checked={selected.includes(member.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, member.id]
                            : selected.filter((id) => id !== member.id),
                        )
                      }
                    />
                    <Avatar member={member} size="sm" />
                    <span>
                      {member.name}
                      {member.id === me.id && <small> · {t("you")}</small>}
                    </span>
                  </label>
                  {selected.includes(member.id) &&
                    (mode === "equal" ? (
                      <span className="split-result">
                        {format(
                          preview.find((s) => s.memberId === member.id)
                            ?.amount || 0,
                        )}
                      </span>
                    ) : (
                      <div className="split-value">
                        <input
                          aria-label={`${member.name} ${t(mode)}`}
                          inputMode="decimal"
                          value={values[member.id] || ""}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [member.id]: e.target.value,
                            })
                          }
                          placeholder="0"
                        />
                        {mode === "percent" && <span>%</span>}
                        <small>
                          {format(
                            preview.find((s) => s.memberId === member.id)
                              ?.amount || 0,
                          )}
                        </small>
                      </div>
                    ))}
                </div>
              ))}
            </div>
            {previewError ? (
              <ErrorNotice error={previewError} />
            ) : (
              <p className="field-hint">{t("splitHint")}</p>
            )}
          </>
        )}
        {type === "timer" && (
          <div className="schedule-box">
            <h3>
              <CalendarClock size={18} />
              {t("schedule")}
            </h3>
            <label>
              {t("frequency")}
              <select
                value={schedule.frequency}
                onChange={(e) =>
                  setSchedule({
                    ...schedule,
                    frequency: e.target.value,
                    day: Math.min(schedule.day, 28),
                  })
                }
              >
                {["weekly", "monthly", "yearly"].map((f) => (
                  <option key={f} value={f}>
                    {t(f)}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              {schedule.frequency === "weekly" ? (
                <label>
                  {t("weekday")}
                  <select
                    value={schedule.weekday}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        weekday: Number(e.target.value),
                      })
                    }
                  >
                    {weekdayNames(lang).map((label, i) => (
                      <option value={i} key={i}>
                        {lang === "zh" ? `星期${label}` : label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  {schedule.frequency === "yearly" && (
                    <label>
                      {t("month")}
                      <select
                        value={schedule.month}
                        onChange={(e) => {
                          const month = Number(e.target.value);
                          setSchedule({
                            ...schedule,
                            month,
                            day: Math.min(
                              schedule.day,
                              new Date(Date.UTC(2000, month, 0)).getUTCDate(),
                            ),
                          });
                        }}
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i} value={i + 1}>
                            {t("monthNumber", { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    {t("day")}
                    <select
                      value={schedule.day}
                      onChange={(e) =>
                        setSchedule({
                          ...schedule,
                          day: Number(e.target.value),
                        })
                      }
                    >
                      {Array.from({ length: maxDay }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {t("dayNumber", { n: i + 1 })}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <p className="time-note">
              <Clock3 size={15} />
              {t("beijing")}
            </p>
            {nextDate && (
              <p className="next-date">
                {t("nextRun")} <strong>{nextDate}</strong>
              </p>
            )}
            <p className="field-hint">{t("shortMonth")}</p>
            {item && <p className="field-hint">{t("timerEditHint")}</p>}
          </div>
        )}
        <label>
          {t("note")} <span className="optional">{t("optional")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={t("notePlaceholder")}
          />
        </label>
        <ErrorNotice error={form.error} />
      </div>
      <div className="form-footer sticky-footer">
        <button className="button subtle" type="button" onClick={onClose}>
          {t("cancel")}
        </button>
        <Submit busy={form.busy}>
          {t(
            item
              ? "saveChanges"
              : type === "payment"
                ? "savePayment"
                : type === "timer"
                  ? "saveTimer"
                  : "saveExpense",
          )}
        </Submit>
      </div>
    </form>
  );
}
function Snapshot({ item, format, name, dateLabel }) {
  const { t, lang } = useLang();
  const value = item.expense || item;
  return (
    <div className="snapshot">
      <div className="snapshot-heading">
        <strong>
          {value.kind === "payment"
            ? t("paymentBetween", {
                from: name(item.ownerId),
                to: name(value.recipientId),
              })
            : value.title}
        </strong>
        <strong>{format(value.amount)}</strong>
      </div>
      <dl>
        {value.category && (
          <>
            <dt>{t("category")}</dt>
            <dd>{t(value.category)}</dd>
          </>
        )}
        <dt>{t("payer")}</dt>
        <dd>{name(item.ownerId)}</dd>
        {value.date && (
          <>
            <dt>{t("date")}</dt>
            <dd>{dateLabel(value.date)}</dd>
          </>
        )}
        {item.schedule && (
          <>
            <dt>{t("schedule")}</dt>
            <dd>
              {scheduleLabel(item.schedule, t, lang)}
              <small>{t("beijing")}</small>
            </dd>
          </>
        )}
        {value.splitMode && (
          <>
            <dt>{t("splitMethod")}</dt>
            <dd>{t(value.splitMode)}</dd>
          </>
        )}
        {value.shares?.map((share) => (
          <React.Fragment key={share.memberId}>
            <dt>{name(share.memberId)}</dt>
            <dd>
              {format(share.amount)}
              {value.splitMode === "percent" && <small>{share.value}%</small>}
            </dd>
          </React.Fragment>
        ))}
        {value.note && (
          <>
            <dt>{t("note")}</dt>
            <dd className="preserve-text">{value.note}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
function Details({
  item,
  entity,
  bookId,
  token,
  me,
  format,
  name,
  dateLabel,
  onEdit,
  onSaved,
}) {
  const { t } = useLang();
  const [history, setHistory] = useState(null),
    [loadError, setLoadError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const form = useFormTask();
  const load = () =>
    request(`/books/${bookId}/${entity}/${item.id}/history`)
      .then(setHistory)
      .catch((e) => setLoadError(e.message));
  useEffect(() => {
    load();
  }, [item.id]);
  const timer = entity === "timers";
  return (
    <div className="modal-body detail-body">
      <div className="detail-status">
        {item.deletedAt ? (
          <span className="badge deleted-badge">
            {t(timer ? "stopped" : "deleted")}
          </span>
        ) : (
          item.revision > 1 && <span className="badge">{t("edited")}</span>
        )}
        {item.timerId && (
          <span className="badge">
            <CalendarClock size={12} />
            {t("automatic")}
          </span>
        )}
      </div>
      <Snapshot {...{ item, format, name, dateLabel }} />
      {item.ownerId === me.id && !item.deletedAt ? (
        <div className="detail-actions">
          <button className="button outlined" onClick={onEdit}>
            <Pencil size={16} />
            {t("edit")}
          </button>
          <button
            className="button danger-subtle"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={16} />
            {t(timer ? "stop" : "delete")}
          </button>
        </div>
      ) : (
        item.ownerId !== me.id && <p className="field-hint">{t("onlyOwn")}</p>
      )}
      {confirm && (
        <div className="confirm-box" role="alert">
          <strong>{t(timer ? "stopConfirm" : "deleteConfirm")}</strong>
          <p>{t(timer ? "stopHint" : "deleteHint")}</p>
          <div>
            <button
              className="button subtle"
              disabled={form.busy}
              onClick={() => setConfirm(false)}
            >
              {t("cancel")}
            </button>
            <button
              className="button danger"
              disabled={form.busy}
              onClick={() =>
                form.run(async () => {
                  await request(`/books/${bookId}/${entity}/${item.id}`, {
                    method: "DELETE",
                    token,
                    body: { revision: item.revision },
                  });
                  await onSaved(timer ? "timerStopped" : "removed");
                })
              }
            >
              {form.busy
                ? t("saving")
                : t(timer ? "confirmStop" : "confirmDelete")}
            </button>
          </div>
          <ErrorNotice error={form.error} />
        </div>
      )}
      <div className="history-heading">
        <Clock3 size={18} />
        <h3>{t("history")}</h3>
      </div>
      <ErrorNotice error={loadError} />
      {loadError && (
        <button className="button subtle" onClick={load}>
          {t("retry")}
        </button>
      )}
      {!history && !loadError && <LoaderCircle size={20} className="spin" />}
      <div className="history-list">
        {history?.map((event, index) => (
          <details
            key={event.id}
            className="history-item"
            open={index === 0 ? true : undefined}
          >
            <summary>
              <span className={`history-dot ${event.action}`} />
              <div>
                <strong>
                  {t(
                    event.action === "edited"
                      ? "editAction"
                      : event.action === "deleted"
                        ? "deleteAction"
                        : event.action,
                  )}
                </strong>
                <span>
                  {t("byActor", {
                    name: name(event.actorId),
                    time: `${dateLabel(event.createdAt, true)} (UTC+8)`,
                  })}
                </span>
              </div>
              <ChevronDown size={17} />
            </summary>
            <div className="history-content">
              {event.before && (
                <div className="history-before">
                  <span className="eyebrow">{t("before")}</span>
                  <Snapshot
                    item={event.before}
                    {...{ format, name, dateLabel }}
                  />
                </div>
              )}
              <div>
                <span className="eyebrow">
                  {t("after")}
                  {event.after.deletedAt
                    ? ` · ${t(timer ? "stopped" : "deleted")}`
                    : ""}
                </span>
                <Snapshot item={event.after} {...{ format, name, dateLabel }} />
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
