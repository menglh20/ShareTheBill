import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import proxy from "../api/[...path].js";
import { createApp } from "../server/app.mjs";
import {
  money,
  allocate,
  nextOccurrence,
  beijingDate,
  balances,
  settlements,
} from "../shared/domain.mjs";

test("integer money, percentage and exact splits preserve every cent", () => {
  assert.equal(money("12.30"), 1230);
  for (const value of ["-1", "NaN", "1e2", "1.001", "", "0", "10000000"])
    assert.throws(() => money(value));
  assert.deepEqual(
    allocate(
      10000,
      "equal",
      ["a", "b", "c"].map((memberId) => ({ memberId })),
    ).map((s) => s.amount),
    [3334, 3333, 3333],
  );
  const entries = [
    { memberId: "a", value: "33.33" },
    { memberId: "b", value: "33.33" },
    { memberId: "c", value: "33.34" },
  ];
  assert.deepEqual(
    allocate(100, "percent", entries).map((s) => s.amount),
    [33, 33, 34],
  );
  assert.throws(
    () => allocate(100, "percent", entries.slice(0, 2)),
    /percentTotal/,
  );
  assert.throws(
    () => allocate(100, "exact", [{ memberId: "a", value: "0.99" }]),
    /splitTotal/,
  );
  assert.throws(
    () => allocate(100, "equal", [{ memberId: "a" }, { memberId: "a" }]),
    /invalidSplit/,
  );
  assert.equal(
    allocate(1, "percent", [
      { memberId: "a", value: "0" },
      { memberId: "b", value: "100" },
    ])[1].amount,
    1,
  );
  for (let cents = 1; cents <= 400; cents++)
    assert.equal(
      allocate(cents, "percent", entries).reduce((s, v) => s + v.amount, 0),
      cents,
    );
});

test("Beijing midnight, weekly schedules, month ends and leap day", () => {
  assert.equal(beijingDate(new Date("2026-09-17T15:59:59Z")), "2026-09-17");
  assert.equal(beijingDate(new Date("2026-09-17T16:00:00Z")), "2026-09-18");
  assert.equal(
    nextOccurrence({ frequency: "monthly", day: 31 }, "2026-01-31"),
    "2026-02-28",
  );
  assert.equal(
    nextOccurrence({ frequency: "monthly", day: 31 }, "2026-02-28"),
    "2026-03-31",
  );
  assert.equal(
    nextOccurrence({ frequency: "yearly", month: 2, day: 29 }, "2026-02-27"),
    "2026-02-28",
  );
  assert.equal(
    nextOccurrence({ frequency: "yearly", month: 2, day: 29 }, "2027-03-01"),
    "2028-02-29",
  );
  assert.equal(
    nextOccurrence({ frequency: "weekly", weekday: 5 }, "2026-09-18"),
    "2026-09-25",
  );
  assert.throws(() =>
    nextOccurrence({ frequency: "yearly", month: 2, day: 31 }, "2026-09-18"),
  );
});

test("net settlement offsets across members and accepts advance payments", () => {
  const members = ["a", "b", "c"].map((id) => ({ id }));
  const records = [
    {
      kind: "expense",
      ownerId: "b",
      amount: 10000,
      shares: [{ memberId: "a", amount: 10000 }],
    },
    {
      kind: "expense",
      ownerId: "c",
      amount: 10000,
      shares: [{ memberId: "b", amount: 10000 }],
    },
  ];
  assert.deepEqual(settlements(balances(members, records)), [
    { from: "a", to: "c", amount: 10000 },
  ]);
  records.push({
    kind: "payment",
    ownerId: "a",
    recipientId: "c",
    amount: 12000,
  });
  assert.deepEqual(settlements(balances(members, records)), [
    { from: "c", to: "a", amount: 2000 },
  ]);
  records[2].deletedAt = "now";
  assert.equal(balances(members, records).a.net, -10000);
});

