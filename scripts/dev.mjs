import { spawn } from "node:child_process";
const children = ["dev:server", "dev:web"].map((script) =>
  spawn("npm", ["run", script], { stdio: "inherit" }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => children.forEach((child) => child.kill(signal)));
children.forEach((child) =>
  child.on("exit", (code) => {
    children.forEach((other) => other.kill());
    process.exitCode = code ?? 0;
  }),
);
