import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";
import fs from "fs";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import * as XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('unhandledRejection', (reason, promise) => {
  console.error('>>> UNHANDLED REJECTION AT:', promise, 'REASON:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('>>> UNCAUGHT EXCEPTION:', err);
});

console.log(">>> SERVER STARTING...");

let db: Database.Database;
try {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "guards.db");
  db = new Database(dbPath);
  console.log(">>> DATABASE CONNECTED AT:", dbPath);
} catch (err) {
  console.error(">>> DATABASE CONNECTION FAILED:", err);
  process.exit(1);
}

// Initialize database
try {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    code TEXT UNIQUE,
    name TEXT,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT UNIQUE,
    emergencies INTEGER,
    bonus_amount REAL,
    user_name TEXT,
    user_code TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS additional_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS scheduled_duties (
    date TEXT PRIMARY KEY,
    note TEXT,
    updated_at TEXT
  );
  `);
  console.log(">>> DATABASE TABLES INITIALIZED");

  // Seed official August 2026 planning roster
  const august2026Roster: Record<string, string> = {
    "2026-08-01": "MOURAD",
    "2026-08-02": "STEPHANE",
    "2026-08-03": "JOCELENE",
    "2026-08-04": "FILIPE (Philippe)",
    "2026-08-05": "STEPHANE",
    "2026-08-06": "WAHIBA",
    "2026-08-07": "STEPHANE",
    "2026-08-08": "WAHIBA",
    "2026-08-09": "LETTICIA",
    "2026-08-10": "JOCELENE",
    "2026-08-11": "STEPHANE",
    "2026-08-12": "MOURAD",
    "2026-08-13": "STEPHANE",
    "2026-08-14": "LETTICIA",
    "2026-08-15": "FILIPE (Philippe)",
    "2026-08-16": "JEAN-REMY",
    "2026-08-17": "JOCELENE",
    "2026-08-18": "LETTICIA",
    "2026-08-19": "MOURAD",
    "2026-08-20": "LETTICIA",
    "2026-08-21": "STEPHANE",
    "2026-08-22": "FILIPE (Philippe)",
    "2026-08-23": "LETTICIA",
    "2026-08-24": "JOCELENE",
    "2026-08-25": "STEPHANE",
    "2026-08-26": "MOURAD",
    "2026-08-27": "STEPHANE",
    "2026-08-28": "FILIPE (Philippe)",
    "2026-08-29": "MOURAD",
    "2026-08-30": "STEPHANE",
    "2026-08-31": "JOCELENE"
  };

  // Seed official October 2026 planning roster (from PLANNING DE GARDE - OCTOBRE 2026)
  const october2026Roster: Record<string, string> = {
    "2026-10-01": "WAHIBA",
    "2026-10-02": "LETTICIA",
    "2026-10-03": "STEPHANE",
    "2026-10-04": "STEPHANE",
    "2026-10-05": "JOCELENE",
    "2026-10-06": "LETTICIA",
    "2026-10-07": "MOURAD",
    "2026-10-08": "STEPHANE",
    "2026-10-09": "LETTICIA",
    "2026-10-10": "JEAN-REMY",
    "2026-10-11": "JEAN-REMY",
    "2026-10-12": "JOCELENE",
    "2026-10-13": "STEPHANE",
    "2026-10-14": "MOURAD",
    "2026-10-15": "WAHIBA",
    "2026-10-16": "JOSEPH",
    "2026-10-17": "JOCELENE",
    "2026-10-18": "JOCELENE",
    "2026-10-19": "JOCELENE",
    "2026-10-20": "JOSEPH",
    "2026-10-21": "MOURAD",
    "2026-10-22": "STEPHANE",
    "2026-10-23": "LETTICIA",
    "2026-10-24": "STEPHANE",
    "2026-10-25": "STEPHANE",
    "2026-10-26": "JOCELENE",
    "2026-10-27": "LETTICIA",
    "2026-10-28": "STEPHANE",
    "2026-10-29": "WAHIBA",
    "2026-10-30": "STEPHANE",
    "2026-10-31": "WAHIBA"
  };

  const insertDuty = db.prepare("INSERT OR REPLACE INTO scheduled_duties (date, note, updated_at) VALUES (?, ?, ?)");
  const nowStr = new Date().toISOString();
  db.transaction(() => {
    for (const [dKey, name] of Object.entries(august2026Roster)) {
      insertDuty.run(dKey, name, nowStr);
    }
    for (const [dKey, name] of Object.entries(october2026Roster)) {
      insertDuty.run(dKey, name, nowStr);
    }
  })();
  console.log(">>> AUGUST & OCTOBER 2026 SCHEDULED DUTIES SEEDED");
} catch (err) {
  console.error(">>> DATABASE INITIALIZATION FAILED:", err);
}

// Seed admin
try {
  db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
} catch (e) {
  // Column already exists
}

const admin = db.prepare("SELECT * FROM users WHERE username = ?").get("jrb");
if (!admin) {
  const adminPassword = bcrypt.hashSync("ytqrs22w", 10);
  db.prepare("INSERT INTO users (username, password, code, name) VALUES (?, ?, ?, ?)").run(
    "jrb",
    adminPassword,
    "ADMIN",
    "Jean-rémy"
  );
}

const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
console.log(`>>> DATABASE READY. Total users: ${userCount.count}`);

const logFile = path.join(process.cwd(), "server.log");
function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(logFile, line);
}

async function startServer() {
  log(">>> STARTING SERVER...");
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Request logging
  app.use((req, res, next) => {
    log(`>>> ${req.method} ${req.url} [${req.headers['user-agent']}]`);
    next();
  });

  const PORT = 3000;
  const root = process.cwd();
  log(`>>> ROOT DIR: ${root}`);
  log(`>>> FILES IN ROOT: ${fs.readdirSync(root).join(', ')}`);

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Download Database
  app.get("/api/admin/download-db", (req, res) => {
    const dbPath = process.env.DB_PATH || path.join(__dirname, "guards.db");
    if (fs.existsSync(dbPath)) {
      res.download(dbPath, "guards.db");
    } else {
      res.status(404).send("Database file not found");
    }
  });

  // Additional Emails API
  app.get("/api/additional-emails", (req, res) => {
    try {
      const emails = db.prepare("SELECT * FROM additional_emails").all();
      res.json(emails);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/additional-emails", (req, res) => {
    const { email } = req.body;
    try {
      db.prepare("INSERT INTO additional_emails (email) VALUES (?)").run(email);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  app.delete("/api/additional-emails/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM additional_emails WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  app.get("/api/admin/email-settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings WHERE key LIKE 'email_%'").all() as any[];
    const emailSettings: any = {};
    settings.forEach(s => {
      emailSettings[s.key.replace('email_', '')] = s.value;
    });
    res.json(emailSettings);
  });

  app.post("/api/admin/email-settings", (req, res) => {
    const settings = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    Object.entries(settings).forEach(([key, value]) => {
      stmt.run(`email_${key}`, value as string);
    });
    res.json({ success: true });
  });

  // Backup and Restore
  app.post("/api/admin/backup", async (req, res) => {
    try {
      const dbPath = process.env.DB_PATH || path.join(__dirname, "guards.db");
      const backupPath = dbPath + ".bak";
      await db.backup(backupPath);
      console.log(">>> BACKUP CREATED AT:", backupPath);
      res.json({ success: true, message: "Sauvegarde effectuée avec succès" });
    } catch (e) {
      console.error(">>> Backup failed:", e);
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  app.post("/api/admin/restore", async (req, res) => {
    try {
      const dbPath = process.env.DB_PATH || path.join(__dirname, "guards.db");
      const backupPath = dbPath + ".bak";
      if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ success: false, message: "Aucune sauvegarde trouvée" });
      }
      
      console.log(">>> RESTORING DATABASE FROM:", backupPath);
      db.close();
      fs.copyFileSync(backupPath, dbPath);
      db = new Database(dbPath);
      console.log(">>> DATABASE RESTORED AND REOPENED");
      
      res.json({ success: true, message: "Restauration effectuée avec succès" });
    } catch (e) {
      console.error(">>> Restore failed:", e);
      try { 
        const dbPath = process.env.DB_PATH || path.join(__dirname, "guards.db");
        db = new Database(dbPath); 
      } catch(reopenErr) {
        console.error(">>> FAILED TO REOPEN DATABASE AFTER RESTORE ERROR:", reopenErr);
      }
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  // Manual trigger for testing
  app.post("/api/admin/send-monthly-report", async (req, res) => {
    const { month } = req.body; // format yyyy-MM
    try {
      const result = await sendMonthlyReport(month);
      if (result && result.skipped) {
        return res.json({ success: false, message: result.reason });
      }
      res.json({ success: true });
    } catch (e) {
      console.error(">>> API Error sending report:", e);
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  // Test email configuration
  app.post("/api/admin/test-email", async (req, res) => {
    try {
      const emailConfig = getEmailConfig();
      if (!emailConfig.host || !emailConfig.user || !emailConfig.pass) {
        throw new Error("Configuration email manquante (HOST, USER, PASS)");
      }

      const transporterConfig: any = {
        host: emailConfig.host,
        port: parseInt(emailConfig.port),
        secure: emailConfig.port === "465",
        auth: {
          user: emailConfig.user,
          pass: emailConfig.pass,
        },
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000,
        tls: {
          rejectUnauthorized: false
        }
      };

      console.log(`>>> Attempting test email with host: ${emailConfig.host}, port: ${emailConfig.port}, secure: ${transporterConfig.secure}, user: ${emailConfig.user}`);

      if (emailConfig.host?.includes("gmail.com")) {
        transporterConfig.service = "gmail";
        delete transporterConfig.host;
        delete transporterConfig.port;
        delete transporterConfig.secure;
      }

      const transporter = nodemailer.createTransport(transporterConfig);

      await transporter.sendMail({
        from: emailConfig.from,
        to: emailConfig.user,
        subject: "Test de configuration - Gestion des Gardes",
        text: "Si vous recevez cet email, votre configuration SMTP est correcte !",
      });

      res.json({ success: true, message: "Email de test envoyé avec succès à " + emailConfig.user });
    } catch (e) {
      console.error(">>> Test email failed:", e);
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  // 2. Auth API
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    try {
      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
      if (user && bcrypt.compareSync(password, user.password)) {
        const { password: _, ...userWithoutPassword } = user;
        res.json({ success: true, user: userWithoutPassword });
      } else {
        res.status(401).json({ success: false, message: "Identifiants invalides" });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Monthly Report Logic
  app.post("/api/admin/send-individual-report", async (req, res) => {
    const { userId, month } = req.body;
    try {
      const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as any;
      if (!user || !user.email) {
        throw new Error("L'intervenant n'a pas d'adresse email configurée.");
      }
      await sendMonthlyReport(month, user.email);
      res.json({ success: true, message: `Rapport envoyé avec succès à ${user.email}` });
    } catch (e) {
      console.error(">>> Individual report failed:", e);
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  function getEmailConfig() {
    const settings = db.prepare("SELECT * FROM settings WHERE key LIKE 'email_%'").all() as any[];
    const config: any = {};
    settings.forEach(s => {
      config[s.key.replace('email_', '').toUpperCase()] = s.value;
    });

    return {
      host: config.HOST || process.env.EMAIL_HOST,
      port: config.PORT || process.env.EMAIL_PORT || "587",
      user: config.USER || process.env.EMAIL_USER,
      pass: config.PASS || process.env.EMAIL_PASS,
      from: config.FROM || process.env.EMAIL_FROM || config.USER || process.env.EMAIL_USER
    };
  }

  async function sendMonthlyReport(monthStr?: string, targetEmail?: string) {
    const targetMonth = monthStr || format(subMonths(new Date(), 1), "yyyy-MM");
    const monthName = format(parseISO(targetMonth + "-01"), "MMMM yyyy", { locale: fr });

    console.log(`>>> Generating monthly report for ${monthName}${targetEmail ? ` (Target: ${targetEmail})` : ''}...`);

    const shifts = db.prepare("SELECT * FROM shifts WHERE date LIKE ?").all(`${targetMonth}%`) as any[];
    const users = db.prepare("SELECT * FROM users").all() as any[];
    const additionalEmails = db.prepare("SELECT email FROM additional_emails").all() as any[];

    if (shifts.length === 0) {
      console.log(">>> No shifts found for this month. Skipping report.");
      return { skipped: true, reason: `Aucune garde trouvée pour ${monthName}.` };
    }

    // Group by user
    const userSummary: Record<string, { name: string, code: string, count: number, prized: number, bonus: number, prizedDates: string[] }> = {};
    shifts.forEach(s => {
      const key = (s.user_id || s.user_name).toString();
      if (!userSummary[key]) {
        userSummary[key] = { name: s.user_name || 'N/A', code: s.user_code || 'N/A', count: 0, prized: 0, bonus: 0, prizedDates: [] };
      }
      userSummary[key].count += 1;
      if (s.bonus_amount > 0) {
        userSummary[key].prized += 1;
        userSummary[key].prizedDates.push(`${format(parseISO(s.date), 'dd/MM')} (${s.emergencies}u)`);
      }
      userSummary[key].bonus += s.bonus_amount;
    });

    const totalBonus = shifts.reduce((acc, s) => acc + s.bonus_amount, 0);

    // Build HTML content
    let html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">Résumé des Gardes - ${monthName}</h2>
        
        <div style="margin: 20px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px;">
            <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Total Gardes</div>
            <div style="font-size: 20px; font-weight: bold;">${shifts.length}</div>
          </div>
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px;">
            <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Total Bonus</div>
            <div style="font-size: 20px; font-weight: bold; color: #10b981;">${totalBonus} €</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border: 1px solid #e2e8f0;">Intervenant</th>
              <th style="padding: 10px; border: 1px solid #e2e8f0;">Gardes</th>
              <th style="padding: 10px; border: 1px solid #e2e8f0;">Dates Primes</th>
              <th style="padding: 10px; border: 1px solid #e2e8f0;">Bonus</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(userSummary).map(u => `
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">
                  <div style="font-weight: bold;">${u.name}</div>
                  <div style="font-size: 11px; color: #64748b;">${u.code}</div>
                </td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${u.count}</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-size: 11px;">
                  ${u.prizedDates.length > 0 ? u.prizedDates.join(', ') : '-'}
                </td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #10b981; font-weight: bold;">${u.bonus} €</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top: 30px; font-size: 12px; color: #94a3b8; text-align: center;">
          Ceci est un message automatique envoyé par le système de gestion des gardes.
        </div>
      </div>
    `;

    // Send emails
    const emailConfig = getEmailConfig();
    if (!emailConfig.host || !emailConfig.user || !emailConfig.pass) {
      console.error(">>> Email configuration missing. Skipping report sending.");
      throw new Error("Configuration email manquante (HOST, USER, PASS)");
    }

    const transporterConfig: any = {
      host: emailConfig.host,
      port: parseInt(emailConfig.port),
      secure: emailConfig.port === "465",
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false
      }
    };

    console.log(`>>> Attempting monthly report email with host: ${emailConfig.host}, port: ${emailConfig.port}, secure: ${transporterConfig.secure}, user: ${emailConfig.user}`);

    // Use Gmail service if host matches for better reliability
    if (emailConfig.host?.includes("gmail.com")) {
      transporterConfig.service = "gmail";
      // Gmail service handles host/port/secure automatically
      delete transporterConfig.host;
      delete transporterConfig.port;
      delete transporterConfig.secure;
    }

    const transporter = nodemailer.createTransport(transporterConfig);

    let recipients: string[] = [];
    if (targetEmail) {
      recipients = [targetEmail];
    } else {
      const allRecipients = [
        ...users.filter(u => u.email).map(u => u.email),
        ...additionalEmails.map(ae => ae.email)
      ];
      // Deduplicate
      recipients = [...new Set(allRecipients)];
    }

    if (recipients.length === 0) {
      console.log(">>> No recipients with email found. Skipping emails.");
      return;
    }

    console.log(`>>> Sending report to ${recipients.length} recipients...`);

    try {
      await transporter.sendMail({
        from: emailConfig.from,
        to: recipients.join(", "),
        subject: `Résumé des Gardes - ${monthName}`,
        html: html,
      });
      console.log(">>> Monthly report sent successfully!");
    } catch (error) {
      console.error(">>> Failed to send monthly report:", error);
      throw error;
    }
  }

  // Schedule cron job: 12th of every month at 00:01
  cron.schedule("1 0 12 * *", () => {
    sendMonthlyReport();
  });

  // 3. Shifts API
  app.get("/api/summary/:month", (req, res) => {
    const { month } = req.params;
    try {
      const shifts = db.prepare("SELECT * FROM shifts WHERE date LIKE ?").all(`${month}%`);
      res.json(shifts);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/user-shifts/:userId/:month", (req, res) => {
    const { userId, month } = req.params;
    try {
      const shifts = db.prepare("SELECT * FROM shifts WHERE user_id = ? AND date LIKE ?").all(userId, `${month}%`);
      res.json(shifts);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Configuration du bonus
  function getBonusConfig() {
    const settings = db.prepare("SELECT * FROM settings WHERE key LIKE 'bonus_%'").all() as any[];
    const config: any = {};
    settings.forEach(s => { config[s.key] = s.value; });
    return {
      threshold1: parseInt(config.bonus_threshold_1 || "9"),
      amount1: parseFloat(config.bonus_amount_1 || "30"),
      threshold2: parseInt(config.bonus_threshold_2 || "12"),
      amount2: parseFloat(config.bonus_amount_2 || "60"),
      enabled2: config.bonus_enabled_2 === "true"
    };
  }

  function calculateBonusAmount(emergencies: number, config: any) {
    if (config.enabled2 && emergencies >= config.threshold2) return config.amount2;
    if (emergencies >= config.threshold1) return config.amount1;
    return 0;
  }

  app.get("/api/admin/bonus-settings", (req, res) => {
    res.json(getBonusConfig());
  });

  app.post("/api/admin/bonus-settings", (req, res) => {
    const { threshold1, amount1, threshold2, amount2, enabled2 } = req.body;
    try {
      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      stmt.run("bonus_threshold_1", threshold1.toString());
      stmt.run("bonus_amount_1", amount1.toString());
      stmt.run("bonus_threshold_2", threshold2.toString());
      stmt.run("bonus_amount_2", amount2.toString());
      stmt.run("bonus_enabled_2", enabled2.toString());
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  app.post("/api/shifts", (req, res) => {
    const { userId, date, emergencies } = req.body;
    const config = getBonusConfig();
    const bonusAmount = calculateBonusAmount(emergencies, config);
    try {
      const user = db.prepare("SELECT name, code FROM users WHERE id = ?").get(userId) as any;
      db.prepare(`
        INSERT OR REPLACE INTO shifts (user_id, date, emergencies, bonus_amount, user_name, user_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, date, emergencies, bonusAmount, user?.name, user?.code);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: (error as Error).message });
    }
  });

  app.delete("/api/shifts/:userId/:date", (req, res) => {
    const { userId, date } = req.params;
    try {
      db.prepare("DELETE FROM shifts WHERE user_id = ? AND date = ?").run(userId, date);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.delete("/api/shifts/admin/:date", (req, res) => {
    const { date } = req.params;
    try {
      db.prepare("DELETE FROM shifts WHERE date = ?").run(date);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.delete("/api/shifts/month/:month", (req, res) => {
    const { month } = req.params;
    try {
      db.prepare("DELETE FROM shifts WHERE date LIKE ?").run(`${month}%`);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Scheduled Duties / Notes API
  app.get("/api/scheduled-duties/:month", (req, res) => {
    const { month } = req.params;
    try {
      const notes = db.prepare("SELECT * FROM scheduled_duties WHERE date LIKE ?").all(`${month}%`) as Array<{date: string, note: string}>;
      res.json(notes || []);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/scheduled-duties", (req, res) => {
    const { date, note } = req.body;
    try {
      if (!note || !note.trim()) {
        db.prepare("DELETE FROM scheduled_duties WHERE date = ?").run(date);
      } else {
        const now = new Date().toISOString();
        db.prepare("INSERT OR REPLACE INTO scheduled_duties (date, note, updated_at) VALUES (?, ?, ?)").run(date, note.trim(), now);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  app.delete("/api/scheduled-duties/:date", (req, res) => {
    const { date } = req.params;
    try {
      db.prepare("DELETE FROM scheduled_duties WHERE date = ?").run(date);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Helper: Month names in French and variations for file matching
  const MONTH_NAMES_FR: Record<string, string[]> = {
    "01": ["janvier", "janv", "jan"],
    "02": ["fevrier", "février", "fevr", "fev"],
    "03": ["mars", "mar"],
    "04": ["avril", "avr"],
    "05": ["mai"],
    "06": ["juin"],
    "07": ["juillet", "juil"],
    "08": ["aout", "août", "aou"],
    "09": ["septembre", "sept", "sep"],
    "10": ["octobre", "oct"],
    "11": ["novembre", "nov"],
    "12": ["decembre", "décembre", "dec"]
  };

  function getNasPlanningsDir(): string {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'nas_plannings_dir'").get() as { value?: string } | undefined;
      if (row && row.value && row.value.trim()) {
        return row.value.trim();
      }
    } catch (e) {}

    if (process.env.PLANNINGS_DIR && process.env.PLANNINGS_DIR.trim()) {
      return process.env.PLANNINGS_DIR.trim();
    }

    const defaultNasPath = "/volume1/Plannings_Cloud/Planning de Garde laboratoire/plannings";
    const candidates = [
      defaultNasPath,
      "/app/plannings",
      path.join(process.cwd(), "data", "plannings"),
      path.join(process.cwd(), "plannings")
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }

    return defaultNasPath;
  }

  function detectMonthInFilename(filename: string): string | null {
    const clean = filename.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Try YYYY-MM or YYYY_MM
    const matchIso = clean.match(/20\d{2}[-_.]?(0[1-9]|1[0-2])/);
    if (matchIso) {
      const y = matchIso[0].substring(0, 4);
      const m = matchIso[0].replace(/[^0-9]/g, '').substring(4, 6);
      if (m) return `${y}-${m}`;
    }
    
    // Try MM-YYYY or MM_YYYY
    const matchRev = clean.match(/(0[1-9]|1[0-2])[-_.](20\d{2})/);
    if (matchRev) {
      return `${matchRev[2]}-${matchRev[1]}`;
    }
    
    // Try French month name + 4 digit year
    for (const [mNum, variants] of Object.entries(MONTH_NAMES_FR)) {
      for (const v of variants) {
        const vClean = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (clean.includes(vClean)) {
          const yearMatch = clean.match(/20\d{2}/);
          if (yearMatch) {
            return `${yearMatch[0]}-${mNum}`;
          }
        }
      }
    }
    return null;
  }

  function findBestMatchingFile(files: string[], targetMonth: string): string | null {
    const [targetYear, targetMonthNum] = targetMonth.split('-');
    const variants = MONTH_NAMES_FR[targetMonthNum] || [];

    let bestFile: string | null = null;
    let bestScore = -1;

    for (const file of files) {
      const clean = file.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let score = 0;

      // Exact ISO pattern (e.g. 2026-08 or 2026_08 or 08_2026)
      if (
        clean.includes(`${targetYear}-${targetMonthNum}`) || 
        clean.includes(`${targetYear}_${targetMonthNum}`) || 
        clean.includes(`${targetYear}.${targetMonthNum}`) ||
        clean.includes(`${targetMonthNum}_${targetYear}`) ||
        clean.includes(`${targetMonthNum}-${targetYear}`)
      ) {
        score = 100;
      } else {
        const hasYear = clean.includes(targetYear);
        const hasMonthName = variants.some(v => clean.includes(v.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
        const hasMonthNum = clean.includes(targetMonthNum);

        if (hasYear && hasMonthName) {
          score = 90;
        } else if (hasMonthName) {
          score = 60;
        } else if (hasYear && hasMonthNum) {
          score = 50;
        }
      }

      if (score > bestScore && score > 0) {
        bestScore = score;
        bestFile = file;
      }
    }

    return bestFile;
  }

  // French Public Holidays helper for server-side schedule filtering
  function isFrenchPublicHoliday(d: Date): boolean {
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();

    if (month === 1 && day === 1) return true; // Jour de l'An
    if (month === 5 && day === 1) return true; // Fête du Travail
    if (month === 5 && day === 8) return true; // Victoire 1945
    if (month === 7 && day === 14) return true; // Fête Nationale
    if (month === 8 && day === 15) return true; // Assomption
    if (month === 11 && day === 1) return true; // Toussaint
    if (month === 11 && day === 11) return true; // Armistice
    if (month === 12 && day === 25) return true; // Noël

    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d_val = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d_val - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
    const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
    const easterDate = new Date(year, easterMonth - 1, easterDay);

    const easterMonday = new Date(easterDate);
    easterMonday.setDate(easterDate.getDate() + 1);
    if (d.getMonth() === easterMonday.getMonth() && d.getDate() === easterMonday.getDate()) return true;

    const ascension = new Date(easterDate);
    ascension.setDate(easterDate.getDate() + 39);
    if (d.getMonth() === ascension.getMonth() && d.getDate() === ascension.getDate()) return true;

    const pentecost = new Date(easterDate);
    pentecost.setDate(easterDate.getDate() + 50);
    if (d.getMonth() === pentecost.getMonth() && d.getDate() === pentecost.getDate()) return true;

    return false;
  }

  function normalizeDateString(rawDate: any, targetMonth?: string): string | null {
    if (!rawDate) return null;
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      return format(rawDate, "yyyy-MM-dd");
    }

    const str = String(rawDate).trim();
    if (!str) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      return str.substring(0, 10);
    }

    const frMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (frMatch) {
      const day = frMatch[1].padStart(2, '0');
      const month = frMatch[2].padStart(2, '0');
      const year = frMatch[3];
      return `${year}-${month}-${day}`;
    }

    if (/^\d{1,2}$/.test(str) && targetMonth && /^\d{4}-\d{2}$/.test(targetMonth)) {
      const day = str.padStart(2, '0');
      return `${targetMonth}-${day}`;
    }

    const num = Number(str);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      try {
        const parsed = (XLSX.SSF as any).parse_date_code(num);
        if (parsed) {
          const y = String(parsed.y);
          const m = String(parsed.m).padStart(2, '0');
          const d = String(parsed.d).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      } catch (e) {}
    }

    return null;
  }

  // Helper: Extract duties from a calendar grid matrix sheet (e.g., "PLANNING DE GARDE - OCTOBRE 2026")
  // where weekdays (Lundi..Dimanche) are in columns, and each week block contains:
  // - DATE row (with day numbers 1..31)
  // - GARDE row (optional daytime guard)
  // - DOUBLAGE row (optional backup)
  // - NUIT row (on-call doctor/practitioner for the night)
  function parseCalendarGridSheet(sheet: XLSX.WorkSheet, defaultYearMonth?: string): Array<{ date: string; person: string }> {
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (!rawData || rawData.length === 0) return [];

    let detectedYear: number | null = null;
    let detectedMonth: number | null = null;

    if (defaultYearMonth && /^\d{4}-\d{2}$/.test(defaultYearMonth)) {
      const parts = defaultYearMonth.split("-");
      detectedYear = parseInt(parts[0], 10);
      detectedMonth = parseInt(parts[1], 10);
    }

    const monthMapFr: Record<string, number> = {
      "janvier": 1, "janv": 1, "jan": 1,
      "fevrier": 2, "fevr": 2, "fev": 2,
      "mars": 3, "mar": 3,
      "avril": 4, "avr": 4,
      "mai": 5,
      "juin": 6,
      "juillet": 7, "juil": 7,
      "aout": 8, "aou": 8,
      "septembre": 9, "sept": 9, "sep": 9,
      "octobre": 10, "oct": 10,
      "novembre": 11, "nov": 11,
      "decembre": 12, "dec": 12
    };

    // Scan top 15 rows for month name and year (e.g., "PLANNING DE GARDE - OCTOBRE 2026")
    for (let r = 0; r < Math.min(15, rawData.length); r++) {
      const row = rawData[r];
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!cell) continue;
        const cellStr = String(cell).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        for (const [mName, mNum] of Object.entries(monthMapFr)) {
          if (cellStr.includes(mName)) {
            const yrMatch = cellStr.match(/20\d{2}/);
            if (yrMatch) {
              detectedYear = parseInt(yrMatch[0], 10);
              detectedMonth = mNum;
              break;
            } else if (!detectedMonth) {
              detectedMonth = mNum;
            }
          }
        }
        if (detectedYear && detectedMonth) break;
      }
      if (detectedYear && detectedMonth) break;
    }

    if (!detectedYear) detectedYear = new Date().getFullYear();
    if (!detectedMonth) detectedMonth = new Date().getMonth() + 1;

    function cleanPersonName(raw: any): string {
      if (!raw) return "";
      let s = String(raw).trim();
      s = s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
      const norm = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (["", "-", "--", "/", "\\", "x", "xx", "ferie", "repos", "vide", "aucun", "libre", "non", "conge", "conges"].includes(norm)) {
        return "";
      }
      return s.toUpperCase();
    }

    const gridDuties: Array<{ date: string; person: string }> = [];

    // Scan for DATE rows
    for (let r = 0; r < rawData.length; r++) {
      const row = rawData[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      let isDateRow = false;
      let dateLabelCol = -1;

      for (let c = 0; c < Math.min(4, row.length); c++) {
        const valNorm = String(row[c] || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (valNorm === "date" || valNorm === "dates" || valNorm.startsWith("date")) {
          isDateRow = true;
          dateLabelCol = c;
          break;
        }
      }

      if (!isDateRow) continue;

      // Locate NUIT, GARDE, DOUBLAGE rows in this week block
      let nuitRowIdx = -1;
      let gardeRowIdx = -1;
      let doublageRowIdx = -1;

      for (let nextR = r + 1; nextR < Math.min(r + 8, rawData.length); nextR++) {
        const subRow = rawData[nextR];
        if (!Array.isArray(subRow)) continue;

        // Stop if next DATE row begins
        let isNextDateRow = false;
        for (let c = 0; c < Math.min(4, subRow.length); c++) {
          const valNorm = String(subRow[c] || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (valNorm === "date" || valNorm === "dates" || valNorm.startsWith("date")) {
            isNextDateRow = true;
            break;
          }
        }
        if (isNextDateRow) break;

        for (let c = 0; c < Math.min(4, subRow.length); c++) {
          const valNorm = String(subRow[c] || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (valNorm === "nuit" || valNorm === "nuits" || valNorm.startsWith("nuit")) {
            nuitRowIdx = nextR;
          } else if (valNorm === "garde" || valNorm === "gardes" || valNorm.startsWith("garde")) {
            gardeRowIdx = nextR;
          } else if (valNorm === "doublage" || valNorm.startsWith("doubl")) {
            doublageRowIdx = nextR;
          }
        }
      }

      // Read day numbers and corresponding duty persons across columns
      const startCol = dateLabelCol + 1;
      for (let c = startCol; c < row.length; c++) {
        const cell = row[c];
        if (cell === null || cell === undefined || cell === "") continue;

        let dayNum: number | null = null;

        if (typeof cell === "number") {
          if (cell >= 1 && cell <= 31) {
            dayNum = Math.floor(cell);
          } else if (cell > 30000 && cell < 60000) {
            try {
              const parsed = (XLSX.SSF as any).parse_date_code(cell);
              if (parsed && parsed.d) {
                dayNum = parsed.d;
                if (parsed.y) detectedYear = parsed.y;
                if (parsed.m) detectedMonth = parsed.m;
              }
            } catch (e) {}
          }
        } else if (cell instanceof Date && !isNaN(cell.getTime())) {
          dayNum = cell.getDate();
          detectedYear = cell.getFullYear();
          detectedMonth = cell.getMonth() + 1;
        } else {
          const str = String(cell).trim();
          const match = str.match(/^0?([1-9]|[12]\d|3[01])$/);
          if (match) {
            dayNum = parseInt(match[1], 10);
          }
        }

        if (!dayNum || dayNum < 1 || dayNum > 31) continue;

        // Take person from NUIT row as primary, fallback to GARDE row if NUIT is blank
        let person = "";
        if (nuitRowIdx !== -1 && rawData[nuitRowIdx] && rawData[nuitRowIdx][c] !== undefined) {
          person = cleanPersonName(rawData[nuitRowIdx][c]);
        }
        if (!person && gardeRowIdx !== -1 && rawData[gardeRowIdx] && rawData[gardeRowIdx][c] !== undefined) {
          person = cleanPersonName(rawData[gardeRowIdx][c]);
        }

        if (person) {
          const dateStr = `${detectedYear}-${String(detectedMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          gridDuties.push({ date: dateStr, person });
        }
      }
    }

    return gridDuties;
  }

  // Parse Excel or CSV buffer natively (supports both calendar grid matrix and list formats)
  function parseExcelSchedule(fileBuffer: Buffer, targetMonth?: string): Array<{ date: string; person: string }> {
    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
    const sheetNames = workbook.SheetNames;
    if (!sheetNames || sheetNames.length === 0) return [];

    // Order sheets: check sheet matching targetMonth first, then all others
    const sheetsToTry = [...sheetNames];
    if (targetMonth) {
      const [y, m] = targetMonth.split("-");
      const mVariants = MONTH_NAMES_FR[m] || [];
      sheetsToTry.sort((a, b) => {
        const aLow = a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const bLow = b.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const aMatch = aLow.includes(`${y}-${m}`) || aLow.includes(`${m}-${y}`) || mVariants.some(v => aLow.includes(v));
        const bMatch = bLow.includes(`${y}-${m}`) || bLow.includes(`${m}-${y}`) || mVariants.some(v => bLow.includes(v));
        return (bMatch ? 1 : 0) - (aMatch ? 1 : 0);
      });
    }

    // 1. Try Calendar Grid Matrix parsing on sheets (standard format: weekdays in header, rows DATE/GARDE/DOUBLAGE/NUIT)
    for (const sName of sheetsToTry) {
      const sheet = workbook.Sheets[sName];
      if (!sheet) continue;
      const gridDuties = parseCalendarGridSheet(sheet, targetMonth);
      if (gridDuties && gridDuties.length >= 3) {
        const map = new Map<string, string>();
        for (const item of gridDuties) {
          map.set(item.date, item.person);
        }
        return Array.from(map.entries())
          .map(([date, person]) => ({ date, person }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    }

    // 2. Fallback: Tabular row-by-row parser (columns Date, Intervenant, etc.)
    let selectedSheet = workbook.Sheets[sheetsToTry[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(selectedSheet, { raw: false, defval: "" });
    if (!rows || rows.length === 0) return [];

    const rawDuties: Array<{ date: string; person: string; isNight: boolean; slot: string }> = [];

    for (const row of rows) {
      let rawDate: any = null;
      let rawPerson: any = null;
      let rawSlot: string = "";

      for (const [k, v] of Object.entries(row)) {
        const kNorm = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const valStr = String(v).trim();
        if (!valStr) continue;

        if (kNorm.includes("date") || kNorm === "jour" || kNorm === "day") {
          rawDate = valStr;
        } else if (
          kNorm.includes("intervenant") || 
          kNorm.includes("nom") || 
          kNorm.includes("medecin") || 
          kNorm.includes("gardien") || 
          kNorm.includes("personnel") || 
          kNorm.includes("praticien") || 
          kNorm.includes("personne") || 
          kNorm === "agent"
        ) {
          rawPerson = valStr;
        } else if (
          kNorm.includes("creneau") || 
          kNorm.includes("type") || 
          kNorm.includes("horaire") || 
          kNorm.includes("plage") || 
          kNorm.includes("poste") || 
          kNorm.includes("garde")
        ) {
          rawSlot = valStr;
        }
      }

      if (!rawDate || !rawPerson) {
        const values = Object.values(row).map(v => String(v).trim()).filter(Boolean);
        if (values.length >= 2) {
          if (normalizeDateString(values[0], targetMonth)) {
            rawDate = values[0];
            rawPerson = values[1];
            if (values[2]) rawSlot = values[2];
          }
        }
      }

      if (!rawDate || !rawPerson) continue;

      const dateStr = normalizeDateString(rawDate, targetMonth);
      if (!dateStr) continue;

      const slotNorm = rawSlot.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isDay = slotNorm.includes("jour") || slotNorm.includes("7h-19h") || slotNorm.includes("07h-19h") || slotNorm.includes("matin") || slotNorm.includes("apres-midi");
      const isNight = slotNorm.includes("nuit") || slotNorm.includes("19h") || slotNorm.includes("soir") || !isDay;

      rawDuties.push({
        date: dateStr,
        person: rawPerson,
        isNight,
        slot: rawSlot
      });
    }

    // Business rule:
    // - Sundays & French Public Holidays: retain ONLY the Night shift (19h00 to 07h00).
    // - Weekdays: night shift is recorded.
    const dutiesMap = new Map<string, { date: string; person: string }>();

    for (const item of rawDuties) {
      const d = parseISO(item.date);
      const isSunday = d.getDay() === 0;
      const isHoliday = isFrenchPublicHoliday(d);

      if (isSunday || isHoliday) {
        if (item.isNight) {
          dutiesMap.set(item.date, { date: item.date, person: item.person });
        }
      } else {
        if (!dutiesMap.has(item.date) || item.isNight) {
          dutiesMap.set(item.date, { date: item.date, person: item.person });
        }
      }
    }

    return Array.from(dutiesMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  // NAS / Local Plannings Directory: List available Excel (.xlsx, .xls, .csv) & PDF files
  app.get("/api/nas-plannings", (req, res) => {
    try {
      const configuredDir = getNasPlanningsDir();
      const exists = fs.existsSync(configuredDir);
      let isDirectory = false;
      let files: Array<{
        name: string;
        size: number;
        formattedSize: string;
        mtime: string;
        detectedMonth: string | null;
        isExcel: boolean;
      }> = [];

      if (exists) {
        const stat = fs.statSync(configuredDir);
        isDirectory = stat.isDirectory();
        if (isDirectory) {
          const rawEntries = fs.readdirSync(configuredDir);
          files = rawEntries
            .filter(f => !f.startsWith('.') && (
              f.toLowerCase().endsWith('.xlsx') || 
              f.toLowerCase().endsWith('.xls') || 
              f.toLowerCase().endsWith('.csv') ||
              f.toLowerCase().endsWith('.pdf')
            ))
            .map(name => {
              try {
                const fPath = path.join(configuredDir, name);
                const s = fs.statSync(fPath);
                const isExcel = name.toLowerCase().endsWith('.xlsx') || name.toLowerCase().endsWith('.xls') || name.toLowerCase().endsWith('.csv');
                return {
                  name,
                  size: s.size,
                  formattedSize: s.size > 1048576 ? `${(s.size / 1048576).toFixed(1)} Mo` : `${(s.size / 1024).toFixed(0)} Ko`,
                  mtime: s.mtime.toISOString(),
                  detectedMonth: detectMonthInFilename(name),
                  isExcel
                };
              } catch (e) {
                return null;
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => b.mtime.localeCompare(a.mtime));
        }
      }

      res.json({
        configuredDir,
        exists,
        isDirectory,
        fileCount: files.length,
        files
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // NAS Plannings Directory: Save / Test directory settings
  app.post("/api/nas-plannings/settings", (req, res) => {
    try {
      const { dir } = req.body;
      if (typeof dir === 'string') {
        const trimmed = dir.trim();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('nas_plannings_dir', ?)").run(trimmed);
        const exists = trimmed ? fs.existsSync(trimmed) : false;
        let fileCount = 0;
        if (exists) {
          try {
            fileCount = fs.readdirSync(trimmed).filter(f => !f.startsWith('.') && (
              f.toLowerCase().endsWith('.xlsx') || 
              f.toLowerCase().endsWith('.xls') || 
              f.toLowerCase().endsWith('.csv') ||
              f.toLowerCase().endsWith('.pdf')
            )).length;
          } catch (e) {}
        }
        return res.json({ success: true, dir: trimmed, exists, fileCount });
      }
      res.status(400).json({ success: false, message: "Chemin de dossier invalide" });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  // Manual Excel file upload & instant import
  app.post("/api/plannings/import-excel", (req, res) => {
    try {
      const { fileBase64, month, fileName } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ success: false, message: "Fichier Excel (.xlsx, .csv) manquant." });
      }

      const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');
      const duties = parseExcelSchedule(fileBuffer, month);

      if (duties.length === 0) {
        return res.status(422).json({
          success: false,
          message: "Aucune garde n'a pu être extraite de ce fichier Excel. Vérifiez que le tableau contient une colonne 'Date' et une colonne 'Intervenant/Nom'."
        });
      }

      const now = new Date().toISOString();
      const stmt = db.prepare("INSERT OR REPLACE INTO scheduled_duties (date, note, updated_at) VALUES (?, ?, ?)");
      let count = 0;

      db.transaction((items) => {
        for (const item of items) {
          if (item.date && item.person && item.person.trim()) {
            stmt.run(item.date, item.person.trim(), now);
            count++;
          }
        }
      })(duties);

      res.json({
        success: true,
        message: `${count} garde(s) prévues importées avec succès depuis ${fileName || 'le fichier Excel'} (règle nuits & fériés appliquée) !`,
        count,
        duties
      });
    } catch (err) {
      console.error("Error in /api/plannings/import-excel:", err);
      res.status(500).json({ success: false, message: (err as Error).message });
    }
  });

  // NAS Plannings Directory: Automatically scan and import Excel planning for a given month
  app.post("/api/nas-plannings/sync-month", async (req, res) => {
    try {
      const { month, filename } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, message: "Mois (YYYY-MM) requis" });
      }

      const configuredDir = getNasPlanningsDir();
      if (!fs.existsSync(configuredDir)) {
        return res.status(404).json({
          success: false,
          message: `Le répertoire "${configuredDir}" n'est pas directement accessible. Vérifiez le chemin configuré ou le volume Docker.`
        });
      }

      const rawEntries = fs.readdirSync(configuredDir).filter(f => !f.startsWith('.') && (
        f.toLowerCase().endsWith('.xlsx') || 
        f.toLowerCase().endsWith('.xls') || 
        f.toLowerCase().endsWith('.csv')
      ));

      let targetFilename = filename;
      if (!targetFilename) {
        targetFilename = findBestMatchingFile(rawEntries, month);
      }

      if (!targetFilename) {
        return res.status(404).json({
          success: false,
          message: `Aucun fichier Excel (.xlsx, .csv) correspondant au mois de ${month} n'a été trouvé dans le dossier "${configuredDir}". Fichiers trouvés : ${rawEntries.slice(0, 5).join(', ') || 'aucun'}`,
          availableFiles: rawEntries
        });
      }

      const fullPath = path.join(configuredDir, targetFilename);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: `Le fichier "${targetFilename}" est introuvable sur le disque.` });
      }

      const fileBuffer = fs.readFileSync(fullPath);
      const duties = parseExcelSchedule(fileBuffer, month);

      if (duties.length === 0) {
        return res.status(422).json({
          success: false,
          message: `Le fichier Excel "${targetFilename}" a été lu, mais aucune date/intervenant valide n'a été identifié.`
        });
      }

      const now = new Date().toISOString();
      const stmt = db.prepare("INSERT OR REPLACE INTO scheduled_duties (date, note, updated_at) VALUES (?, ?, ?)");
      let count = 0;

      db.transaction((items) => {
        for (const item of items) {
          if (item.date && item.person && item.person.trim()) {
            stmt.run(item.date, item.person.trim(), now);
            count++;
          }
        }
      })(duties);

      res.json({
        success: true,
        message: `${count} garde(s) prévues importées avec succès depuis ${targetFilename} pour le mois de ${month} !`,
        count,
        filename: targetFilename,
        duties
      });
    } catch (err) {
      console.error("Error in /api/nas-plannings/sync-month:", err);
      res.status(500).json({ success: false, message: (err as Error).message });
    }
  });


  // 4. User Management
  function syncAdditionalEmail(email: string) {
    if (!email) return;
    try {
      db.prepare("INSERT OR IGNORE INTO additional_emails (email) VALUES (?)").run(email);
    } catch (e) {
      console.error(">>> Failed to sync additional email:", e);
    }
  }

  app.get("/api/users", (req, res) => {
    try {
      const users = db.prepare("SELECT id, username, code, name, email FROM users").all();
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/users", (req, res) => {
    const { username, password, code, name, email } = req.body;
    try {
      // Check if username already exists
      const existingUserByUsername = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
      if (existingUserByUsername) {
        return res.status(400).json({ success: false, message: "Cet identifiant (login) est déjà utilisé par un autre intervenant." });
      }
      
      // Check if code already exists
      const existingUserByCode = db.prepare("SELECT id FROM users WHERE code = ?").get(code);
      if (existingUserByCode) {
        return res.status(400).json({ success: false, message: "Ce code d'intervenant (ex: G001) est déjà attribué." });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      db.prepare("INSERT INTO users (username, password, code, name, email) VALUES (?, ?, ?, ?, ?)").run(
        username,
        hashedPassword,
        code,
        name,
        email
      );
      if (email) syncAdditionalEmail(email);
      res.json({ success: true });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("UNIQUE constraint failed: users.username")) {
        return res.status(400).json({ success: false, message: "Cet identifiant (login) est déjà utilisé." });
      }
      if (msg.includes("UNIQUE constraint failed: users.code")) {
        return res.status(400).json({ success: false, message: "Ce code d'intervenant est déjà attribué." });
      }
      res.status(500).json({ success: false, message: msg });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM shifts WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const { username, password, code, name, email } = req.body;
    try {
      // Check if username already exists for another user
      const existingUserByUsername = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, id);
      if (existingUserByUsername) {
        return res.status(400).json({ success: false, message: "Cet identifiant (login) est déjà utilisé par un autre intervenant." });
      }
      
      // Check if code already exists for another user
      const existingUserByCode = db.prepare("SELECT id FROM users WHERE code = ? AND id != ?").get(code, id);
      if (existingUserByCode) {
        return res.status(400).json({ success: false, message: "Ce code d'intervenant (ex: G001) est déjà attribué." });
      }

      if (password) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        db.prepare("UPDATE users SET username = ?, password = ?, code = ?, name = ?, email = ? WHERE id = ?").run(
          username,
          hashedPassword,
          code,
          name,
          email,
          id
        );
      } else {
        db.prepare("UPDATE users SET username = ?, code = ?, name = ?, email = ? WHERE id = ?").run(
          username,
          code,
          name,
          email,
          id
        );
      }
      if (email) syncAdditionalEmail(email);
      // Also update shifts if user_name or user_code changed
      db.prepare("UPDATE shifts SET user_name = ?, user_code = ? WHERE user_id = ?").run(name, code, id);
      res.json({ success: true });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("UNIQUE constraint failed: users.username")) {
        return res.status(400).json({ success: false, message: "Cet identifiant (login) est déjà utilisé." });
      }
      if (msg.includes("UNIQUE constraint failed: users.code")) {
        return res.status(400).json({ success: false, message: "Ce code d'intervenant est déjà attribué." });
      }
      res.status(500).json({ success: false, message: msg });
    }
  });

  app.post("/api/user/change-password", (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
      if (!user) {
        return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
      }

      if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(401).json({ success: false, message: "Ancien mot de passe incorrect" });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedNewPassword, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  app.put("/api/user/profile", (req, res) => {
    const { userId, email } = req.body;
    try {
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, userId);
      if (email) syncAdditionalEmail(email);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: (e as Error).message });
    }
  });

  // 5. Static files / Vite
  try {
    const distPath = path.resolve(root, "dist");
    const indexPath = path.join(distPath, "index.html");
    const hasDist = fs.existsSync(indexPath);
    
    // Use production static serving if dist exists, regardless of NODE_ENV
    // This is safer in the shared environment where build might exist but NODE_ENV might not be set
    if (hasDist) {
      log(">>> SERVING STATIC FILES FROM DIST");
      app.use(express.static(distPath));
      
      // SPA Fallback for production
      app.get("*", (req, res, next) => {
        if (req.url.startsWith('/api') || req.url.startsWith('/ping') || req.url.startsWith('/debug')) return next();
        log(`>>> SPA FALLBACK (DIST): Serving index.html for ${req.url}`);
        res.sendFile(indexPath, (err) => {
          if (err) {
            log(`>>> ERROR SENDING index.html: ${(err as Error).message}`);
            next(); // Fallback to next route (which will be the 404 handler)
          }
        });
      });
    } else {
      log(">>> DIST NOT FOUND - STARTING VITE DEVELOPMENT SERVER");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      // SPA Fallback for development
      app.get('*', async (req, res, next) => {
        const url = req.originalUrl;
        if (url.startsWith('/api') || url.startsWith('/ping') || url.startsWith('/debug')) return next();
        
        try {
          const devIndexPath = path.resolve(root, 'index.html');
          if (!fs.existsSync(devIndexPath)) {
            log(`>>> ERROR: dev index.html not found at ${devIndexPath}`);
            return next();
          }
          
          let template = fs.readFileSync(devIndexPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (e) {
          log(`>>> VITE TRANSFORMATION ERROR: ${(e as Error).message}`);
          next(e);
        }
      });
    }
  } catch (err) {
    log(`>>> FAILED TO INITIALIZE VITE/STATIC SERVING: ${(err as Error).message}`);
  }

  app.listen(PORT, "0.0.0.0", () => {
    log(`>>> SERVER LISTENING ON PORT ${PORT}`);
  });

  // Global fallback for anything not caught
  app.use((req, res) => {
    log(`>>> 404 NOT FOUND: ${req.method} ${req.url}`);
    if (req.url.startsWith('/api')) {
      return res.status(404).json({ success: false, message: `API route ${req.url} not found` });
    }
    res.status(404).send(`Désolé, la page "${req.url}" est introuvable sur ce serveur. (Express 404)`);
  });
}

startServer().catch(console.error);