test("real HTTP flow: authentication, ownership, history, recurrence and safe retries", async (t) => {
  let clock = new Date("2026-01-30T10:00:00Z");
  const { app, db, runDue } = createApp({
    adminPassword: "test-admin-password",
    secret: "test-secret-that-is-at-least-32-characters",
    now: () => clock,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.close();
    db.close();
  });
  const root = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  async function api(
    path,
    method = "GET",
    body,
    token,
    expected = 200,
    extraHeaders = {},
  ) {
    const res = await fetch(root + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.headers.has("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const result = await res.json();
    assert.equal(res.status, expected, JSON.stringify(result));
    return result;
  }
  await api("/admin/books", "GET", undefined, undefined, 401);
  await api("/admin/login", "POST", { password: "wrong" }, undefined, 401);
  await api(
    "/admin/login",
    "POST",
    { password: "test-admin-password" },
    undefined,
    403,
    { Origin: "https://evil.example" },
  );
  await api("/admin/login", "POST", { password: "test-admin-password" });
  process.env.API_URL = root.replace("/api", "");
  const proxyResponse = {
    statusCode: 0,
    headers: {},
    status(value) {
      this.statusCode = value;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
    send(value) {
      this.body = value;
    },
    json(value) {
      this.body = JSON.stringify(value);
    },
  };
  await proxy(
    { url: "/api/admin/books", method: "GET", headers: { cookie } },
    proxyResponse,
  );
  assert.equal(proxyResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(proxyResponse.body), []);
  assert.equal(proxyResponse.headers["cache-control"], "no-store");
  delete process.env.API_URL;
  const book = await api(
    "/admin/books",
    "POST",
    { name: "Our home", currency: "USD" },
    undefined,
    201,
  );
  const book2 = await api(
    "/admin/books",
    "POST",
    { name: "Other home", currency: "CNY" },
    undefined,
    201,
  );
  const base = `/books/${book.id}`;
  const a = await api(
    base + "/members",
    "POST",
    { name: "Alice", avatar: "🌻" },
    undefined,
    201,
  );
  const b = await api(
    base + "/members",
    "POST",
    { name: "Bob", avatar: "🐻" },
    undefined,
    201,
  );
  await api(
    base + "/members",
    "POST",
    { name: " alice ", avatar: "🐻" },
    undefined,
    409,
  );
  await api(
    base + "/members",
    "POST",
    { name: "X", avatar: "data:image/svg+xml;base64,eA==" },
    undefined,
    400,
  );
  const tokenA = (await api(base + "/identity", "POST", { memberId: a.id }))
    .token;
  const tokenB = (await api(base + "/identity", "POST", { memberId: b.id }))
    .token;
  await api(
    base + "/members/me",
    "PATCH",
    { name: "Alice B", avatar: "🍊" },
    tokenA,
  );
  const payload = {
    kind: "expense",
    title: "Rent",
    amount: "100.01",
    category: "rent",
    date: "2026-01-30",
    splitMode: "equal",
    shares: [{ memberId: b.id }],
    note: "",
  };
  await api(`/books/${book2.id}/records`, "POST", payload, tokenA, 401);
  payload.requestId = "00000000-0000-4000-8000-000000000001";
  const record = await api(base + "/records", "POST", payload, tokenA, 201);
  const repeated = await api(base + "/records", "POST", payload, tokenA, 201);
  assert.equal(record.id, repeated.id);
  assert.equal((await api(base)).records.length, 1);
  assert.equal(record.ownerId, a.id);
  assert.equal(record.shares[0].amount, 10001);
  await api(
    base + `/records/${record.id}`,
    "PATCH",
    { ...payload, revision: 1 },
    tokenB,
    403,
  );
  await api(
    base + `/records/${record.id}`,
    "PATCH",
    { ...payload, amount: "101", revision: 1 },
    tokenA,
  );
  await api(
    base + `/records/${record.id}`,
    "DELETE",
    { revision: 1 },
    tokenA,
    409,
  );
  await api(base + `/records/${record.id}`, "DELETE", { revision: 2 }, tokenA);
  const history = await api(base + `/records/${record.id}/history`);
  assert.deepEqual(
    history.map((h) => h.action),
    ["deleted", "edited", "created"],
  );
  assert.equal(history[1].before.amount, 10001);
  assert.equal(history[1].after.amount, 10100);
  const payment = await api(
    base + "/records",
    "POST",
    {
      kind: "payment",
      amount: "250.23",
      date: "2026-01-30",
      recipientId: b.id,
      note: "Advance",
    },
    tokenA,
    201,
  );
  await api(
    base + `/records/${payment.id}`,
    "DELETE",
    { revision: 1 },
    tokenB,
    403,
  );
  const timer = await api(
    base + "/timers",
    "POST",
    {
      ...payload,
      requestId: "00000000-0000-4000-8000-000000000002",
      schedule: { frequency: "monthly", day: 31 },
    },
    tokenA,
    201,
  );
  assert.equal(timer.nextDate, "2026-01-31");
  clock = new Date("2026-01-30T15:59:59Z");
  runDue();
  let state = await api(base);
  assert.equal(state.records.filter((r) => r.timerId).length, 0);
  clock = new Date("2026-01-30T16:00:00Z");
  runDue();
  runDue();
  state = await api(base);
  assert.equal(state.records.filter((r) => r.timerId).length, 1);
  const generated = state.records.find((r) => r.timerId);
  assert.equal(generated.date, "2026-01-31");
  await api(
    base + `/records/${generated.id}`,
    "DELETE",
    { revision: 1 },
    tokenA,
  );
  runDue();
  state = await api(base);
  assert.equal(state.records.filter((r) => r.timerId).length, 1);
  clock = new Date("2026-03-31T16:00:00Z");
  runDue();
  runDue();
  state = await api(base);
  assert.deepEqual(
    state.records.filter((r) => r.timerId && !r.deletedAt).map((r) => r.date),
    ["2026-03-31", "2026-02-28"],
  );
  await api(
    base + `/timers/${timer.id}`,
    "PATCH",
    {
      ...payload,
      amount: "200",
      schedule: { frequency: "monthly", day: 31 },
      revision: 1,
    },
    tokenA,
  );
  assert.equal(
    (await api(base)).records.find((r) => r.date === "2026-02-28").amount,
    10001,
  );
  clock = new Date("2026-04-30T00:00:00Z");
  runDue();
  assert.equal(
    (await api(base)).records.find((r) => r.date === "2026-04-30").amount,
    20000,
  );
  await api(base + `/timers/${timer.id}`, "DELETE", { revision: 2 }, tokenA);
  clock = new Date("2026-08-01T00:00:00Z");
  runDue();
  state = await api(base);
  assert.equal(state.records.filter((r) => r.timerId).length, 4);
  assert.ok(state.timers[0].deletedAt);
  assert.equal(
    Object.values(balances(state.members, state.records)).reduce(
      (s, v) => s + v.net,
      0,
    ),
    0,
  );
  await api("/admin/logout", "POST");
  await api("/admin/books", "GET", undefined, undefined, 401);
});

test("SQLite database survives backend restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "sharethebill-"));
  const config = {
    databasePath: join(directory, "book.db"),
    adminPassword: "test-admin-password",
    secret: "test-secret-that-is-at-least-32-characters",
  };
  let instance;
  try {
    instance = createApp(config);
    instance.db
      .prepare("INSERT INTO books VALUES(?,?,?,?)")
      .run("persistent-book", "Persistent home", "CNY", "2026-09-18T00:00:00Z");
    instance.db.close();
    instance = createApp(config);
    assert.equal(
      instance.db
        .prepare("SELECT name FROM books WHERE id=?")
        .get("persistent-book").name,
      "Persistent home",
    );
  } finally {
    instance?.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
