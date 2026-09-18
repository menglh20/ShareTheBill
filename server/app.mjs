import express from "express";
import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  createHmac,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  AVATARS,
  CATEGORIES,
  RuleError,
  ensure,
  money,
  allocate,
  validDate,
  beijingDate,
  validateSchedule,
  nextOccurrence,
} from "../shared/domain.mjs";

// ponytail: one Railway instance with a SQLite volume; migrate to PostgreSQL before adding replicas.
export function createApp({
  databasePath = ":memory:",
  adminPassword,
  secret,
  appUrl = "http://localhost:5173",
  production = false,
  now = () => new Date(),
}) {
  if (!adminPassword || adminPassword.length < 12)
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  if (
    production &&
    (adminPassword === "roommates-local-2026" ||
      adminPassword.startsWith("replace-") ||
      secret.startsWith("replace-"))
  )
    throw new Error(
      "Production requires unique ADMIN_PASSWORD and SESSION_SECRET values.",
    );
  if (databasePath !== ":memory:")
    mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency IN ('USD','CNY')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), name TEXT NOT NULL, name_key TEXT NOT NULL, avatar TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(book_id,name_key));
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), owner_id TEXT NOT NULL REFERENCES members(id), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, timer_id TEXT, occurrence TEXT, UNIQUE(timer_id,occurrence));
    CREATE TABLE IF NOT EXISTS timers(id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), owner_id TEXT NOT NULL REFERENCES members(id), data TEXT NOT NULL, next_date TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES members(id), action TEXT NOT NULL, before_data TEXT, after_data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_book ON records(book_id,created_at);
    CREATE INDEX IF NOT EXISTS timers_due ON timers(next_date) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS history_entity ON history(entity_type,entity_id);`);
  const stamp = () => now().toISOString();
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const atomic = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const serialize = (r) => ({
    ...JSON.parse(r.data),
    id: r.id,
    ownerId: r.owner_id,
    revision: r.revision,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    ...(r.next_date ? { nextDate: r.next_date } : {}),
    ...(r.timer_id ? { timerId: r.timer_id } : {}),
  });
  const audit = (bookId, type, id, actor, action, before, after) =>
    run(
      "INSERT INTO history(book_id,entity_type,entity_id,actor_id,action,before_data,after_data,created_at) VALUES(?,?,?,?,?,?,?,?)",
      bookId,
      type,
      id,
      actor,
      action,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      stamp(),
    );
  function insertRecord(
    bookId,
    ownerId,
    data,
    timerId = null,
    occurrence = null,
    id = randomUUID(),
  ) {
    run(
      "INSERT INTO records(id,book_id,owner_id,data,created_at,timer_id,occurrence) VALUES(?,?,?,?,?,?,?)",
      id,
      bookId,
      ownerId,
      JSON.stringify(data),
      stamp(),
      timerId,
      occurrence,
    );
    const record = serialize(one("SELECT * FROM records WHERE id=?", id));
    audit(
      bookId,
      "records",
      id,
      ownerId,
      timerId ? "generated" : "created",
      null,
      record,
    );
    return record;
  }
  function runDue() {
    const today = beijingDate(now());
    atomic(() => {
      for (const timer of all(
        "SELECT * FROM timers WHERE deleted_at IS NULL AND next_date<=? ORDER BY next_date",
        today,
      )) {
        const data = JSON.parse(timer.data);
        let date = timer.next_date;
        while (date <= today) {
          if (
            !one(
              "SELECT id FROM records WHERE timer_id=? AND occurrence=?",
              timer.id,
              date,
            )
          )
            insertRecord(
              timer.book_id,
              timer.owner_id,
              { ...data.expense, date, kind: "expense" },
              timer.id,
              date,
            );
          date = nextOccurrence(data.schedule, date);
        }
        run("UPDATE timers SET next_date=? WHERE id=?", date, timer.id);
      }
    });
  }
  const sign = (payload) => {
    const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
  };
  function verify(token) {
    try {
      const [value, signature, extra] = token.split(".");
      const expected = createHmac("sha256", secret).update(value).digest();
      const received = Buffer.from(signature, "base64url");
      ensure(
        !extra &&
          received.length === expected.length &&
          timingSafeEqual(received, expected),
        "unauthorized",
        401,
      );
      const payload = JSON.parse(Buffer.from(value, "base64url").toString());
      ensure(payload.exp > now().getTime(), "unauthorized", 401);
      return payload;
    } catch {
      throw new RuleError("unauthorized", 401);
    }
  }
  const textField = (value, max = 100, optional = false) => {
    ensure(
      typeof value === "string" &&
        value.trim().length <= max &&
        (optional || value.trim().length > 0),
      "invalid",
    );
    return value.trim();
  };
  const getMembers = (bookId) =>
    all(
      "SELECT id,name,avatar,created_at AS createdAt FROM members WHERE book_id=? ORDER BY created_at,id",
      bookId,
    );
  function avatar(value) {
    if (AVATARS.includes(value)) return value;
    ensure(
      typeof value === "string" && value.length <= 350000,
      "invalidAvatar",
    );
    const match =
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    ensure(match, "invalidAvatar");
    const bytes = Buffer.from(match[2], "base64");
    const valid =
      match[1] === "png"
        ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
        : match[1] === "jpeg"
          ? bytes.subarray(0, 3).toString("hex") === "ffd8ff"
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    ensure(bytes.length <= 256000 && valid, "invalidAvatar");
    return value;
  }
  function expense(body, bookId) {
    const amount = money(body.amount);
    const members = new Set(getMembers(bookId).map((m) => m.id));
    ensure(
      Array.isArray(body.shares) &&
        body.shares.every((s) => s && members.has(s.memberId)),
      "invalidSplit",
    );
    ensure(CATEGORIES.includes(body.category), "invalidCategory");
    return {
      title: textField(body.title),
      amount,
      category: body.category,
      note: textField(body.note ?? "", 1000, true),
      splitMode: body.splitMode,
      shares: allocate(amount, body.splitMode, body.shares),
    };
  }
  function transaction(body, bookId, ownerId) {
    ensure(validDate(body.date), "invalidDate");
    if (body.kind === "payment") {
      ensure(
        body.recipientId !== ownerId &&
          getMembers(bookId).some((m) => m.id === body.recipientId),
        "invalidRecipient",
      );
      return {
        kind: "payment",
        amount: money(body.amount),
        recipientId: body.recipientId,
        date: body.date,
        note: textField(body.note ?? "", 1000, true),
      };
    }
    ensure(body.kind === "expense", "invalid");
    return { ...expense(body, bookId), kind: "expense", date: body.date };
  }
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== new URL(appUrl).origin
    )
      return res.status(403).json({ error: "forbidden" });
    next();
  });
  app.use(express.json({ limit: "400kb" }));
  app.use((req, res, next) => {
    if (
      ["POST", "PATCH", "DELETE"].includes(req.method) &&
      req.path !== "/api/admin/logout" &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    )
      return res.status(400).json({ error: "invalid" });
    next();
  });
  const admin = (req, _res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("admin_session="))
      ?.slice(14);
    ensure(token && verify(token).role === "admin", "unauthorized", 401);
    next();
  };
  const member = (req, _res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    ensure(token, "unauthorized", 401);
    const identity = verify(token);
    ensure(
      identity.bookId === req.params.bookId &&
        one(
          "SELECT id FROM members WHERE id=? AND book_id=?",
          identity.memberId,
          req.params.bookId,
        ),
      "unauthorized",
      401,
    );
    req.memberId = identity.memberId;
    next();
  };
  const book = (req, _res, next) => {
    ensure(
      one("SELECT id FROM books WHERE id=?", req.params.bookId),
      "notFound",
      404,
    );
    next();
  };
  const attempts = new Map();
  const cookie = (token) =>
    `admin_session=${token}; HttpOnly; SameSite=Lax; Path=/api/admin; Max-Age=${token ? 43200 : 0}${production ? "; Secure" : ""}`;
  app.get("/api/health", (_req, res) => {
    one("SELECT 1");
    res.json({ ok: true });
  });
  app.post("/api/admin/login", (req, res) => {
    const time = now().getTime();
    for (const [key, entry] of attempts)
      if (entry.until <= time) attempts.delete(key);
    const entry = attempts.get(req.ip) ?? {
      count: 0,
      until: time + 15 * 60000,
    };
    ensure(entry.count < 10, "tooManyAttempts", 429);
    entry.count++;
    attempts.set(req.ip, entry);
    ensure(
      typeof req.body.password === "string" && req.body.password.length <= 1000,
      "badPassword",
      401,
    );
    const digest = (value) => createHash("sha256").update(value).digest();
    ensure(
      timingSafeEqual(digest(req.body.password), digest(adminPassword)),
      "badPassword",
      401,
    );
    attempts.delete(req.ip);
    res.setHeader(
      "Set-Cookie",
      cookie(sign({ role: "admin", exp: time + 12 * 3600000 })),
    );
    res.json({ ok: true });
  });
  app.post("/api/admin/logout", (_req, res) => {
    res.setHeader("Set-Cookie", cookie(""));
    res.json({ ok: true });
  });
  app.get("/api/admin/books", admin, (_req, res) =>
    res.json(
      all(
        "SELECT b.*, (SELECT COUNT(*) FROM members WHERE book_id=b.id) AS memberCount FROM books b ORDER BY created_at DESC",
      ),
    ),
  );
  app.post("/api/admin/books", admin, (req, res) => {
    ensure(["CNY", "USD"].includes(req.body.currency), "invalidCurrency");
    const id = randomUUID(),
      name = textField(req.body.name, 60);
    run(
      "INSERT INTO books VALUES(?,?,?,?)",
      id,
      name,
      req.body.currency,
      stamp(),
    );
    res.status(201).json({
      id,
      name,
      currency: req.body.currency,
      url: `${appUrl.replace(/\/$/, "")}/b/${id}`,
    });
  });
  app.get("/api/books/:bookId", book, (req, res) => {
    runDue();
    res.json({
      book: one(
        "SELECT id,name,currency,created_at AS createdAt FROM books WHERE id=?",
        req.params.bookId,
      ),
      members: getMembers(req.params.bookId),
      records: all(
        "SELECT * FROM records WHERE book_id=? ORDER BY json_extract(data,'$.date') DESC,created_at DESC,id",
        req.params.bookId,
      ).map(serialize),
      timers: all(
        "SELECT * FROM timers WHERE book_id=? ORDER BY created_at DESC",
        req.params.bookId,
      ).map(serialize),
    });
  });
  app.post("/api/books/:bookId/members", book, (req, res) => {
    ensure(getMembers(req.params.bookId).length < 100, "memberLimit");
    const id = randomUUID(),
      name = textField(req.body.name, 40).normalize("NFKC");
    run(
      "INSERT INTO members VALUES(?,?,?,?,?,?)",
      id,
      req.params.bookId,
      name,
      name.toLocaleLowerCase("en-US"),
      avatar(req.body.avatar),
      stamp(),
    );
    res.status(201).json({ id });
  });
  app.post("/api/books/:bookId/identity", book, (req, res) => {
    ensure(
      one(
        "SELECT id FROM members WHERE id=? AND book_id=?",
        req.body.memberId,
        req.params.bookId,
      ),
      "notFound",
      404,
    );
    res.json({
      token: sign({
        bookId: req.params.bookId,
        memberId: req.body.memberId,
        exp: now().getTime() + 365 * 86400000,
      }),
    });
  });
  app.patch("/api/books/:bookId/members/me", book, member, (req, res) => {
    const name = textField(req.body.name, 40).normalize("NFKC");
    run(
      "UPDATE members SET name=?,name_key=?,avatar=? WHERE id=?",
      name,
      name.toLocaleLowerCase("en-US"),
      avatar(req.body.avatar),
      req.memberId,
    );
    res.json({ ok: true });
  });
  const requestId = (body) => {
    if (body.requestId === undefined) return randomUUID();
    ensure(
      typeof body.requestId === "string" &&
        /^[a-f0-9-]{36}$/.test(body.requestId),
      "invalid",
    );
    return body.requestId;
  };
  function previousRequest(type, id, req, data) {
    const previous = one(`SELECT * FROM ${type} WHERE id=?`, id);
    if (!previous) return null;
    ensure(
      previous.book_id === req.params.bookId &&
        previous.owner_id === req.memberId &&
        previous.data === JSON.stringify(data),
      "conflict",
      409,
    );
    return serialize(previous);
  }
  app.post("/api/books/:bookId/records", book, member, (req, res) => {
    const data = transaction(req.body, req.params.bookId, req.memberId),
      id = requestId(req.body);
    const result = atomic(
      () =>
        previousRequest("records", id, req, data) ||
        insertRecord(req.params.bookId, req.memberId, data, null, null, id),
    );
    res.status(201).json(result);
  });
  app.post("/api/books/:bookId/timers", book, member, (req, res) => {
    const data = {
      expense: expense(req.body, req.params.bookId),
      schedule: validateSchedule(req.body.schedule),
    };
    const date = nextOccurrence(data.schedule, beijingDate(now()));
    const id = requestId(req.body);
    const result = atomic(() => {
      const previous = previousRequest("timers", id, req, data);
      if (previous) return previous;
      run(
        "INSERT INTO timers(id,book_id,owner_id,data,next_date,created_at) VALUES(?,?,?,?,?,?)",
        id,
        req.params.bookId,
        req.memberId,
        JSON.stringify(data),
        date,
        stamp(),
      );
      const timer = serialize(one("SELECT * FROM timers WHERE id=?", id));
      audit(
        req.params.bookId,
        "timers",
        id,
        req.memberId,
        "created",
        null,
        timer,
      );
      return timer;
    });
    res.status(201).json(result);
  });
  for (const type of ["records", "timers"]) {
    function owned(req) {
      const row = one(
        `SELECT * FROM ${type} WHERE id=? AND book_id=?`,
        req.params.id,
        req.params.bookId,
      );
      ensure(row, "notFound", 404);
      ensure(row.owner_id === req.memberId, "ownOnly", 403);
      ensure(!row.deleted_at, "alreadyDeleted", 409);
      ensure(row.revision === req.body.revision, "conflict", 409);
      return row;
    }
    app.patch(`/api/books/:bookId/${type}/:id`, book, member, (req, res) => {
      runDue();
      const result = atomic(() => {
        const row = owned(req),
          before = serialize(row);
        let data, nextDate;
        if (type === "records") {
          ensure(req.body.kind === before.kind, "invalid");
          data = transaction(req.body, req.params.bookId, req.memberId);
        } else {
          data = {
            expense: expense(req.body, req.params.bookId),
            schedule: validateSchedule(req.body.schedule),
          };
          nextDate =
            JSON.stringify(data.schedule) === JSON.stringify(before.schedule)
              ? row.next_date
              : nextOccurrence(data.schedule, beijingDate(now()));
        }
        run(
          `UPDATE ${type} SET data=?,revision=revision+1${type === "timers" ? ",next_date=?" : ""} WHERE id=?`,
          JSON.stringify(data),
          ...(type === "timers" ? [nextDate] : []),
          row.id,
        );
        const after = serialize(
          one(`SELECT * FROM ${type} WHERE id=?`, row.id),
        );
        audit(
          req.params.bookId,
          type,
          row.id,
          req.memberId,
          "edited",
          before,
          after,
        );
        return after;
      });
      res.json(result);
    });
    app.delete(`/api/books/:bookId/${type}/:id`, book, member, (req, res) => {
      runDue();
      atomic(() => {
        const row = owned(req);
        run(
          `UPDATE ${type} SET deleted_at=?,revision=revision+1 WHERE id=?`,
          stamp(),
          row.id,
        );
        audit(
          req.params.bookId,
          type,
          row.id,
          req.memberId,
          "deleted",
          serialize(row),
          serialize(one(`SELECT * FROM ${type} WHERE id=?`, row.id)),
        );
      });
      res.json({ ok: true });
    });
    app.get(`/api/books/:bookId/${type}/:id/history`, book, (req, res) => {
      ensure(
        one(
          `SELECT id FROM ${type} WHERE id=? AND book_id=?`,
          req.params.id,
          req.params.bookId,
        ),
        "notFound",
        404,
      );
      res.json(
        all(
          "SELECT * FROM history WHERE entity_type=? AND entity_id=? AND book_id=? ORDER BY id DESC",
          type,
          req.params.id,
          req.params.bookId,
        ).map((h) => ({
          id: h.id,
          actorId: h.actor_id,
          action: h.action,
          before: h.before_data ? JSON.parse(h.before_data) : null,
          after: JSON.parse(h.after_data),
          createdAt: h.created_at,
        })),
      );
    });
  }
  app.use((_req, res) => res.status(404).json({ error: "notFound" }));
  app.use((error, _req, res, _next) => {
    if (
      error.message?.includes(
        "UNIQUE constraint failed: members.book_id, members.name_key",
      )
    )
      return res.status(409).json({ error: "duplicateName" });
    if (error instanceof RuleError)
      return res.status(error.status).json({ error: error.code });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "invalidAvatar" });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "invalid" });
    console.error(error);
    res.status(500).json({ error: "serverError" });
  });
  return { app, db, runDue };
}
