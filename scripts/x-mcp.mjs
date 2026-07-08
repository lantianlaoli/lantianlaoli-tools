import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readDotEnv(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .flatMap((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return [];
          const equalsIndex = trimmed.indexOf("=");
          if (equalsIndex < 1) return [];
          const key = trimmed.slice(0, equalsIndex).trim();
          let value = trimmed.slice(equalsIndex + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          return [[key, value]];
        }),
    );
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

const dotEnv = readDotEnv(resolve(process.cwd(), ".env"));
const clientId = process.env.X_CLIENT_ID || dotEnv.X_CLIENT_ID;
const clientSecret = process.env.X_CLIENT_SECRET || dotEnv.X_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set X_CLIENT_ID and X_CLIENT_SECRET in the project .env or process environment.");
  process.exit(1);
}

const child = spawn(
  "npx",
  ["-y", "@xdevplatform/xurl", "mcp", "https://api.x.com/mcp"],
  {
    env: {
      ...process.env,
      CLIENT_ID: clientId,
      CLIENT_SECRET: clientSecret,
    },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
