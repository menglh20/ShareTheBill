import { createApp } from "./app.mjs";
const { app, db, runDue } = createApp({
  databasePath: process.env.DATABASE_PATH || ".data/sharethebill.db",
  adminPassword: process.env.ADMIN_PASSWORD,
  secret: process.env.SESSION_SECRET,
  appUrl: process.env.APP_URL || "http://localhost:5173",
  production: process.env.NODE_ENV === "production",
});
// A persistent Railway service checks Beijing midnight; startup also catches up missed dates.
const tick = () => {
  try {
    runDue();
  } catch (error) {
    console.error("Recurring expense generation failed:", error);
  }
};
tick();
const interval = setInterval(tick, 1000);
const server = app.listen(Number(process.env.PORT) || 3001, "0.0.0.0", () =>
  console.log("ShareTheBill API is ready."),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(interval);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
