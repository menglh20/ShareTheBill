export const CATEGORIES = [
  "rent",
  "utilities",
  "internet",
  "household",
  "groceries",
  "dining",
  "transport",
  "fun",
  "other",
];
export const AVATARS = [
  "🌻",
  "🥑",
  "🍊",
  "🐻",
  "🐱",
  "🐸",
  "🐨",
  "🌷",
  "🍑",
  "🐧",
  "🌵",
  "🍋",
];
export class RuleError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function ensure(condition, code = "invalid", status = 400) {
  if (!condition) throw new RuleError(code, status);
}
export function money(value, allowZero = false) {
  ensure(
    typeof value === "string" && /^\d{1,9}(\.\d{1,2})?$/.test(value),
    "invalidAmount",
  );
  const [whole, decimals = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  ensure(
    Number.isSafeInteger(cents) &&
      cents <= 999999999 &&
      (allowZero ? cents >= 0 : cents > 0),
    "invalidAmount",
  );
  return cents;
}
export const decimal = (cents) => (cents / 100).toFixed(2);
export function allocate(amount, mode, entries) {
  ensure(
    ["equal", "percent", "exact"].includes(mode) &&
      Array.isArray(entries) &&
      entries.length > 0 &&
      entries.length <= 100,
    "invalidSplit",
  );
  ensure(
    new Set(entries.map((e) => e.memberId)).size === entries.length,
    "invalidSplit",
  );
  if (mode === "exact") {
    const shares = entries.map((e) => ({
      memberId: e.memberId,
      amount: money(e.value, true),
      value: e.value,
    }));
    ensure(
      shares.reduce((sum, s) => sum + s.amount, 0) === amount,
      "splitTotal",
    );
    return shares;
  }
  const weights = entries.map((e) =>
    mode === "equal" ? 1 : money(e.value, true),
  );
  const total = weights.reduce((sum, n) => sum + n, 0);
  ensure(mode === "equal" || total === 10000, "percentTotal");
  const parts = weights.map((w, i) => {
    const product = BigInt(amount) * BigInt(w);
    return {
      i,
      amount: Number(product / BigInt(total)),
      remainder: Number(product % BigInt(total)),
    };
  });
  let remaining = amount - parts.reduce((s, p) => s + p.amount, 0);
  for (const part of [...parts].sort(
    (a, b) => b.remainder - a.remainder || a.i - b.i,
  )) {
    if (remaining-- > 0) part.amount++;
  }
  return parts.map((p, i) => ({
    memberId: entries[i].memberId,
    amount: p.amount,
    value: mode === "equal" ? "" : entries[i].value,
  }));
}
export function validDate(date) {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date >= "2000-01-01" &&
    date <= "2100-12-31"
  );
}
export const beijingDate = (now = new Date()) =>
  new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export function validateSchedule(s) {
  ensure(
    s && ["weekly", "monthly", "yearly"].includes(s.frequency),
    "invalidSchedule",
  );
  if (s.frequency === "weekly")
    ensure(
      Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6,
      "invalidSchedule",
    );
  else {
    ensure(
      Number.isInteger(s.day) && s.day >= 1 && s.day <= 31,
      "invalidSchedule",
    );
    if (s.frequency === "yearly") {
      ensure(
        Number.isInteger(s.month) && s.month >= 1 && s.month <= 12,
        "invalidSchedule",
      );
      ensure(
        s.day <= new Date(Date.UTC(2000, s.month, 0)).getUTCDate(),
        "invalidSchedule",
      );
    }
  }
  return s;
}
// The next Beijing calendar date strictly after `after`; new timers never bill retroactively.
export function nextOccurrence(s, after) {
  validateSchedule(s);
  ensure(validDate(after), "invalidDate");
  let [year, month, day] = after.split("-").map(Number);
  const stamp = (y, m, d) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const capped = (y, m, d) =>
    stamp(y, m, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()));
  if (s.frequency === "weekly") {
    const date = new Date(`${after}T00:00:00Z`);
    date.setUTCDate(day + ((s.weekday - date.getUTCDay() + 7) % 7 || 7));
    return date.toISOString().slice(0, 10);
  }
  if (s.frequency === "monthly") {
    if (capped(year, month, s.day) <= after) {
      month++;
      if (month > 12) {
        year++;
        month = 1;
      }
    }
    return capped(year, month, s.day);
  }
  if (capped(year, s.month, s.day) <= after) year++;
  return capped(year, s.month, s.day);
}
export function balances(members, transactions) {
  const result = Object.fromEntries(
    members.map((m) => [
      m.id,
      { net: 0, spent: 0, paid: 0, sent: 0, received: 0 },
    ]),
  );
  for (const t of transactions) {
    if (t.deletedAt) continue;
    const actor = result[t.ownerId];
    if (t.kind === "payment") {
      actor.net += t.amount;
      actor.sent += t.amount;
      result[t.recipientId].net -= t.amount;
      result[t.recipientId].received += t.amount;
    } else {
      actor.net += t.amount;
      actor.paid += t.amount;
      for (const s of t.shares) {
        result[s.memberId].net -= s.amount;
        result[s.memberId].spent += s.amount;
      }
    }
  }
  return result;
}
export function settlements(balanceMap) {
  const creditors = Object.entries(balanceMap)
    .filter(([, v]) => v.net > 0)
    .map(([id, v]) => ({ id, amount: v.net }));
  const debtors = Object.entries(balanceMap)
    .filter(([, v]) => v.net < 0)
    .map(([id, v]) => ({ id, amount: -v.net }));
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const transfers = [];
  let i = 0,
    j = 0;
  // ponytail: greedy net settlement; exact minimum-transfer optimization only if household size warrants it.
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (!debtors[i].amount) i++;
    if (!creditors[j].amount) j++;
  }
  return transfers;
}
