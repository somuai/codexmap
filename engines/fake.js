const { spawn } = require('child_process');

async function detect() {
  return {
    name: 'fake',
    available: true,
    binary: process.execPath,
    reason: null,
  };
}

async function health() {
  return {
    name: 'fake',
    available: true,
    authenticated: true,
  };
}

function start({ outputDir }) {
  const script = `
    const fs = require('fs');
    const path = require('path');
    const out = process.env.CODEXMAP_OUTPUT_DIR || ${JSON.stringify(outputDir)};
    const write = (rel, content) => {
      const full = path.join(out, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    };
    
    write('package.json', JSON.stringify({
      name: "banking-app",
      version: "1.0.0",
      main: "src/server.js",
      scripts: { start: "node src/server.js" },
      dependencies: { express: "^4.18.2", jsonwebtoken: "^9.0.0", bcryptjs: "^2.4.3" }
    }, null, 2));

    write('src/server.js', [
      'const app = require("./app");',
      'const port = process.env.PORT || 3000;',
      'app.listen(port, () => {',
      '  console.log("Server running on port " + port);',
      '});'
    ].join('\\n'));

    write('src/app.js', [
      'const express = require("express");',
      'const authRoutes = require("./routes/auth");',
      'const accountRoutes = require("./routes/accounts");',
      'const transactionRoutes = require("./routes/transactions");',
      'const app = express();',
      'app.use(express.json());',
      'app.use("/auth", authRoutes);',
      'app.use("/accounts", accountRoutes);',
      'app.use("/transactions", transactionRoutes);',
      'module.exports = app;'
    ].join('\\n'));

    write('src/config/db.js', [
      'module.exports = {',
      '  host: process.env.DB_HOST || "localhost",',
      '  port: process.env.DB_PORT || 5432,',
      '  database: "banking_db"',
      '};'
    ].join('\\n'));

    write('src/db/connection.js', [
      'const config = require("../config/db");',
      'console.log("Connecting to database " + config.database);',
      'const pool = {',
      '  query: async (text, params) => {',
      '    console.log("Executing: " + text);',
      '    return { rows: [] };',
      '  }',
      '};',
      'module.exports = pool;'
    ].join('\\n'));

    write('src/routes/auth.js', [
      'const express = require("express");',
      'const router = express.Router();',
      'const authService = require("../services/authService");',
      'router.post("/login", async (req, res) => {',
      '  const { username, password } = req.body;',
      '  try {',
      '    const token = await authService.loginUser(username, password);',
      '    res.json({ token });',
      '  } catch (e) {',
      '    res.status(401).json({ error: e.message });',
      '  }',
      '});',
      'router.post("/register", async (req, res) => {',
      '  const { username, password } = req.body;',
      '  try {',
      '    await authService.registerUser(username, password);',
      '    res.status(201).json({ success: true });',
      '  } catch (e) {',
      '    res.status(400).json({ error: e.message });',
      '  }',
      '});',
      'module.exports = router;'
    ].join('\\n'));

    write('src/routes/accounts.js', [
      'const express = require("express");',
      'const router = express.Router();',
      'const accountService = require("../services/accountService");',
      'router.get("/:id", async (req, res) => {',
      '  try {',
      '    const account = await accountService.getAccount(req.params.id);',
      '    res.json(account);',
      '  } catch (e) {',
      '    res.status(404).json({ error: e.message });',
      '  }',
      '});',
      'module.exports = router;'
    ].join('\\n'));

    write('src/routes/transactions.js', [
      'const express = require("express");',
      'const router = express.Router();',
      'const transactionService = require("../services/transactionService");',
      'router.post("/transfer", async (req, res) => {',
      '  const { from, to, amount } = req.body;',
      '  try {',
      '    const tx = await transactionService.transferFunds(from, to, amount);',
      '    res.json(tx);',
      '  } catch (e) {',
      '    res.status(400).json({ error: e.message });',
      '  }',
      '});',
      'module.exports = router;'
    ].join('\\n'));

    write('src/services/authService.js', [
      'const db = require("../db/connection");',
      'const cryptoUtils = require("../utils/crypto");',
      'async function loginUser(username, password) {',
      '  const res = await db.query("SELECT * FROM users WHERE username = $1", [username]);',
      '  if (res.rows.length === 0) throw new Error("User not found");',
      '  const user = res.rows[0];',
      '  const match = await cryptoUtils.comparePassword(password, user.password);',
      '  if (!match) throw new Error("Invalid credentials");',
      '  return cryptoUtils.generateToken(user.id);',
      '}',
      'async function registerUser(username, password) {',
      '  const hashed = await cryptoUtils.hashPassword(password);',
      '  await db.query("INSERT INTO users(username, password) VALUES($1, $2)", [username, hashed]);',
      '}',
      'module.exports = { loginUser, registerUser };'
    ].join('\\n'));

    write('src/services/accountService.js', [
      'const db = require("../db/connection");',
      'async function getAccount(accountId) {',
      '  const res = await db.query("SELECT * FROM accounts WHERE id = $1", [accountId]);',
      '  if (res.rows.length === 0) throw new Error("Account not found");',
      '  return res.rows[0];',
      '}',
      'module.exports = { getAccount };'
    ].join('\\n'));

    write('src/services/transactionService.js', [
      'const db = require("../db/connection");',
      'async function transferFunds(fromId, toId, amount) {',
      '  if (amount <= 0) throw new Error("Invalid amount");',
      '  await db.query("BEGIN");',
      '  try {',
      '    const fromAcc = await db.query("SELECT balance FROM accounts WHERE id = $1 FOR UPDATE", [fromId]);',
      '    if (fromAcc.rows[0].balance < amount) throw new Error("Insufficient funds");',
      '    await db.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, fromId]);',
      '    await db.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [amount, toId]);',
      '    const res = await db.query("INSERT INTO transactions(from_acc, to_acc, amount) VALUES($1, $2, $3) RETURNING *", [fromId, toId, amount]);',
      '    await db.query("COMMIT");',
      '    return res.rows[0];',
      '  } catch (e) {',
      '    await db.query("ROLLBACK");',
      '    throw e;',
      '  }',
      '}',
      'module.exports = { transferFunds };'
    ].join('\\n'));

    write('src/utils/crypto.js', [
      'const bcrypt = require("bcryptjs");',
      'const jwt = require("jsonwebtoken");',
      'const JWT_SECRET = "supersecret";',
      'function hashPassword(pw) {',
      '  return bcrypt.hash(pw, 10);',
      '}',
      'function comparePassword(pw, hash) {',
      '  return bcrypt.compare(pw, hash);',
      '}',
      'function generateToken(userId) {',
      '  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "1h" });',
      '}',
      'module.exports = { hashPassword, comparePassword, generateToken };'
    ].join('\\n'));

    write('README.md', '# Modular Banking Application\\nHigh-fidelity enterprise banking system with secure JWT auth, accounts management, and transaction ledger.\\n');
    console.log('[FAKE_ENGINE] wrote fixture files');
  `;
  return spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CODEXMAP_OUTPUT_DIR: outputDir },
  });
}

function reanchor({ filePath }) {
  const script = `
    const fs = require('fs');
    const file = process.env.CODEXMAP_REANCHOR_FILE;
    if (file && fs.existsSync(file)) fs.appendFileSync(file, '\\n// Re-anchored by fake engine\\n');
    console.log('[FAKE_ENGINE] reanchored ' + file);
  `;
  return spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CODEXMAP_REANCHOR_FILE: filePath },
  });
}

module.exports = {
  name: 'fake',
  detect,
  health,
  start,
  reanchor,
};
