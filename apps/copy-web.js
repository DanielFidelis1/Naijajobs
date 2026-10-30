/* Copies the website (and nothing else) into the target folder.
   Usage: node ../copy-web.js <targetDir> */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.resolve(process.argv[2] || "web");
const SKIP = new Set(["node_modules", "apps", "sql", "supabase", ".github", ".git", "package.json", "package-lock.json", "README.md", "DEPLOY.md"]);

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

for (const name of fs.readdirSync(root)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    fs.cpSync(path.join(root, name), path.join(target, name), { recursive: true });
}
console.log("Website copied to", target);
