const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, "Frontend", ".env.local");
const requiredFirebase = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  if (await portInUse(3000)) {
    console.error("\nPort 3000 is already in use by another frontend server.");
    console.error("Stop the previous dev server, then run npm run dev again.\n");
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(envPath)) {
    console.warn(`\nWarning: ${envPath} is missing. Firebase sign-in will not work.`);
    return;
  }

  const values = new Map();
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
  }
  const missing = requiredFirebase.filter((key) => !values.get(key));
  if (missing.length) {
    console.warn("\nWarning: Firebase sign-in is not configured.");
    console.warn(`Missing values in ${envPath}: ${missing.join(", ")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
