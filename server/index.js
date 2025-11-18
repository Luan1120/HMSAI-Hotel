// Load environment variables (prefer server/.env, fallback to project root .env)
try {
  const _path = require('path');
  const _fs = require('fs');
  const dotenv = require('dotenv');
  const serverEnvPath = _path.join(__dirname, '.env');
  let loaded = false;
  if (_fs.existsSync(serverEnvPath)) {
    const r = dotenv.config({ path: serverEnvPath });
    if (r.parsed) {
      loaded = true;
      console.log('[env] Loaded server/.env with keys:', Object.keys(r.parsed));
    }
  }
  if (!loaded) {
    const r2 = dotenv.config();
    if (r2.parsed) console.log('[env] Loaded root .env with keys:', Object.keys(r2.parsed));
  }
  console.log('[env] GOOGLE_CLIENT_ID length:', (process.env.GOOGLE_CLIENT_ID || '').length);
} catch (e) {
  console.warn('[env] dotenv load failed:', e && e.message ? e.message : e);
}
// ===== Suppress non-essential logs (user request) =====
// Chặn mọi console.log / console.warn để không in ra terminal (chỉ giữ console.error cho lỗi thực sự).
// Nếu cần bật lại tạm thời, comment hai dòng dưới hoặc đặt điều kiện môi trường.
console.log = () => {};
console.warn = () => {};
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { sql, getPool } = require('./db');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
// Google auth libs (lazy optional load later if not installed yet)
let OAuth2Client = null;
try { ({ OAuth2Client } = require('google-auth-library')); } catch { }
let jwt = null; try { jwt = require('jsonwebtoken'); } catch { }

const app = express();
app.use(cors());
app.use(bodyParser.json());
// Dev diagnostic endpoint to verify Google env (disabled in production)
app.get('/api/debug/google-env', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ message: 'Forbidden' });
  res.json({
    hasGOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_ID_length: (process.env.GOOGLE_CLIENT_ID || '').length,
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});
// Static serve uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `avatar_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Ensure subfolders for categorized uploads (dichvu = services, tiennghi = amenities)
function ensureSubUpload(sub) {
  const dir = path.join(uploadDir, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Separate storages for service & amenity icons so they are placed under /uploads/dichvu and /uploads/tiennghi
const serviceIconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { cb(null, ensureSubUpload('dichvu')); } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `svc_${Date.now()}_${Math.round(Math.random()*1e6)}${ext}`;
    cb(null, name);
  }
});
const amenityIconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { cb(null, ensureSubUpload('tiennghi')); } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `amen_${Date.now()}_${Math.round(Math.random()*1e6)}${ext}`;
    cb(null, name);
  }
});

const uploadServiceIcon = multer({ storage: serviceIconStorage });
const uploadAmenityIcon = multer({ storage: amenityIconStorage });

// Parse Images column which may contain:
// - JSON array string (canonical)
// - A single path string (legacy manual SQL insert)
// - Multiple paths separated by comma / semicolon / pipe / newline (manual bulk)
// Returns array of normalized web paths ("/uploads/filename.ext")
function safeParseImages(raw) {
  if (!raw) return [];
  // If already an array provided by code
  if (Array.isArray(raw)) return raw.map(normalizeImagePath).filter(Boolean);
  let txt = String(raw).trim();
  if (!txt) return [];
  // Fast path: looks like JSON array
  if (txt.startsWith('[') && txt.endsWith(']')) {
    try {
      const v = JSON.parse(txt);
      if (Array.isArray(v)) return v.map(normalizeImagePath).filter(Boolean);
    } catch { /* fallthrough */ }
  }
  // If looks like a JSON quoted string, strip quotes
  if ((txt.startsWith('"') && txt.endsWith('"')) || (txt.startsWith("'") && txt.endsWith("'"))) {
    txt = txt.slice(1, -1);
  }
  // Replace backslashes (Windows paths)
  txt = txt.replace(/\\/g, '/');
  // Common accidental full absolute path -> keep only segment from uploads/
  const uploadsIdx = txt.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIdx !== -1) {
    txt = txt.slice(uploadsIdx); // begins with /uploads/...
  }
  // Split on separators if multiple
  const parts = txt.split(/[;,|\n\r]+/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  return parts.map(normalizeImagePath).filter(Boolean);
}

function normalizeImagePath(p) {
  if (!p) return null;
  let v = String(p).trim();
  if (!v) return null;
  v = v.replace(/\\/g, '/');
  // Remove surrounding quotes if any
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  // Extract trailing part after /uploads/ if an absolute path
  const idx = v.toLowerCase().lastIndexOf('/uploads/');
  if (idx !== -1) v = v.slice(idx); // keep starting from /uploads/
  // If doesn't start with /uploads and looks like just a filename, prefix
  if (!/^\//.test(v)) {
    // if it already contains 'uploads/' at beginning without leading slash
    if (/^uploads\//i.test(v)) v = '/' + v; else v = '/uploads/' + v.replace(/^uploads\//i, '');
  }
  // Ensure single leading slash and no double slashes after
  v = '/' + v.replace(/^\/+/, '').replace(/\/+/g, '/');
  return v;
}
// Normalize Service Icon paths inserted manually in SQL using '/dich-vu/' => actual folder '/dichvu/' in client/public
function normalizeServiceIcon(p) {
  if (!p) return null;
  let v = String(p).trim();
  if (!v) return null;
  v = v.replace(/\\/g, '/');
  // Unify variants: remove duplicate slashes then replace hyphen folder only when not in /uploads/
  // Safe simple replacement for '/dich-vu/' and beginning 'dich-vu/'
  v = v.replace(/\/dich-vu\//g, '/dichvu/');
  v = v.replace(/^dich-vu\//, '/dichvu/');
  // Ensure leading slash for local assets (non-URL & non-uploads path already absolute)
  if (!/^https?:\/\//i.test(v) && !v.startsWith('/')) v = '/' + v;
  return v;
}

function roundCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

// ===== Chatbot training dataset helpers =====
const trainingDataPath = path.join(__dirname, 'chatbot_training.json');

function ensureTrainingDataFile() {
  try {
    if (!fs.existsSync(trainingDataPath)) {
      fs.writeFileSync(trainingDataPath, '[]', 'utf8');
    }
  } catch (err) {
    console.error('ensureTrainingDataFile error:', err && err.message ? err.message : err);
  }
}

ensureTrainingDataFile();

function toUniqueStringArray(val) {
  if (!val) return [];
  let arr;
  if (Array.isArray(val)) arr = val;
  else if (typeof val === 'string') arr = val.split(/[,\n]/);
  else return [];
  const seen = new Set();
  const out = [];
  arr.forEach((item) => {
    const txt = String(item || '').trim();
    if (!txt) return;
    const key = txt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(txt);
  });
  return out;
}

function sanitizeTrainingEntry(entry) {
  const baseId = entry && entry.id ? String(entry.id) : `train_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const question = entry && entry.question ? String(entry.question).trim() : '';
  const answer = entry && entry.answer ? String(entry.answer).trim() : '';
  const status = entry && entry.status === 'Draft' ? 'Draft' : 'Active';
  const tags = toUniqueStringArray(entry && entry.tags);
  const variations = toUniqueStringArray(entry && entry.variations);
  const suggestions = toUniqueStringArray(entry && entry.suggestions);
  const createdAt = entry && entry.createdAt ? String(entry.createdAt) : new Date().toISOString();
  const updatedAt = entry && entry.updatedAt ? String(entry.updatedAt) : createdAt;
  const usageCount = Number.isFinite(entry && entry.usageCount) ? Number(entry.usageCount) : 0;
  const lastUsedAt = entry && entry.lastUsedAt ? String(entry.lastUsedAt) : null;
  const ownerEmail = entry && entry.ownerEmail ? String(entry.ownerEmail) : null;
  return {
    id: baseId,
    question,
    answer,
    status,
    tags,
    variations,
    suggestions,
    createdAt,
    updatedAt,
    usageCount,
    lastUsedAt,
    ownerEmail,
  };
}

function readTrainingData() {
  ensureTrainingDataFile();
  try {
    const raw = fs.readFileSync(trainingDataPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeTrainingEntry);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      ensureTrainingDataFile();
      return [];
    }
    console.error('readTrainingData error:', err && err.message ? err.message : err);
    return [];
  }
}

function writeTrainingData(list) {
  try {
    const safe = Array.isArray(list) ? list.map(sanitizeTrainingEntry) : [];
    fs.writeFileSync(trainingDataPath, JSON.stringify(safe, null, 2), 'utf8');
  } catch (err) {
    console.error('writeTrainingData error:', err && err.message ? err.message : err);
  }
}

function normalizePlainText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTrainingEntry(entry, normalizedMessage, tokens, rawLower) {
  if (!normalizedMessage || !entry) return 0;
  let best = 0;
  const pool = [entry.question, ...(entry.variations || []), ...(entry.tags || [])];
  for (const part of pool) {
    if (!part) continue;
    const norm = normalizePlainText(part);
    if (!norm) continue;
    if (normalizedMessage === norm) {
      best = Math.max(best, 120);
      continue;
    }
    if (normalizedMessage.includes(norm) && norm.length >= 3) {
      best = Math.max(best, 90);
      continue;
    }
    if (norm.includes(normalizedMessage) && normalizedMessage.length >= 3) {
      best = Math.max(best, 80);
      continue;
    }
    if (rawLower && part.toLowerCase() && rawLower.includes(part.toLowerCase())) {
      best = Math.max(best, 85);
    }
    const pieces = norm.split(' ').filter(Boolean);
    if (!pieces.length) continue;
    let matchCount = 0;
    pieces.forEach((piece) => {
      if (tokens.has(piece)) matchCount += 1;
    });
    if (matchCount) {
      const coverage = matchCount / pieces.length;
      const score = coverage * 60 + matchCount * 3;
      if (score > best) best = score;
    }
  }
  return best;
}

function findBestTrainingMatch(entries, message) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const normalizedMessage = normalizePlainText(message);
  if (!normalizedMessage) return null;
  const rawLower = String(message || '').toLowerCase();
  const tokens = new Set(normalizedMessage.split(' ').filter(Boolean));
  let bestScore = 0;
  let bestEntry = null;
  entries.forEach((entry) => {
    const score = scoreTrainingEntry(entry, normalizedMessage, tokens, rawLower);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  });
  if (bestScore >= 45) return bestEntry;
  return null;
}
async function tableHasColumn(pool, tableName, columnName) {
  try {
    if (!pool) pool = await getPool();
    const rs = await pool.request()
      .input('tbl', sql.NVarChar(256), tableName)
      .input('col', sql.NVarChar(128), columnName)
      .query("SELECT 1 AS ok FROM sys.columns WHERE [name]=@col AND [object_id]=OBJECT_ID(@tbl)");
    return !!rs.recordset.length;
  } catch {
    return false;
  }
}

// Ensure Payments table exists for online payments
async function ensurePaymentsTable() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Payments]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Payments (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          BookingId INT NOT NULL,
          UserId INT NOT NULL,
          Amount DECIMAL(18,2) NOT NULL,
          Method NVARCHAR(50) NULL,
          Status NVARCHAR(50) NULL,
          OrderId NVARCHAR(100) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
      END;
    `);
  } catch (e) {
    console.warn('ensurePaymentsTable warning:', e && e.message ? e.message : e);
  }
}

ensurePaymentsTable();

// Ensure Support tables for tickets/messages
async function ensureSupportTables() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SupportTickets]') AND type in (N'U'))
      BEGIN
        CREATE TABLE SupportTickets (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          UserId INT NULL,
          Subject NVARCHAR(200) NULL,
          Status NVARCHAR(20) NOT NULL DEFAULT N'Open',
          Priority NVARCHAR(20) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
          UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
      END;
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SupportMessages]') AND type in (N'U'))
      BEGIN
        CREATE TABLE SupportMessages (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          TicketId INT NOT NULL,
          SenderUserId INT NULL,
          SenderRole NVARCHAR(20) NULL,
          Body NVARCHAR(MAX) NOT NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
      END;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SupportMessages_TicketId' AND object_id = OBJECT_ID(N'[dbo].[SupportMessages]'))
        CREATE INDEX IX_SupportMessages_TicketId ON SupportMessages(TicketId);
    `);
  } catch (e) {
    console.warn('ensureSupportTables warning:', e && e.message ? e.message : e);
  }
}

ensureSupportTables();

// Ensure table to store admin replies to reviews
async function ensureReviewReplies() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ReviewReplies]') AND type in (N'U'))
      BEGIN
        CREATE TABLE ReviewReplies (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          ReviewId INT NOT NULL,
          AdminUserId INT NULL,
          Reply NVARCHAR(MAX) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
        CREATE INDEX IX_ReviewReplies_ReviewId ON ReviewReplies(ReviewId);
      END
    `);
  } catch (e) {
    console.warn('ensureReviewReplies warning:', e && e.message ? e.message : e);
  }
}
ensureReviewReplies();

// Ensure Amenities table for hotel facilities
async function ensureAmenitiesTable() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Amenities]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Amenities (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          Name NVARCHAR(120) NOT NULL,
          Icon NVARCHAR(120) NULL,
          Status NVARCHAR(30) NOT NULL DEFAULT N'Đang mở',
          QuantityLabel NVARCHAR(100) NULL,
          ApplyTo NVARCHAR(200) NULL,
          Note NVARCHAR(500) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
          UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
        CREATE INDEX IX_Amenities_Name ON Amenities(Name);
        CREATE INDEX IX_Amenities_Status ON Amenities(Status);
      END;
    `);
  } catch (e) {
    console.warn('ensureAmenitiesTable warning:', e && e.message ? e.message : e);
  }
}
ensureAmenitiesTable();

// Ensure optional columns for Amenities (QuantityLabel, ApplyTo, Note, Image, Description) if schema was minimal originally
async function ensureAmenitiesOptionalColumns() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF COL_LENGTH('dbo.Amenities', 'QuantityLabel') IS NULL
        ALTER TABLE dbo.Amenities ADD QuantityLabel NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.Amenities', 'Quantity') IS NULL
        ALTER TABLE dbo.Amenities ADD Quantity INT NULL;
      IF COL_LENGTH('dbo.Amenities', 'ApplyTo') IS NULL
        ALTER TABLE dbo.Amenities ADD ApplyTo NVARCHAR(200) NULL;
      IF COL_LENGTH('dbo.Amenities', 'Note') IS NULL
        ALTER TABLE dbo.Amenities ADD Note NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.Amenities', 'Image') IS NULL
        ALTER TABLE dbo.Amenities ADD Image NVARCHAR(300) NULL;
      IF COL_LENGTH('dbo.Amenities', 'Description') IS NULL
        ALTER TABLE dbo.Amenities ADD Description NVARCHAR(500) NULL;
      -- Migrate legacy QuantityLabel like '3/phòng' into Quantity INT when Quantity is NULL.
      -- NOTE: We must use dynamic SQL because the column may not have existed at initial compile time of the batch.
      IF COL_LENGTH('dbo.Amenities', 'QuantityLabel') IS NOT NULL AND COL_LENGTH('dbo.Amenities', 'Quantity') IS NOT NULL
      BEGIN
        -- Use dynamic SQL with correct escaping ('''' inside outer quotes becomes '' in dynamic SQL)
        DECLARE @sql NVARCHAR(MAX) = N'UPDATE a
          SET a.Quantity = TRY_CONVERT(INT, LEFT(a.QuantityLabel, CHARINDEX(''/'', a.QuantityLabel + ''/'') - 1))
          FROM dbo.Amenities a
          WHERE a.Quantity IS NULL
            AND a.QuantityLabel IS NOT NULL
            AND LTRIM(RTRIM(a.QuantityLabel)) <> '''';';
        EXEC (@sql);
      END;
    `);
  } catch (e) {
    console.warn('ensureAmenitiesOptionalColumns warning:', e && e.message ? e.message : e);
  }
}
ensureAmenitiesOptionalColumns();

// Ensure ServiceOrders table for ordering services
async function ensureServiceOrdersTable() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ServiceOrders]') AND type in (N'U'))
      BEGIN
        CREATE TABLE ServiceOrders (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          ServiceId INT NOT NULL,
          UserId INT NULL,
          Quantity INT NOT NULL DEFAULT 1,
          Note NVARCHAR(500) NULL,
          Status NVARCHAR(30) NOT NULL DEFAULT N'Pending',
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
        CREATE INDEX IX_ServiceOrders_ServiceId ON ServiceOrders(ServiceId);
        CREATE INDEX IX_ServiceOrders_UserId ON ServiceOrders(UserId);
      END;
    `);
  } catch (e) {
    console.warn('ensureServiceOrdersTable warning:', e && e.message ? e.message : e);
  }
}
ensureServiceOrdersTable();

// Ensure Promotions table exists (keeps StartDate/EndDate as DATETIME2 in schema, but server will insert DATE-only values)
async function ensurePromotionsTable() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Promotions]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Promotions (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          Code NVARCHAR(30) NOT NULL UNIQUE,
          Description NVARCHAR(255) NULL,
          DiscountType NVARCHAR(10) NOT NULL,
          DiscountValue DECIMAL(10,2) NOT NULL,
          StartDate DATETIME2 NOT NULL,
          EndDate DATETIME2 NOT NULL,
          MinOrderAmount DECIMAL(10,2) NULL,
          MaxDiscount DECIMAL(10,2) NULL,
          IsActive BIT NOT NULL DEFAULT 1,
          -- Deprecated legacy column HotelType intentionally omitted in fresh schema.
          HotelId INT NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
          UpdatedAt DATETIME2 NULL,
          CreatedBy INT NULL
        );
      END;
  -- Only ensure HotelId; do NOT create legacy HotelType for new environments
  IF COL_LENGTH('dbo.Promotions','HotelId') IS NULL ALTER TABLE dbo.Promotions ADD HotelId INT NULL;
      -- One-time migration attempt: map legacy textual HotelType to existing Hotels.Name -> HotelId
      -- Must use dynamic SQL so that referencing HotelType does not raise a parse error
      IF COL_LENGTH('dbo.Promotions','HotelType') IS NOT NULL AND COL_LENGTH('dbo.Promotions','HotelId') IS NOT NULL
      BEGIN
        DECLARE @migr NVARCHAR(MAX) = N'UPDATE p SET HotelId = h.Id
          FROM dbo.Promotions p
          INNER JOIN dbo.Hotels h ON h.Name = p.HotelType
          WHERE p.HotelType IS NOT NULL AND LTRIM(RTRIM(p.HotelType))<>'''' AND p.HotelId IS NULL;';
        EXEC(@migr);
        -- (Optional) After verifying migration you may drop legacy column manually:
        -- IF NOT EXISTS (SELECT 1 FROM Promotions WHERE HotelType IS NOT NULL AND LTRIM(RTRIM(HotelType))<>'' )
        --   ALTER TABLE dbo.Promotions DROP COLUMN HotelType;
      END;
    `);
  } catch (e) { console.warn('ensurePromotionsTable warning:', e && e.message ? e.message : e); }
}
ensurePromotionsTable();

// (Promotions feature removed) Retained comment for future reference.
// async function ensurePromotionsTable(){ /* removed */ }
// ensurePromotionsTable();

// Ensure Services table (single-table schema with Icon, HotelId, Status)
async function ensureServicesTable() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Services]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Services (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          Name NVARCHAR(200) NOT NULL,
          Description NVARCHAR(500) NULL,
          Price DECIMAL(18,2) NOT NULL DEFAULT 0,
          Icon NVARCHAR(255) NULL,
          HotelId INT NOT NULL DEFAULT 1,
          Status NVARCHAR(20) NOT NULL DEFAULT N'Active',
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
          UpdatedAt DATETIME2 NULL
        );
        CREATE INDEX IX_Services_Name ON Services(Name);
        CREATE INDEX IX_Services_Hotel ON Services(HotelId);
        CREATE INDEX IX_Services_Status ON Services(Status);
      END;
      IF COL_LENGTH('dbo.Services','HotelId') IS NULL ALTER TABLE dbo.Services ADD HotelId INT NULL;
      IF COL_LENGTH('dbo.Services','Status') IS NULL ALTER TABLE dbo.Services ADD Status NVARCHAR(20) NOT NULL DEFAULT N'Active';
      IF COL_LENGTH('dbo.Services','UpdatedAt') IS NULL ALTER TABLE dbo.Services ADD UpdatedAt DATETIME2 NULL;
      IF COL_LENGTH('dbo.Services','Icon') IS NULL ALTER TABLE dbo.Services ADD Icon NVARCHAR(255) NULL;
      UPDATE Services SET HotelId = 1 WHERE HotelId IS NULL;
      UPDATE Services SET Status = CASE WHEN Status IS NULL OR LTRIM(RTRIM(Status))='' THEN N'Active' ELSE Status END;
    `);
  } catch (e) { console.warn('ensureServicesTable warning:', e && e.message ? e.message : e); }
}
ensureServicesTable();

// Ensure Notifications table (if not existing). Minimal schema used by current APIs.
async function ensureNotificationsTable() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Notifications]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Notifications (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          UserId INT NOT NULL,
          Title NVARCHAR(200) NULL,
          Message NVARCHAR(1000) NULL,
          Type NVARCHAR(50) NULL,
          SentAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
          IsRead BIT NOT NULL DEFAULT 0
        );
        CREATE INDEX IX_Notifications_UserId ON Notifications(UserId);
        CREATE INDEX IX_Notifications_User_IsRead ON Notifications(UserId, IsRead);
      END;
      -- Backfill IsRead if column exists but null values (legacy schemas)
      IF COL_LENGTH('dbo.Notifications','IsRead') IS NOT NULL
        UPDATE Notifications SET IsRead = 0 WHERE IsRead IS NULL;
    `);
  } catch (e) { console.warn('ensureNotificationsTable warning:', e && e.message ? e.message : e); }
}
ensureNotificationsTable();

// ===== Simple role-based auth via header x-user-email =====
function normalizeRoleToKey(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'Customer';
  const ascii = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (ascii === 'admin' || ascii.includes('quan tri')) return 'Admin';
  if (ascii === 'staff' || ascii.includes('nhan vien') || ascii.includes('nhan-vien')) return 'Staff';
  return 'Customer';
}
async function ensureDefaultRoles() {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Roles]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Roles (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          Name NVARCHAR(50) NOT NULL UNIQUE
        );
      END;
      IF NOT EXISTS (SELECT 1 FROM Roles WHERE Name = N'Admin') INSERT INTO Roles(Name) VALUES (N'Admin');
      IF NOT EXISTS (SELECT 1 FROM Roles WHERE Name = N'Staff') INSERT INTO Roles(Name) VALUES (N'Staff');
      IF NOT EXISTS (SELECT 1 FROM Roles WHERE Name = N'Customer') INSERT INTO Roles(Name) VALUES (N'Customer');
    `);
  } catch (e) {
    console.warn('ensureDefaultRoles warning:', e && e.message ? e.message : e);
  }
}

ensureDefaultRoles();

async function getUserRoleByEmail(email) {
  if (!email) return null;
  try {
    const pool = await getPool();
    const rs = await pool
      .request()
      .input('email', sql.NVarChar(100), email)
      .query(`
        SELECT TOP 1 COALESCE(r.Name, N'Customer') AS RoleName
        FROM Users u
        LEFT JOIN Roles r ON r.Id = u.RoleId
        WHERE u.Email = @email
      `);
    if (!rs.recordset.length) return null;
    const dbRole = (rs.recordset[0].RoleName || 'Customer');
    return normalizeRoleToKey(dbRole);
  } catch (e) {
    return null;
  }
}

function authorize(allowedRoles) {
  return async (req, res, next) => {
    try {
      const email = (req.headers['x-user-email'] || '').toString().trim();
      if (!email) return res.status(401).json({ message: 'Thiếu thông tin xác thực' });
      const role = await getUserRoleByEmail(email);
      if (!role) return res.status(403).json({ message: 'Không có quyền truy cập' });
      // Compare on normalized keys
      const allowedKeys = (allowedRoles || []).map(normalizeRoleToKey);
      if (Array.isArray(allowedKeys) && allowedKeys.length && !allowedKeys.includes(normalizeRoleToKey(role))) {
        return res.status(403).json({ message: 'Không có quyền truy cập' });
      }
      // Attach for downstream usage if needed
      req.user = { email, role };
      next();
    } catch (e) {
      res.status(500).json({ message: 'Lỗi xác thực' });
    }
  };
}

// ===== Notifications Helper (existing table Notifications assumed) =====
async function getUserIdByEmail(email) {
  if (!email) return null;
  try {
    const pool = await getPool();
    const rs = await pool.request().input('email', sql.NVarChar(100), email)
      .query('SELECT TOP 1 Id FROM Users WHERE Email=@email');
    return rs.recordset.length ? rs.recordset[0].Id : null;
  } catch { return null; }
}

async function getSingleAdminUserId() {
  try {
    const pool = await getPool();
    const rs = await pool.request().query(`
      SELECT TOP 1 u.Id
      FROM Users u
      INNER JOIN Roles r ON r.Id = u.RoleId
      WHERE r.Name = N'Admin'
      ORDER BY u.Id ASC`);
    return rs.recordset.length ? rs.recordset[0].Id : null;
  } catch { return null; }
}

// Insert notification for all users that have Admin role
async function insertNotificationForAdmins(pool, type, title, message) {
  try {
    if (!pool) pool = await getPool();
    const rs = await pool.request().query(`
      SELECT u.Id FROM Users u INNER JOIN Roles r ON r.Id = u.RoleId WHERE r.Name = N'Admin'`);
    const admins = (rs.recordset || []).map(r => r.Id).filter(Boolean);
    for (const aid of admins) {
      try { await insertNotification(pool, aid, type, title, message); } catch (e) { /* swallow per-admin errors */ }
    }
  } catch (e) { console.warn('insertNotificationForAdmins warn', e && e.message ? e.message : e); }
}

async function insertNotification(pool, userId, type, title, message) {
  if (!pool || !userId) return;
  try {
    await pool.request()
      .input('uid', sql.Int, userId)
      .input('title', sql.NVarChar(100), title || '')
      .input('message', sql.NVarChar(255), message || '')
      .input('type', sql.NVarChar(20), type || 'General')
      .query(`INSERT INTO Notifications (userId, title, message, type, sentAt) VALUES (@uid, @title, @message, @type, SYSDATETIME())`);
  } catch (e) {
    console.warn('insertNotification warn', e && e.message ? e.message : e);
  }
}

// Get Hotel by Id
app.get('/api/hotels/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu mã khách sạn' });
  try {
    const pool = await getPool();
    const rs = await pool.request().input('id', sql.Int, id)
      .query('SELECT TOP 1 Id, Name FROM Hotels WHERE Id = @id');
    if (!rs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
    const h = rs.recordset[0];
    res.json({ id: h.Id, name: h.Name });
  } catch (err) {
    console.error('Get hotel error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy thông tin khách sạn' });
  }
});
// LAN origin helper for QR: returns http://<lan-ip>:<clientPort>
app.get('/api/lan-origin', (req, res) => {
  try {
    const nets = os.networkInterfaces();
    let ip = '';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net && net.family === 'IPv4' && !net.internal) {
          ip = net.address;
          break;
        }
      }
      if (ip) break;
    }
    const clientPort = process.env.CLIENT_PORT ? Number(process.env.CLIENT_PORT) : 3000;
    const serverPort = process.env.PORT ? Number(process.env.PORT) : 5000;
    if (!ip) return res.json({ origin: '', serverOrigin: '', note: 'No LAN IPv4 detected' });
    res.json({
      origin: `http://${ip}:${clientPort}`,
      serverOrigin: `http://${ip}:${serverPort}`,
      ip,
      clientPort,
      serverPort
    });
  } catch (err) {
    console.error('lan-origin error', err);
    res.json({ origin: '', serverOrigin: '', error: 'lan-origin failed' });
  }
});

// ================== Services Admin APIs (single table) ==================
// List/search services
app.get('/api/admin/services', authorize(['Admin', 'Staff']), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
    const pool = await getPool();
    const r = pool.request();
    const conds = ['1=1'];
    if (q) { r.input('q', sql.NVarChar(200), `%${q}%`); conds.push('(s.Name LIKE @q OR s.Description LIKE @q)'); }
    if (status) { r.input('status', sql.NVarChar(20), status); conds.push('s.Status = @status'); }
    if (hotelId) { r.input('hid', sql.Int, hotelId); conds.push('s.HotelId = @hid'); }
  const rs = await r.query(`SELECT s.Id, s.Name, s.Description, s.Price, s.Status, s.HotelId, s.Icon, h.Name AS HotelName FROM Services s LEFT JOIN Hotels h ON h.Id = s.HotelId WHERE ${conds.join(' AND ')} ORDER BY s.Id ASC`);
  const items = rs.recordset.map(r => ({ Id: r.Id, Name: r.Name, Description: r.Description, Price: r.Price, Status: r.Status || 'Active', HotelId: r.HotelId, HotelName: r.HotelName || null, Icon: normalizeServiceIcon(r.Icon || null) }));
    res.json({ items });
  } catch (e) { res.status(500).json({ message: 'Lỗi tải dịch vụ' }); }
});

// ===== Public Services (read-only) =====
app.get('/api/services', async (req, res) => {
  const q = (req.query.q || '').trim();
  const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
  try {
    const pool = await getPool();
    const r = pool.request();
    const conds = ['1=1'];
    if (q) { r.input('q', sql.NVarChar(200), `%${q}%`); conds.push('(s.Name LIKE @q OR s.Description LIKE @q)'); }
    if (hotelId) { r.input('hid', sql.Int, hotelId); conds.push('s.HotelId = @hid'); }
    const rs = await r.query(`
      SELECT TOP 500 s.Id, s.Name, s.Description, s.Price, s.Status, s.Icon, s.HotelId, h.Name AS HotelName
      FROM Services s
      LEFT JOIN Hotels h ON h.Id = s.HotelId
      WHERE ${conds.join(' AND ')}
      ORDER BY s.Name ASC`);
    const items = rs.recordset.map(x => ({
      id: x.Id,
      name: x.Name,
      description: x.Description || '',
      price: Number(x.Price || 0),
      status: x.Status || 'Active',
      icon: normalizeServiceIcon(x.Icon || null),
      hotelId: x.HotelId,
      hotelName: x.HotelName || null
    }));
    res.json({ items });
  } catch (e) {
    console.error('public services list error:', e);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy dịch vụ' });
  }
});

// Create a service order (public but requires user email header to associate)
app.post('/api/services/:id/order', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID dịch vụ' });
  const { quantity, note } = req.body || {};
  const qty = Number(quantity || 1);
  if (qty <= 0) return res.status(400).json({ message: 'Số lượng không hợp lệ' });
  try {
    const email = String(req.headers['x-user-email'] || '').trim();
    if (!email) return res.status(401).json({ message: 'Bạn cần đăng nhập để đặt dịch vụ' });
    const pool = await getPool();
    // find user id
    const u = await pool.request().input('email', sql.NVarChar(100), email).query('SELECT TOP 1 Id FROM Users WHERE Email = @email');
    if (!u.recordset.length) return res.status(401).json({ message: 'Không tìm thấy tài khoản người dùng' });
    const userId = u.recordset[0].Id;
    // verify service exists
    const svc = await pool.request().input('id', sql.Int, id).query('SELECT TOP 1 Id, Name, Status FROM Services WHERE Id = @id');
    if (!svc.recordset.length) return res.status(404).json({ message: 'Dịch vụ không tồn tại' });
    const status = (svc.recordset[0].Status || '').toLowerCase();
    if (status === 'inactive') return res.status(400).json({ message: 'Dịch vụ đang tạm dừng' });
    await pool.request()
      .input('sid', sql.Int, id)
      .input('uid', sql.Int, userId)
      .input('qty', sql.Int, qty)
      .input('note', sql.NVarChar(500), note || null)
      .query('INSERT INTO ServiceOrders (ServiceId, UserId, Quantity, Note) VALUES (@sid, @uid, @qty, @note)');
    res.json({ ok: true });
  } catch (e) {
    console.error('service order error:', e);
    res.status(500).json({ message: 'Lỗi máy chủ khi đặt dịch vụ' });
  }
});

// Create service
app.post('/api/admin/services', authorize(['Admin']), async (req, res) => {
  try {
    const { name, description, price, status, hotelId, icon } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Thiếu tên dịch vụ' });
    const p = Number(price || 0);
    const hId = Number(hotelId) || 1;
    const st = status === 'Paused' ? 'Paused' : 'Active';
    const pool = await getPool();
    const rs = await pool.request()
      .input('name', sql.NVarChar(200), String(name).trim())
      .input('desc', sql.NVarChar(500), description || null)
      .input('price', sql.Decimal(18, 2), isNaN(p) ? 0 : p)
      .input('hid', sql.Int, hId)
      .input('status', sql.NVarChar(20), st)
      .input('icon', sql.NVarChar(255), icon || null)
      .query(`INSERT INTO Services(Name, Description, Price, HotelId, Status, Icon) OUTPUT INSERTED.Id VALUES(@name,@desc,@price,@hid,@status,@icon);`);
    res.json({ id: rs.recordset[0].Id, hotelId: hId });
  } catch (e) { res.status(500).json({ message: 'Tạo dịch vụ thất bại' }); }
});

// Update service
app.put('/api/admin/services/:id', authorize(['Admin', 'Staff']), async (req, res) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ message: 'Mã không hợp lệ' });
    const { name, description, price, status, hotelId, icon } = req.body || {};
    const pool = await getPool();
    const r = pool.request().input('id', sql.Int, id);
    const sets = [];
    if (name !== undefined) { sets.push('Name=@name'); r.input('name', sql.NVarChar(200), name); }
    if (description !== undefined) { sets.push('Description=@desc'); r.input('desc', sql.NVarChar(500), description); }
    if (price !== undefined) { sets.push('Price=@price'); r.input('price', sql.Decimal(18, 2), isNaN(Number(price)) ? 0 : Number(price)); }
    if (hotelId !== undefined) { sets.push('HotelId=@hid'); r.input('hid', sql.Int, Number(hotelId) || 1); }
    if (status !== undefined) { sets.push('Status=@status'); r.input('status', sql.NVarChar(20), status === 'Paused' ? 'Paused' : 'Active'); }
    if (icon !== undefined) { sets.push('Icon=@icon'); r.input('icon', sql.NVarChar(255), icon || null); }
    if (!sets.length) return res.status(400).json({ message: 'Không có thay đổi' });
    sets.push('UpdatedAt=SYSDATETIME()');
    const rs = await r.query(`UPDATE Services SET ${sets.join(', ')} WHERE Id=@id; SELECT @@ROWCOUNT AS Affected;`);
    if (!rs.recordset[0].Affected) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Lỗi cập nhật' }); }
});

// Delete service
app.delete('/api/admin/services/:id', authorize(['Admin']), async (req, res) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ message: 'Mã không hợp lệ' });
    const pool = await getPool();
    const rs = await pool.request().input('id', sql.Int, id).query('DELETE FROM Services WHERE Id=@id; SELECT @@ROWCOUNT AS Affected;');
    if (!rs.recordset[0].Affected) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Xóa thất bại' }); }
});

// Toggle status (backward compatible)
app.post('/api/admin/services/:id/toggle', authorize(['Admin', 'Staff']), async (req, res) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ message: 'Mã không hợp lệ' });
    const pool = await getPool();
    const rs = await pool.request().input('id', sql.Int, id).query(`UPDATE Services SET Status = CASE WHEN Status = N'Active' THEN N'Paused' ELSE N'Active' END, UpdatedAt=SYSDATETIME() WHERE Id=@id; SELECT Status FROM Services WHERE Id=@id;`);
    const st = rs.recordset[0] ? rs.recordset[0].Status : 'Active';
    res.json({ id, status: st });
  } catch (e) { res.status(500).json({ message: 'Đổi trạng thái thất bại' }); }
});

// Upload icon for service
app.post('/api/admin/services/upload-icon', authorize(['Admin', 'Staff']), uploadServiceIcon.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Thiếu file' });
    // Return categorized path under /uploads/dichvu
    const rel = `/uploads/dichvu/${req.file.filename}`.replace(/\\/g, '/');
    res.json({ path: rel });
  } catch (e) { res.status(500).json({ message: 'Tải icon thất bại' }); }
});

// List hotels for dropdown
app.get('/api/admin/hotels', authorize(['Admin', 'Staff']), async (req, res) => {
  try {
    const pool = await getPool();
    const rs = await pool.request().query('SELECT Id, Name FROM Hotels ORDER BY Name ASC');
    res.json({ items: rs.recordset.map(r => ({ id: r.Id, name: r.Name })) });
  } catch (e) { res.status(500).json({ message: 'Không tải được danh sách khách sạn' }); }
});

// Transactions by user email (recent)
app.get('/api/transactions', async (req, res) => {
  const email = (req.query.email || '').trim();
  const q = (req.query.q || '').trim();
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  const status = (req.query.status || '').trim();
  if (!email) return res.status(400).json({ message: 'Thiếu email' });
  try {
    const pool = await getPool();
    const r = pool.request().input('email', sql.NVarChar(100), email);
    if (from && !isNaN(from)) r.input('from', sql.Date, from);
    if (to && !isNaN(to)) r.input('to', sql.Date, to);
    if (q) r.input('q', sql.NVarChar(200), `%${q}%`);
    const statusMap = { paid: 'Đã thanh toán', pending: 'Chờ thanh toán', canceled: 'Hủy' };
    let statusFilter = '';
    if (status && statusMap[status]) {
      statusFilter = ' AND (b.paymentStatus = @status) ';
      r.input('status', sql.NVarChar(20), statusMap[status]);
    }
    // Build date filter: include any booking overlapping [from, to]
    let dateFilter = '';
    if (from && to) {
      dateFilter = ' AND (b.CheckOutDate >= @from AND b.CheckInDate <= @to) ';
    } else if (from) {
      dateFilter = ' AND (b.CheckOutDate >= @from) ';
    } else if (to) {
      dateFilter = ' AND (b.CheckInDate <= @to) ';
    }

    const rs = await r.query(`
      SELECT TOP 100
        b.Id AS BookingId,
        'HMS' + RIGHT('000000' + CAST(b.Id AS NVARCHAR(6)), 6) AS Code,
        h.Name AS HotelName,
        rt.Name AS RoomType,
        ro.RoomNumber AS RoomName,
        b.CheckInDate, b.CheckOutDate,
        DATEDIFF(day, b.CheckInDate, b.CheckOutDate) AS Nights,
        CONCAT(b.Adults, ' NL', CASE WHEN b.Children IS NULL OR b.Children=0 THEN '' ELSE ' + ' + CAST(b.Children AS NVARCHAR(10)) + ' TE' END) AS Guests,
        rt.BasePrice AS PricePerNight,
        b.TotalAmount,
           CASE WHEN b.PaymentStatus IN (N'Đã thanh toán', N'Da thanh toan') THEN 'paid'
             WHEN b.PaymentStatus IN (N'Hủy', N'Huy') THEN 'canceled'
             ELSE 'pending' END AS PaymentStatus,
           pay.LatestPaymentAt AS PaidAt,
             payMethod.LatestMethod AS Method,
           pay.DepositAmount,
           pay.RefundedAmount,
           pay.RefundStatus
      FROM Bookings b
      INNER JOIN Users u ON u.Id = b.UserId
      INNER JOIN Hotels h ON h.Id = b.HotelId
      INNER JOIN Room_Types rt ON rt.Id = b.RoomTypeId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      OUTER APPLY (
        SELECT
          SUM(CAST(CASE WHEN Status NOT LIKE 'Refunded%' THEN Amount ELSE 0 END AS DECIMAL(18,2))) AS DepositAmount,
          SUM(CAST(CASE WHEN Status LIKE 'Refunded%' THEN Amount ELSE 0 END AS DECIMAL(18,2))) AS RefundedAmount,
          MAX(CASE WHEN Status LIKE 'Refunded%' THEN Status ELSE NULL END) AS RefundStatus,
          MAX(CASE WHEN Status NOT LIKE 'Refunded%' THEN CreatedAt ELSE NULL END) AS LatestPaymentAt
        FROM Payments p
        WHERE p.BookingId = b.Id
      ) pay
      OUTER APPLY (
        SELECT TOP 1 Method AS LatestMethod
        FROM Payments p2
        WHERE p2.BookingId = b.Id AND p2.Status NOT LIKE 'Refunded%'
        ORDER BY p2.CreatedAt DESC, p2.Id DESC
      ) payMethod
      WHERE u.Email = @email
        ${dateFilter}
        ${q ? ' AND (h.Name LIKE @q OR rt.Name LIKE @q OR CAST(b.Id AS NVARCHAR(20)) LIKE @q OR ro.RoomNumber LIKE @q)' : ''}
        ${statusFilter}
      ORDER BY b.CreatedAt DESC`);

    const items = rs.recordset.map(r => ({
      bookingId: r.BookingId,
      code: r.Code,
      hotelName: r.HotelName,
      roomType: r.RoomType,
      roomName: r.RoomName,
      checkIn: r.CheckInDate,
      checkOut: r.CheckOutDate,
      nights: r.Nights,
      guests: r.Guests,
      pricePerNight: r.PricePerNight,
      total: r.TotalAmount,
      paymentStatus: r.PaymentStatus,
      paidAt: r.PaidAt,
      method: r.Method,
      depositAmount: Number(r.DepositAmount || 0),
      refundAmount: Number(r.RefundedAmount || 0),
      refundStatus: r.RefundStatus || null
    }));
    res.json({ items });
  } catch (err) {
    console.error('transactions error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy lịch sử giao dịch' });
  }
});

// List room types (optional helper for client)
app.get('/api/room-types', async (req, res) => {
  try {
    const pool = await getPool();
    const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
    const r = pool.request();
    if (hotelId) r.input('hid', sql.Int, hotelId);
    const rs = await r.query(`
        SELECT rt.Id, rt.Name, rt.Description, rt.BasePrice, rt.MaxAdults, rt.MaxChildren, rt.Image,
               rt.HotelId, h.Name AS HotelName
        FROM Room_Types rt
        LEFT JOIN Hotels h ON h.Id = rt.HotelId
        ${hotelId ? 'WHERE rt.HotelId = @hid' : ''}
        ORDER BY rt.Name`);
    res.json(rs.recordset.map(r => ({
      id: r.Id,
      name: r.Name,
      description: r.Description,
      basePrice: r.BasePrice,
      maxAdults: r.MaxAdults,
      maxChildren: r.MaxChildren,
      image: r.Image,
      hotelId: r.HotelId,
      hotelName: r.HotelName || null,
    })));
  } catch (err) {
    console.error('List room types error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách hạng phòng' });
  }
});

// ===== Admin: Amenities CRUD =====
app.get('/api/admin/amenities', authorize(['Admin']), async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const status = (req.query.status || '').toString().trim();
  try {
    const pool = await getPool();
    // Detect available columns to support both schemas
    const hasStatus = await tableHasColumn(pool, 'dbo.Amenities', 'Status');
    const hasQty = await tableHasColumn(pool, 'dbo.Amenities', 'QuantityLabel');
    const hasQtyInt = await tableHasColumn(pool, 'dbo.Amenities', 'Quantity');
    const hasApplyTo = await tableHasColumn(pool, 'dbo.Amenities', 'ApplyTo');
    const hasNote = await tableHasColumn(pool, 'dbo.Amenities', 'Note');
    const hasImg = await tableHasColumn(pool, 'dbo.Amenities', 'Image');
    const hasDesc = await tableHasColumn(pool, 'dbo.Amenities', 'Description');
    const hasCreatedAt = await tableHasColumn(pool, 'dbo.Amenities', 'CreatedAt');
    const hasUpdatedAt = await tableHasColumn(pool, 'dbo.Amenities', 'UpdatedAt');

    // Alias a.Name -> AmenityName để frontend có thể phân biệt rõ với các trường khác (ví dụ ApplyTo / RoomType)
    const selectCols = [
      'a.Id', 'a.Name AS AmenityName', 'a.Name', 'a.Icon',
      ...(hasImg ? ['a.Image'] : []),
      ...(hasDesc ? ['a.Description'] : []),
      ...(hasStatus ? ['a.Status'] : []),
      ...(hasQtyInt ? ['a.Quantity'] : []),
      ...(hasQty && !hasQtyInt ? ['a.QuantityLabel'] : []),
      ...(hasApplyTo ? ['a.ApplyTo'] : []),
      ...(hasNote ? ['a.Note'] : []),
      ...(hasCreatedAt ? ['a.CreatedAt'] : []),
      ...(hasUpdatedAt ? ['a.UpdatedAt'] : []),
    ].join(', ');

    const r = pool.request();
    const conditions = ['1=1'];
    if (q) {
      r.input('q', sql.NVarChar(200), `%${q}%`);
      const qConds = ["a.Name LIKE @q", "a.Icon LIKE @q"];
      if (hasDesc) qConds.push('a.Description LIKE @q');
      if (hasNote) qConds.push('a.Note LIKE @q');
      if (hasApplyTo) qConds.push('a.ApplyTo LIKE @q');
      if (hasImg) qConds.push('a.Image LIKE @q');
      conditions.push(`(${qConds.join(' OR ')})`);
    }
    if (status && status !== 'all' && hasStatus) {
      r.input('status', sql.NVarChar(30), status);
      conditions.push('a.Status = @status');
    }

    const sqlText = `SELECT ${selectCols} FROM Amenities a WHERE ${conditions.join(' AND ')} ORDER BY a.Id ASC`;
    const rs = await r.query(sqlText);
    res.json({ items: rs.recordset });
  } catch (e) {
    console.error('amenities list error:', e);
    res.status(500).json({ message: 'Lỗi tải tiện nghi' });
  }
});

app.post('/api/admin/amenities', authorize(['Admin']), async (req, res) => {
  const { name, icon, description, image, status, quantityLabel, quantity, applyTo, note } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'Thiếu tên tiện nghi' });
  try {
    const pool = await getPool();
    const hasStatus = await tableHasColumn(pool, 'dbo.Amenities', 'Status');
    const hasQty = await tableHasColumn(pool, 'dbo.Amenities', 'QuantityLabel');
    const hasApplyTo = await tableHasColumn(pool, 'dbo.Amenities', 'ApplyTo');
    const hasNote = await tableHasColumn(pool, 'dbo.Amenities', 'Note');
    const hasImg = await tableHasColumn(pool, 'dbo.Amenities', 'Image');
    const hasDesc = await tableHasColumn(pool, 'dbo.Amenities', 'Description');
    const hasQtyInt = await tableHasColumn(pool, 'dbo.Amenities', 'Quantity');

    const fields = ['Name', 'Icon'];
    const values = ['@name', '@icon'];
    const reqQ = pool.request()
      .input('name', sql.NVarChar(120), String(name).trim())
      .input('icon', sql.NVarChar(120), icon || null);

    if (hasDesc) { fields.push('Description'); values.push('@desc'); reqQ.input('desc', sql.NVarChar(255), description || note || null); }
    if (hasImg) { fields.push('Image'); values.push('@img'); reqQ.input('img', sql.NVarChar(255), image || null); }
    if (hasStatus) {
      // Map Vietnamese UI status to stored English canonical values
      let st = (status || '').toString().trim();
      const mapIn = {
        'đang mở': 'Active', 'dang mo': 'Active', 'active': 'Active', 'đang hoạt động': 'Active', 'dang hoat dong': 'Active',
        'đang bảo trì': 'Maintenance', 'dang bao tri': 'Maintenance', 'maintenance': 'Maintenance', 'bao tri': 'Maintenance'
      };
      st = mapIn[st.toLowerCase()] || (st ? st : 'Active');
      fields.push('Status'); values.push('@status'); reqQ.input('status', sql.NVarChar(30), st);
    }
    if (hasQtyInt) {
      const qn = (quantity !== undefined && quantity !== null && quantity !== '') ? Number(quantity) : null;
      if (qn !== null && !Number.isNaN(qn)) { fields.push('Quantity'); values.push('@qint'); reqQ.input('qint', sql.Int, qn); }
      else { fields.push('Quantity'); values.push('@qint'); reqQ.input('qint', sql.Int, null); }
      if (hasQty) { fields.push('QuantityLabel'); values.push('@qty'); reqQ.input('qty', sql.NVarChar(100), quantityLabel || (qn !== null ? `${qn}/phòng` : null)); }
    } else if (hasQty) { fields.push('QuantityLabel'); values.push('@qty'); reqQ.input('qty', sql.NVarChar(100), quantityLabel || (quantity ? `${quantity}/phòng` : null)); }
    if (hasApplyTo) { fields.push('ApplyTo'); values.push('@apply'); reqQ.input('apply', sql.NVarChar(200), applyTo || null); }
    if (hasNote && !hasDesc) { fields.push('Note'); values.push('@note'); reqQ.input('note', sql.NVarChar(500), note || description || null); }

    const rs = await reqQ.query(`
      INSERT INTO Amenities(${fields.join(', ')})
      OUTPUT INSERTED.*
      VALUES(${values.join(', ')})
    `);
    res.json({ item: rs.recordset[0] });
  } catch (e) {
    console.error('amenities create error:', e);
    res.status(500).json({ message: 'Không tạo được tiện nghi' });
  }
});

app.put('/api/admin/amenities/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  const { name, icon, description, image, status, quantityLabel, quantity, applyTo, note } = req.body || {};
  try {
    const pool = await getPool();
    const hasStatus = await tableHasColumn(pool, 'dbo.Amenities', 'Status');
    const hasQty = await tableHasColumn(pool, 'dbo.Amenities', 'QuantityLabel');
    const hasApplyTo = await tableHasColumn(pool, 'dbo.Amenities', 'ApplyTo');
    const hasNote = await tableHasColumn(pool, 'dbo.Amenities', 'Note');
    const hasImg = await tableHasColumn(pool, 'dbo.Amenities', 'Image');
    const hasDesc = await tableHasColumn(pool, 'dbo.Amenities', 'Description');
    const hasUpdatedAt = await tableHasColumn(pool, 'dbo.Amenities', 'UpdatedAt');
    const hasQtyInt = await tableHasColumn(pool, 'dbo.Amenities', 'Quantity');

    const sets = [];
    const r = pool.request().input('id', sql.Int, id);
    if (name !== undefined) { sets.push('Name = @name'); r.input('name', sql.NVarChar(120), name || null); }
    if (icon !== undefined) { sets.push('Icon = @icon'); r.input('icon', sql.NVarChar(120), icon || null); }
    if (hasDesc && description !== undefined) { sets.push('Description = @desc'); r.input('desc', sql.NVarChar(255), description || null); }
    if (hasImg && image !== undefined) { sets.push('Image = @img'); r.input('img', sql.NVarChar(255), image || null); }
    if (hasStatus && status !== undefined) {
      let st = (status || '').toString().trim();
      const mapIn = {
        'đang mở': 'Active', 'dang mo': 'Active', 'active': 'Active', 'đang hoạt động': 'Active', 'dang hoat dong': 'Active',
        'đang bảo trì': 'Maintenance', 'dang bao tri': 'Maintenance', 'maintenance': 'Maintenance', 'bao tri': 'Maintenance'
      };
      st = mapIn[st.toLowerCase()] || (st ? st : null);
      sets.push('Status = @status'); r.input('status', sql.NVarChar(30), st);
    }
    if (hasQtyInt && (quantity !== undefined || quantityLabel !== undefined)) {
      if (quantity !== undefined) {
        const qn = (quantity === '' || quantity === null) ? null : Number(quantity);
        sets.push('Quantity = @qint'); r.input('qint', sql.Int, (qn !== null && !Number.isNaN(qn)) ? qn : null);
        const label = (quantityLabel !== undefined) ? quantityLabel : (qn !== null ? `${qn}/phòng` : null);
        if (await tableHasColumn(pool, 'dbo.Amenities', 'QuantityLabel')) { sets.push('QuantityLabel = @qty'); r.input('qty', sql.NVarChar(100), label); }
      } else if (quantityLabel !== undefined && await tableHasColumn(pool, 'dbo.Amenities', 'QuantityLabel')) {
        sets.push('QuantityLabel = @qty'); r.input('qty', sql.NVarChar(100), quantityLabel || null);
      }
    } else if (hasQty && quantityLabel !== undefined) { sets.push('QuantityLabel = @qty'); r.input('qty', sql.NVarChar(100), quantityLabel || null); }
    if (hasApplyTo && applyTo !== undefined) { sets.push('ApplyTo = @apply'); r.input('apply', sql.NVarChar(200), applyTo || null); }
    if (hasNote && note !== undefined && !hasDesc) { sets.push('Note = @note'); r.input('note', sql.NVarChar(500), note || null); }
    if (hasUpdatedAt) sets.push('UpdatedAt = SYSDATETIME()');

    if (!sets.length) return res.status(400).json({ message: 'Không có trường nào để cập nhật' });
    await r.query(`UPDATE Amenities SET ${sets.join(', ')} WHERE Id = @id`);
    res.json({ ok: true });
  } catch (e) {
    console.error('amenities update error:', e);
    res.status(500).json({ message: 'Không cập nhật được tiện nghi' });
  }
});

app.delete('/api/admin/amenities/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM Amenities WHERE Id = @id');
    res.json({ ok: true });
  } catch (e) {
    console.error('amenities delete error:', e);
    res.status(500).json({ message: 'Không xóa được tiện nghi' });
  }
});

// Upload icon/image for amenity (returns path). Reuses multer storage.
app.post('/api/admin/amenities/upload-icon', authorize(['Admin']), uploadAmenityIcon.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Thiếu file' });
    const rel = `/uploads/tiennghi/${req.file.filename}`;
    res.json({ path: rel });
  } catch (e) {
    console.error('upload amenity icon error:', e);
    res.status(500).json({ message: 'Tải lên thất bại' });
  }
});

// Get rooms by room type name
app.get('/api/room-types/:name/rooms', async (req, res) => {
  const { name } = req.params;
  try {
    const pool = await getPool();

    // Maintenance: mark past bookings as Completed and release rooms no longer occupied
    try {
      await pool.request().query(`
        UPDATE b SET b.Status = 'Completed'
        FROM Bookings b
        WHERE b.Status <> 'Completed' AND b.CheckOutDate <= CAST(GETDATE() AS DATE);
      `);
      const hasUpdRooms = await pool.request()
        .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Rooms')")
        .then(r => !!r.recordset.length).catch(() => false);
      const setAvail = `r.Status = 'Available'${hasUpdRooms ? ", r.UpdatedAt = SYSDATETIME()" : ''}`;
      await pool.request().query(`
        UPDATE r SET ${setAvail}
        FROM Rooms r
        WHERE r.Status = 'Occupied'
          AND NOT EXISTS (
            SELECT 1 FROM Bookings b
            WHERE b.RoomId = r.Id
              AND b.CheckInDate <= CAST(GETDATE() AS DATE)
              AND b.CheckOutDate > CAST(GETDATE() AS DATE)
          );
      `);
    } catch (e) {
      console.warn('Room maintenance skipped:', e && e.message ? e.message : e);
    }

    // Find Room Type by exact name (NVARCHAR)
    const rt = await pool.request()
      .input('name', sql.NVarChar(60), name)
      .query(`
        SELECT TOP 1 rt.Id, rt.Name, rt.HotelId, rt.Image, rt.Description, h.Name AS HotelName
        FROM Room_Types rt
        LEFT JOIN Hotels h ON h.Id = rt.HotelId
        WHERE RTRIM(LTRIM(rt.Name)) COLLATE Vietnamese_CI_AI = RTRIM(LTRIM(@name)) COLLATE Vietnamese_CI_AI
      `);

    if (!rt.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy hạng phòng', name });
    }

    const roomType = rt.recordset[0];

    // Fetch Rooms that reference this roomTypeId
    const cin = req.query.checkIn ? new Date(req.query.checkIn) : null;
    const cout = req.query.checkOut ? new Date(req.query.checkOut) : null;

    const reqRooms = pool.request().input('roomTypeId', sql.Int, roomType.Id);
    let sqlRooms = `
      SELECT r.Id, r.HotelId, r.RoomTypeId, r.RoomNumber, r.Floor, r.Status, r.Image,
             rt.Name as RoomTypeName, rt.BasePrice, rt.MaxAdults, rt.MaxChildren`;
    if (cin && !isNaN(cin) && cout && !isNaN(cout)) {
      reqRooms.input('cin', sql.Date, cin).input('cout', sql.Date, cout);
      sqlRooms += `,
        CASE WHEN EXISTS (
          SELECT 1 FROM Bookings b
          WHERE b.RoomId = r.Id
            AND b.CheckOutDate > @cin
            AND b.CheckInDate < @cout
            AND NOT (
              (b.Status COLLATE Vietnamese_CI_AI IN (N'Canceled', N'Cancel', N'Huy', N'Hủy', N'Completed', N'Checked-out', N'Checked out'))
              OR (b.PaymentStatus COLLATE Vietnamese_CI_AI IN (N'Huy', N'Hủy', N'Canceled', N'Cancel'))
            )
        ) THEN 1 ELSE 0 END AS IsBooked`;
    } else {
      sqlRooms += `, CAST(0 AS INT) AS IsBooked`;
    }
    sqlRooms += `
      FROM Rooms r
      INNER JOIN Room_Types rt ON rt.Id = r.RoomTypeId
      WHERE r.RoomTypeId = @roomTypeId
      ORDER BY r.RoomNumber`;

    const roomsRs = await reqRooms.query(sqlRooms);

    res.json({
      roomType: {
        id: roomType.Id,
        name: roomType.Name,
        hotelId: roomType.HotelId,
        hotelName: roomType.HotelName || null,
        image: roomType.Image,
        description: roomType.Description,
      },
      rooms: roomsRs.recordset.map(r => ({
        id: r.Id,
        hotelId: r.HotelId,
        roomTypeId: r.RoomTypeId,
        roomNumber: r.RoomNumber,
        floor: r.Floor,
        status: r.Status,
        image: r.Image,
        basePrice: r.BasePrice,
        maxAdults: r.MaxAdults,
        maxChildren: r.MaxChildren,
        isBooked: (typeof r.IsBooked !== 'undefined') ? !!r.IsBooked : false,
      }))
    });
  } catch (err) {
    console.error('Get rooms by type name error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách phòng theo hạng' });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const pool = await getPool();

    // Check email exists
    const exists = await pool.request()
      .input('email', sql.NVarChar(100), email)
      .query('SELECT 1 FROM Users WHERE Email = @email');
    if (exists.recordset.length) {
      return res.status(400).json({ message: 'Email đã tồn tại!' });
    }

    // Ensure default role 'Customer' exists and get RoleId
    const roleRs = await pool.request()
      .input('roleName', sql.NVarChar(50), 'Customer')
      .query(`
        IF NOT EXISTS (SELECT 1 FROM Roles WHERE Name = @roleName)
          INSERT INTO Roles (Name) VALUES (@roleName);
        SELECT TOP 1 Id FROM Roles WHERE Name = @roleName;
      `);
    const roleId = roleRs.recordset[0].Id;

    // Insert user
    await pool.request()
      .input('name', sql.NVarChar(50), name || null)
      .input('email', sql.NVarChar(100), email)
      .input('password', sql.NVarChar(255), password)
      .input('roleId', sql.Int, roleId)
      .query(`
        INSERT INTO Users (Email, Password, Name, RoleId)
        VALUES (@email, @password, @name, @roleId);
      `);

    res.json({ message: 'Đăng ký thành công!' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi đăng ký' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool = await getPool();
    const rs = await pool.request()
      .input('email', sql.NVarChar(100), email)
      .query(`
        SELECT TOP 1 u.Id, u.Name, u.Email, u.Password, u.[avatar] AS Avatar, COALESCE(r.Name, N'Customer') AS Role, 
               CASE WHEN COL_LENGTH('dbo.Users','Status') IS NOT NULL THEN u.Status ELSE N'Hoạt động' END AS Status
        FROM Users u
        LEFT JOIN Roles r ON r.Id = u.RoleId
        WHERE u.Email = @email
      `);
    if (!rs.recordset.length) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng!' });
    }
    const user = rs.recordset[0];
    // If has Status column and account locked
    if (user.Status && user.Status.toLowerCase() === 'block') {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
    }
    if (user.Password !== password) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng!' });
    }
    const roleKey = normalizeRoleToKey(user.Role || 'Customer');
    res.json({ message: 'Đăng nhập thành công!', user: { name: user.Name, email: user.Email, avatar: user.Avatar || null, role: roleKey } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi đăng nhập' });
  }
});

// Google Sign-In: verify ID token from client and create/find user
// Client will send { credential: <google_id_token> }
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ message: 'Thiếu token Google' });
  let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENTID || '';
  if (!GOOGLE_CLIENT_ID && process.env.REACT_APP_GOOGLE_CLIENT_ID) {
    GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID; // fallback (dev convenience)
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.warn('[google-auth] Fallback: using REACT_APP_GOOGLE_CLIENT_ID from client env');
    }
  }
  if (!GOOGLE_CLIENT_ID) {
    console.error('[google-auth] Missing GOOGLE_CLIENT_ID. Checked keys:', Object.keys(process.env).filter(k => k.toLowerCase().includes('google')));
    return res.status(500).json({ message: 'Chưa cấu hình GOOGLE_CLIENT_ID trên server' });
  }
  try {
    if (!OAuth2Client) {
      try { ({ OAuth2Client } = require('google-auth-library')); } catch (e) { return res.status(500).json({ message: 'Thiếu thư viện google-auth-library' }); }
    }
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return res.status(401).json({ message: 'Không xác thực được email Google' });
    const email = payload.email;
    const name = payload.name || payload.given_name || email.split('@')[0];
    const picture = payload.picture || null;
    const pool = await getPool();
    // Ensure default role Customer
    let roleId = null;
    try {
      const roleRs = await pool.request().input('roleName', sql.NVarChar(50), 'Customer').query(`
        IF NOT EXISTS (SELECT 1 FROM Roles WHERE Name = @roleName)
          INSERT INTO Roles (Name) VALUES (@roleName);
        SELECT TOP 1 Id FROM Roles WHERE Name = @roleName;
      `);
      roleId = roleRs.recordset[0].Id;
    } catch { }
    // Find or create user (store marker Password = 'GOOGLE' if new)
    const existing = await pool.request().input('email', sql.NVarChar(100), email)
      .query('SELECT TOP 1 Id, Name, Email, [avatar] AS Avatar, RoleId FROM Users WHERE Email = @email');
    let userRow = null;
    let created = false;
    if (!existing.recordset.length) {
      const ins = await pool.request()
        .input('email', sql.NVarChar(100), email)
        .input('name', sql.NVarChar(50), name)
        .input('password', sql.NVarChar(255), 'GOOGLE')
        .input('avatar', sql.NVarChar(sql.MAX), picture)
        .input('roleId', sql.Int, roleId)
        .query('INSERT INTO Users (Email, Password, Name, [avatar], RoleId) OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Email, INSERTED.[avatar] AS Avatar, INSERTED.RoleId VALUES (@email, @password, @name, @avatar, @roleId)');
      userRow = ins.recordset[0];
      created = true;
    } else {
      userRow = existing.recordset[0];
      // Optionally update name/avatar if changed and not null
      if (picture && !userRow.Avatar) {
        try { await pool.request().input('email', sql.NVarChar(100), email).input('av', sql.NVarChar(sql.MAX), picture).query('UPDATE Users SET [avatar] = @av WHERE Email = @email'); } catch { }
        userRow.Avatar = picture;
      }
      if (name && name !== userRow.Name) {
        try { await pool.request().input('email', sql.NVarChar(100), email).input('nm', sql.NVarChar(50), name).query('UPDATE Users SET Name = @nm WHERE Email = @email'); userRow.Name = name; } catch { }
      }
    }
    // Fetch role name
    let roleName = 'Customer';
    try {
      if (userRow.RoleId) {
        const rr = await pool.request().input('rid', sql.Int, userRow.RoleId).query('SELECT TOP 1 Name FROM Roles WHERE Id = @rid');
        if (rr.recordset.length) roleName = rr.recordset[0].Name;
      }
    } catch { }
    const roleKey = normalizeRoleToKey(roleName);
    // Issue lightweight JWT (optional) else return user only
    let token = null;
    try {
      const SECRET = process.env.JWT_SECRET || 'dev-secret';
      if (!jwt) jwt = require('jsonwebtoken');
      token = jwt.sign({ email, role: roleKey }, SECRET, { expiresIn: '7d' });
    } catch { }
    const message = created ? 'Tạo tài khoản & đăng nhập Google thành công!' : 'Đăng nhập Google thành công!';
    return res.json({
      message,
      created,
      user: { name: userRow.Name, email: userRow.Email, avatar: userRow.Avatar || null, role: roleKey },
      token
    });
  } catch (err) {
    console.error('Google auth error:', err && err.message ? err.message : err);
    return res.status(401).json({ message: 'Xác thực Google thất bại' });
  }
});

// Get user profile by email
app.get('/api/users/profile', async (req, res) => {
  const email = (req.query.email || '').trim();
  if (!email) return res.status(400).json({ message: 'Thiếu email' });
  try {
    const pool = await getPool();
    const rs = await pool.request()
      .input('email', sql.NVarChar(100), email)
      .query('SELECT TOP 1 [Id], [Email], [Name], [Phone], [Address], [avatar] AS Avatar, [date_of_birth] AS DateOfBirth, [country] AS Country FROM [Users] WHERE [Email] = @email');
    if (!rs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const u = rs.recordset[0];
    res.json({
      user: {
        id: u.Id,
        email: u.Email,
        name: u.Name,
        phone: u.Phone,
        address: u.Address,
        avatar: u.Avatar,
        date_of_birth: u.DateOfBirth,
        country: u.Country,
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy hồ sơ' });
  }
});

// Update user profile (by email)
app.put('/api/users/profile', upload.single('avatar'), async (req, res) => {
  const { email, originalEmail, name, phone, address, birthDate, country, removeAvatar } = req.body || {};
  const identifyEmail = (originalEmail || email || '').trim();
  if (!identifyEmail) return res.status(400).json({ message: 'Thiếu email' });
  try {
    const pool = await getPool();
    // Build dynamic update
    const hasUpdUsers = await usersHasColumn(pool, 'UpdatedAt');
    const sets = [];
    const request = pool.request().input('email', sql.NVarChar(100), identifyEmail);
    if (name !== undefined) { sets.push('[Name] = @name'); request.input('name', sql.NVarChar(50), name || null); }
    if (phone !== undefined) { sets.push('[Phone] = @phone'); request.input('phone', sql.NVarChar(50), phone || null); }
    if (address !== undefined) { sets.push('[Address] = @address'); request.input('address', sql.NVarChar(255), address || null); }
    if (birthDate !== undefined) { sets.push('[date_of_birth] = @dob'); request.input('dob', sql.Date, birthDate ? new Date(birthDate) : null); }
    if (country !== undefined) { sets.push('[country] = @country'); request.input('country', sql.NVarChar(50), country || null); }
    let avatarUrl = null;
    if (req.file) {
      const rel = `/uploads/${req.file.filename}`;
      avatarUrl = rel.replace(/\\/g, '/');
      sets.push('[avatar] = @avatar');
      request.input('avatar', sql.NVarChar(sql.MAX), avatarUrl);
    } else if (removeAvatar) {
      sets.push('[avatar] = NULL');
    }
    const sqlText = `UPDATE [Users] SET ${sets.join(', ')} WHERE [Email] = @email`;
    const result = await request.query(sqlText);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    const rs = await pool.request().input('email', sql.NVarChar(100), identifyEmail)
      .query('SELECT TOP 1 [Id], [Email], [Name], [Phone], [Address], [avatar] AS Avatar, [date_of_birth] AS DateOfBirth, [country] AS Country FROM [Users] WHERE [Email] = @email');
    const u = rs.recordset[0];
    res.json({

      message: 'Cập nhật thành công',
      user: {
        id: u.Id,
        email: u.Email,
        name: u.Name,
        phone: u.Phone,
        address: u.Address,
        avatar: u.Avatar,
        date_of_birth: u.DateOfBirth,
        country: u.Country,
      }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật hồ sơ' });
  }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool = await getPool();
    const hasUpdUsers = await usersHasColumn(pool, 'UpdatedAt');
    const result = await pool.request()
      .input('email', sql.NVarChar(100), email)
      .input('password', sql.NVarChar(255), password)
      .query(`UPDATE Users SET Password = @password${hasUpdUsers ? ', UpdatedAt = GETDATE()' : ''} WHERE Email = @email`);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Email không tồn tại!' });
    }
    res.json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi đổi mật khẩu' });
  }
});

// ===== Admin: Users & Roles =====
// Helper to check if Users table has a specific column
async function usersHasColumn(pool, col) {
  try {
    const rs = await pool.request()
      .input('col', sql.NVarChar(128), col)
      .query("SELECT 1 AS ok FROM sys.columns WHERE [name] = @col AND [object_id] = OBJECT_ID('dbo.Users')");
    return !!rs.recordset.length;
  } catch {
    return false;
  }
}

// ===== Promotions API REMOVED =====
// All promotion endpoints have been removed as per requirement to delete promotion feature.
// (Removed stray helper duplication that caused syntax issues)

// ---- Promotion validation helper (new) ----
const PROMO_CODE_REGEX = /^[A-Za-z0-9_-]+$/;
function validatePromotionInput({ code, discountType, discountValue, startDate, endDate, minOrderAmount, maxDiscount, hotelId }) {
  const errors = [];
  if (!code || !String(code).trim()) errors.push('Mã ưu đãi không được rỗng');
  else if (!PROMO_CODE_REGEX.test(String(code).trim())) errors.push('Mã chỉ được chứa chữ, số, "-" hoặc "_"');
  const type = (discountType || '').toUpperCase();
  if (!['PERCENT', 'FIXED'].includes(type)) errors.push('Loại giảm giá phải là PERCENT hoặc FIXED');
  const dVal = Number(discountValue);
  if (!(dVal > 0)) errors.push('Giá trị giảm phải > 0');
  if (type === 'PERCENT' && dVal > 100) errors.push('Phần trăm giảm tối đa 100');
  let s = startDate ? new Date(startDate) : null;
  let e = endDate ? new Date(endDate) : null;
  if (!s || isNaN(s)) errors.push('Ngày bắt đầu không hợp lệ');
  if (!e || isNaN(e)) errors.push('Ngày kết thúc không hợp lệ');
  if (s && e && e <= s) errors.push('Ngày kết thúc phải sau ngày bắt đầu');
  if (minOrderAmount !== undefined && minOrderAmount !== null && Number(minOrderAmount) < 0) errors.push('Giá trị đơn hàng tối thiểu không hợp lệ');
  if (maxDiscount !== undefined && maxDiscount !== null && Number(maxDiscount) < 0) errors.push('Giảm tối đa không hợp lệ');
  if (hotelId !== undefined && hotelId !== null && hotelId !== '' && isNaN(Number(hotelId))) errors.push('HotelId không hợp lệ');
  return { ok: errors.length === 0, errors };
}
// ---- End helper ----
// ===== Promotions Admin APIs =====
// List promotions
app.get('/api/admin/promotions', authorize(['Admin', 'Staff']), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const pool = await getPool();
    const r = pool.request();
    const conds = ['1=1'];
    if (q) { r.input('q', sql.NVarChar(200), `%${q}%`); conds.push("(p.Code LIKE @q OR p.Description LIKE @q OR h.Name LIKE @q)"); }
    if (status) {
      if (status.toLowerCase() === 'active') conds.push('(p.IsActive = 1)');
      else if (status.toLowerCase() === 'disabled') conds.push('(p.IsActive = 0)');
    }
    const rs = await r.query(`SELECT p.Id, p.Code, p.Description, p.DiscountType, p.DiscountValue, p.StartDate, p.EndDate, p.MinOrderAmount, p.MaxDiscount, p.IsActive, p.HotelId, h.Name AS HotelName, p.CreatedAt, p.UpdatedAt, p.CreatedBy FROM Promotions p LEFT JOIN Hotels h ON h.Id = p.HotelId WHERE ${conds.join(' AND ')} ORDER BY p.Id DESC`);
    const items = rs.recordset.map(x => ({ id: x.Id, code: x.Code, description: x.Description, discountType: x.DiscountType, discountValue: Number(x.DiscountValue || 0), startDate: x.StartDate, endDate: x.EndDate, minOrderAmount: x.MinOrderAmount, maxDiscount: x.MaxDiscount, isActive: !!x.IsActive, hotelId: x.HotelId || null, hotelName: x.HotelName || '', createdAt: x.CreatedAt, updatedAt: x.UpdatedAt, createdBy: x.CreatedBy }));
    res.json({ items });
  } catch (e) { console.error('promotions list error:', e); res.status(500).json({ message: 'Lỗi tải ưu đãi' }); }
});

// Create promotion
app.post('/api/admin/promotions', authorize(['Admin']), async (req, res) => {
  try {
    const { code, description, discountType, discountValue, startDate, endDate, minOrderAmount, maxDiscount, isActive, hotelId } = req.body || {};
    const v = validatePromotionInput({ code, discountType, discountValue, startDate, endDate, minOrderAmount, maxDiscount, hotelId });
    if (!v.ok) return res.status(400).json({ message: v.errors[0], errors: v.errors });
    const s = new Date(startDate);
    const e = new Date(endDate);
    const pool = await getPool();
    // check duplicate code
    const dup = await pool.request().input('code', sql.NVarChar(30), String(code).trim()).query('SELECT 1 FROM Promotions WHERE Code = @code');
    if (dup.recordset.length) return res.status(400).json({ message: 'Mã ưu đãi đã tồn tại' });
    const reqQ = pool.request()
      .input('code', sql.NVarChar(30), String(code).trim())
      .input('desc', sql.NVarChar(255), description || null)
      .input('dtype', sql.NVarChar(10), discountType)
      .input('dval', sql.Decimal(10, 2), Number(discountValue || 0))
      // store date-only by binding as sql.Date
      .input('start', sql.Date, new Date(s.getFullYear(), s.getMonth(), s.getDate()))
      .input('end', sql.Date, new Date(e.getFullYear(), e.getMonth(), e.getDate()))
      .input('min', sql.Decimal(10, 2), minOrderAmount ? Number(minOrderAmount) : null)
      .input('max', sql.Decimal(10, 2), maxDiscount ? Number(maxDiscount) : null)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .input('hotelId', sql.Int, hotelId ? Number(hotelId) : null);
    const ins = await reqQ.query(`INSERT INTO Promotions(Code, Description, DiscountType, DiscountValue, StartDate, EndDate, MinOrderAmount, MaxDiscount, IsActive, HotelId, CreatedAt) OUTPUT INSERTED.Id VALUES(@code,@desc,@dtype,@dval,@start,@end,@min,@max,@isActive,@hotelId,SYSDATETIME());`);
    res.json({ id: ins.recordset[0].Id });
  } catch (e) { console.error('promotions create error:', e); res.status(500).json({ message: 'Tạo ưu đãi thất bại' }); }
});

// Update promotion
app.put('/api/admin/promotions/:id', authorize(['Admin']), async (req, res) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ message: 'Mã không hợp lệ' });
    const { description, discountType, discountValue, startDate, endDate, minOrderAmount, maxDiscount, isActive, hotelId, code } = req.body || {};
    const pool = await getPool();
    // Load existing row
    const existingRs = await pool.request().input('id', sql.Int, id).query('SELECT TOP 1 * FROM Promotions WHERE Id=@id');
    if (!existingRs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy ưu đãi' });
    const prev = existingRs.recordset[0];
    // Build merged data for validation (code immutable unless explicitly provided && not duplicate)
    const merged = {
      code: (code !== undefined ? code : prev.Code),
      discountType: (discountType !== undefined ? discountType : prev.DiscountType),
      discountValue: (discountValue !== undefined ? discountValue : prev.DiscountValue),
      startDate: (startDate !== undefined ? startDate : prev.StartDate),
      endDate: (endDate !== undefined ? endDate : prev.EndDate),
      minOrderAmount: (minOrderAmount !== undefined ? minOrderAmount : prev.MinOrderAmount),
      maxDiscount: (maxDiscount !== undefined ? maxDiscount : prev.MaxDiscount),
      hotelId: (hotelId !== undefined ? hotelId : prev.HotelId)
    };
    const v = validatePromotionInput(merged);
    if (!v.ok) return res.status(400).json({ message: v.errors[0], errors: v.errors });
    // If code changed, ensure not duplicate
    if (code && code !== prev.Code) {
      const dup = await pool.request().input('code', sql.NVarChar(30), code).query('SELECT 1 FROM Promotions WHERE Code=@code AND Id<>@id');
      if (dup.recordset.length) return res.status(400).json({ message: 'Mã ưu đãi đã tồn tại' });
    }
    const r = pool.request().input('id', sql.Int, id);
    const sets = [];
    if (code !== undefined) { sets.push('Code=@code'); r.input('code', sql.NVarChar(30), code); }
    if (description !== undefined) { sets.push('Description=@desc'); r.input('desc', sql.NVarChar(255), description); }
    if (discountType !== undefined) { sets.push('DiscountType=@dtype'); r.input('dtype', sql.NVarChar(10), merged.discountType); }
    if (discountValue !== undefined) { sets.push('DiscountValue=@dval'); r.input('dval', sql.Decimal(10, 2), Number(merged.discountValue)); }
    if (startDate !== undefined) { const s = new Date(merged.startDate); sets.push('StartDate=@start'); r.input('start', sql.Date, new Date(s.getFullYear(), s.getMonth(), s.getDate())); }
    if (endDate !== undefined) { const e = new Date(merged.endDate); sets.push('EndDate=@end'); r.input('end', sql.Date, new Date(e.getFullYear(), e.getMonth(), e.getDate())); }
    if (minOrderAmount !== undefined) { sets.push('MinOrderAmount=@min'); r.input('min', sql.Decimal(10, 2), merged.minOrderAmount ? Number(merged.minOrderAmount) : null); }
    if (maxDiscount !== undefined) { sets.push('MaxDiscount=@max'); r.input('max', sql.Decimal(10, 2), merged.maxDiscount ? Number(merged.maxDiscount) : null); }
    if (isActive !== undefined) { sets.push('IsActive=@isActive'); r.input('isActive', sql.Bit, isActive ? 1 : 0); }
    if (hotelId !== undefined) { sets.push('HotelId=@hotelId'); r.input('hotelId', sql.Int, merged.hotelId ? Number(merged.hotelId) : null); }
    if (!sets.length) return res.status(400).json({ message: 'Không có thay đổi' });
    sets.push('UpdatedAt = SYSDATETIME()');
    const rs = await r.query(`UPDATE Promotions SET ${sets.join(', ')} WHERE Id=@id; SELECT @@ROWCOUNT AS Affected;`);
    if (!rs.recordset[0].Affected) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ ok: true });
  } catch (e) { console.error('promotions update error:', e); res.status(500).json({ message: 'Cập nhật ưu đãi thất bại' }); }
});

// Toggle activate/deactivate
app.patch('/api/admin/promotions/:id/activate', authorize(['Admin']), async (req, res) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ message: 'Mã không hợp lệ' });
    const { isActive } = req.body || {};
    const pool = await getPool();
    const rs = await pool.request().input('id', sql.Int, id).input('isActive', sql.Bit, isActive ? 1 : 0).query('UPDATE Promotions SET IsActive=@isActive, UpdatedAt=SYSDATETIME() WHERE Id=@id; SELECT @@ROWCOUNT AS Affected;');
    if (!rs.recordset[0].Affected) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ ok: true });
  } catch (e) { console.error('promotions activate error:', e); res.status(500).json({ message: 'Cập nhật trạng thái thất bại' }); }
});

// Delete promotion
app.delete('/api/admin/promotions/:id', authorize(['Admin']), async (req, res) => {
  try {
    const id = Number(req.params.id); if (!id) return res.status(400).json({ message: 'Mã không hợp lệ' });
    const pool = await getPool();
    const rs = await pool.request().input('id', sql.Int, id).query('DELETE FROM Promotions WHERE Id=@id; SELECT @@ROWCOUNT AS Affected;');
    if (!rs.recordset[0].Affected) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ ok: true });
  } catch (e) { console.error('promotions delete error:', e); res.status(500).json({ message: 'Xóa thất bại' }); }
});

// Public: list active promotions (no auth) - returns promotions currently active by date and IsActive flag
app.get('/api/promotions', async (req, res) => {
  try {
    const pool = await getPool();
    const now = new Date();
    // use date-only comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hidRaw = req.query.hotelId || req.query.hid || null;
    const hidNum = hidRaw && !isNaN(Number(hidRaw)) ? Number(hidRaw) : null;
    const r = pool.request().input('now', sql.Date, today);
    let where = 'IsActive = 1 AND StartDate <= @now AND EndDate >= @now';
    if (hidNum) { r.input('hid', sql.Int, hidNum); where += ' AND (p.HotelId IS NULL OR p.HotelId = @hid)'; }
    const rs = await r.query(`
      SELECT p.Id, p.Code, p.Description, p.DiscountType, p.DiscountValue, p.StartDate, p.EndDate, p.MinOrderAmount, p.MaxDiscount, p.HotelId, h.Name AS HotelName
      FROM Promotions p
      LEFT JOIN Hotels h ON h.Id = p.HotelId
      WHERE ${where}
      ORDER BY Id DESC`);
    const items = rs.recordset.map(x => ({
      id: x.Id,
      code: x.Code,
      description: x.Description,
      discountType: x.DiscountType,
      discountValue: Number(x.DiscountValue || 0),
      startDate: x.StartDate,
      endDate: x.EndDate,
      minOrderAmount: x.MinOrderAmount,
      maxDiscount: x.MaxDiscount,
      hotelId: x.HotelId || null,
      hotelName: x.HotelName || ''
    }));
    res.json({ items });
  } catch (e) {
    console.error('public promotions list error:', e);
    res.status(500).json({ message: 'Lỗi tải ưu đãi' });
  }
});

// Public: validate a promo code against an order amount and return computed discount
app.get('/api/promotions/validate', async (req, res) => {
  try {
    const code = (req.query.code || '').toString().trim();
    const amount = Number(req.query.amount || 0);
    const hotelId = req.query.hotelId ? Number(req.query.hotelId) : (req.query.hid ? Number(req.query.hid) : null);
    const roomIdsRaw = (req.query.roomIds || '').toString().trim();
    let roomIds = [];
    if (roomIdsRaw) {
      roomIds = roomIdsRaw.split(/[,;]/).map(x => Number(x.trim())).filter(x => !isNaN(x) && x > 0);
    }
  // Removed verbose debug log: incoming request context
    if (!code) return res.status(400).json({ message: 'Thiếu mã ưu đãi' });
    if (!(amount > 0)) return res.status(400).json({ message: 'Thiếu hoặc sai số tiền đơn hàng' });
    const pool = await getPool();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const r = pool.request().input('code', sql.NVarChar(30), code).input('now', sql.Date, today);
    const rs = await r.query(`SELECT TOP 1 * FROM Promotions WHERE Code = @code AND IsActive = 1 AND StartDate <= @now AND EndDate >= @now`);
    if (!rs.recordset.length) {
  // Removed debug log: promo not found/inactive
      return res.status(404).json({ message: 'Mã không tồn tại hoặc không còn hiệu lực' });
    }
    const p = rs.recordset[0];
    // Derive hotel set from provided roomIds if any
    let derivedHotelIds = [];
    if (roomIds.length) {
      try {
        const rSet = await (await getPool()).request()
          .input('ids', sql.NVarChar(sql.MAX), roomIds.join(','))
          .query(`SELECT DISTINCT HotelId FROM Rooms WHERE Id IN (SELECT TRY_CONVERT(INT, value) FROM STRING_SPLIT(@ids, ',') WHERE TRY_CONVERT(INT,value) IS NOT NULL)`);
        derivedHotelIds = rSet.recordset.map(r => r.HotelId).filter(x => x != null);
      } catch (e) { console.warn('promo validate derive hotels failed', e.message); }
    }
    // Decide effectiveHotelIds (if user supplied hotelId param, include it so legacy clients still work)
    if (hotelId && !derivedHotelIds.includes(hotelId)) derivedHotelIds.push(hotelId);
    // Hotel restriction enforcement
    if (p.HotelId) {
      if (!derivedHotelIds.length) {
        return res.status(400).json({ message: 'Mã chỉ áp dụng cho một khách sạn cụ thể. Thiếu phòng để xác định Hotel.' });
      }
      const mismatch = derivedHotelIds.some(h => Number(h) !== Number(p.HotelId));
      if (mismatch) return res.status(400).json({ message: 'Mã ưu đãi không áp dụng cho phòng đã chọn' });
    }
    // Normalize DB row keys (some drivers/serializers may use camelCase)
    const pr = {
      id: (p.Id !== undefined ? p.Id : (p.id !== undefined ? p.id : null)),
      code: (p.Code !== undefined ? p.Code : (p.code !== undefined ? p.code : null)),
      discountType: (p.DiscountType !== undefined ? p.DiscountType : (p.discountType !== undefined ? p.discountType : null)),
      discountValue: (p.DiscountValue !== undefined ? Number(p.DiscountValue) : (p.discountValue !== undefined ? Number(p.discountValue) : 0)),
      minOrderAmount: (p.MinOrderAmount !== undefined ? p.MinOrderAmount : (p.minOrderAmount !== undefined ? p.minOrderAmount : null)),
      maxDiscount: (p.MaxDiscount !== undefined ? p.MaxDiscount : (p.maxDiscount !== undefined ? p.maxDiscount : null)),
      isActive: (p.IsActive !== undefined ? p.IsActive : (p.isActive !== undefined ? p.isActive : null)),
      startDate: (p.StartDate !== undefined ? p.StartDate : (p.startDate !== undefined ? p.startDate : null)),
      endDate: (p.EndDate !== undefined ? p.EndDate : (p.endDate !== undefined ? p.endDate : null))
    };
  // Removed debug log: promo row details
    // Check minimum order amount
    if (pr.minOrderAmount && Number(pr.minOrderAmount) > 0 && amount < Number(pr.minOrderAmount)) {
  // Removed debug log: minimum order not met
      return res.status(400).json({ message: 'Mã chưa đủ điều kiện (giá trị đơn hàng nhỏ hơn yêu cầu)' });
    }
    // Basic discount sanity
    if (!(pr.discountValue > 0)) return res.status(400).json({ message: 'Giá trị giảm không hợp lệ' });
    if ((pr.discountType || '').toUpperCase() === 'PERCENT' && Number(pr.discountValue) > 100) return res.status(400).json({ message: 'Phần trăm giảm không hợp lệ (>100)' });
    let discount = 0;
    if ((pr.discountType || '').toUpperCase() === 'PERCENT') {
      discount = amount * (Number(pr.discountValue || 0) / 100);
      if (pr.maxDiscount) discount = Math.min(discount, Number(pr.maxDiscount));
    } else {
      discount = Number(pr.discountValue || 0);
      if (discount > amount) discount = amount;
    }
    discount = Math.round(discount);
    const finalAmount = Math.max(0, Math.round(amount - discount));
    // Log computed result for easier debugging
  // Removed debug log: computed discount result
    res.json({ ok: true, code: pr.code || p.Code, discount, final: finalAmount, promo: { id: pr.id, code: pr.code, discountType: pr.discountType, discountValue: Number(pr.discountValue || 0), minOrderAmount: pr.minOrderAmount, maxDiscount: pr.maxDiscount, hotelId: p.HotelId || null }, serverPromoRaw: p });
  } catch (e) {
    console.error('promotions validate error:', e);
    res.status(500).json({ message: 'Lỗi kiểm tra mã ưu đãi' });
  }
});

// Dev-only debug: dump promotions row for given code (only when not production)
app.get('/api/debug/promo-row', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ message: 'Forbidden' });
  const code = (req.query.code || '').toString().trim();
  if (!code) return res.status(400).json({ message: 'Thiếu mã' });
  try {
    const pool = await getPool();
    const rs = await pool.request().input('code', sql.NVarChar(30), code).query('SELECT TOP 1 * FROM Promotions WHERE Code=@code');
    if (!rs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ row: rs.recordset[0] });
  } catch (e) { console.error('debug promo-row error', e); res.status(500).json({ message: 'Lỗi' }); }
});

// ===== Admin Chatbot training endpoints =====
app.get('/api/admin/ai/training', authorize(['Admin']), (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const status = (req.query.status || '').toString().trim().toLowerCase();
    const tag = (req.query.tag || '').toString().trim().toLowerCase();
    const items = readTrainingData();
    const filtered = items.filter((it) => {
      if (status && status !== 'all' && (it.status || 'Active').toLowerCase() !== status) return false;
      if (tag && tag !== 'all') {
        const hasTag = (it.tags || []).some((t) => t && t.toLowerCase() === tag);
        if (!hasTag) return false;
      }
      if (!q) return true;
      const haystack = [it.question, it.answer, (it.variations || []).join(' '), (it.tags || []).join(' ')].join(' ').toLowerCase();
      return haystack.includes(q);
    });
    res.json({ items: filtered.map(sanitizeTrainingEntry), total: items.length });
  } catch (err) {
    console.error('GET /api/admin/ai/training error:', err && err.message ? err.message : err);
    res.status(500).json({ message: 'Không tải được dữ liệu huấn luyện' });
  }
});

app.post('/api/admin/ai/training', authorize(['Admin']), (req, res) => {
  const body = req.body || {};
  const question = body.question ? String(body.question).trim() : '';
  const answer = body.answer ? String(body.answer).trim() : '';
  if (!question) return res.status(400).json({ message: 'Câu hỏi không được để trống' });
  if (!answer) return res.status(400).json({ message: 'Câu trả lời không được để trống' });
  try {
    const now = new Date().toISOString();
    const items = readTrainingData();
    const entry = sanitizeTrainingEntry({
      id: `train_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      question,
      answer,
      status: body.status === 'Draft' ? 'Draft' : 'Active',
      tags: body.tags,
      variations: body.variations,
      suggestions: body.suggestions,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      lastUsedAt: null,
      ownerEmail: req.user && req.user.email ? req.user.email : null,
    });
    items.push(entry);
    writeTrainingData(items);
    res.json({ item: entry });
  } catch (err) {
    console.error('POST /api/admin/ai/training error:', err && err.message ? err.message : err);
    res.status(500).json({ message: 'Không lưu được mẫu huấn luyện' });
  }
});

app.put('/api/admin/ai/training/:id', authorize(['Admin']), (req, res) => {
  const id = (req.params.id || '').toString().trim();
  if (!id) return res.status(400).json({ message: 'Thiếu mã mẫu huấn luyện' });
  const body = req.body || {};
  try {
    const items = readTrainingData();
    const idx = items.findIndex((it) => String(it.id) === id);
    if (idx === -1) return res.status(404).json({ message: 'Không tìm thấy mẫu huấn luyện' });
    const current = { ...items[idx] };
    if (body.question !== undefined) {
      const nextQ = String(body.question || '').trim();
      if (!nextQ) return res.status(400).json({ message: 'Câu hỏi không được để trống' });
      current.question = nextQ;
    }
    if (body.answer !== undefined) {
      const nextA = String(body.answer || '').trim();
      if (!nextA) return res.status(400).json({ message: 'Câu trả lời không được để trống' });
      current.answer = nextA;
    }
    if (body.status !== undefined) current.status = body.status === 'Draft' ? 'Draft' : 'Active';
    if (body.tags !== undefined) current.tags = toUniqueStringArray(body.tags);
    if (body.variations !== undefined) current.variations = toUniqueStringArray(body.variations);
    if (body.suggestions !== undefined) current.suggestions = toUniqueStringArray(body.suggestions);
    current.updatedAt = new Date().toISOString();
    items[idx] = sanitizeTrainingEntry(current);
    writeTrainingData(items);
    res.json({ item: items[idx] });
  } catch (err) {
    console.error('PUT /api/admin/ai/training/:id error:', err && err.message ? err.message : err);
    res.status(500).json({ message: 'Không cập nhật được mẫu huấn luyện' });
  }
});

app.delete('/api/admin/ai/training/:id', authorize(['Admin']), (req, res) => {
  const id = (req.params.id || '').toString().trim();
  if (!id) return res.status(400).json({ message: 'Thiếu mã mẫu huấn luyện' });
  try {
    const items = readTrainingData();
    const idx = items.findIndex((it) => String(it.id) === id);
    if (idx === -1) return res.status(404).json({ message: 'Không tìm thấy mẫu huấn luyện' });
    items.splice(idx, 1);
    writeTrainingData(items);
    res.json({ message: 'Đã xóa mẫu huấn luyện' });
  } catch (err) {
    console.error('DELETE /api/admin/ai/training/:id error:', err && err.message ? err.message : err);
    res.status(500).json({ message: 'Không xóa được mẫu huấn luyện' });
  }
});

// ===== Enhanced AI Chat Endpoint (rule-based + room search) =====
// POST /api/ai/chat { message, sessionId? }
// Returns: { reply, suggestions?: string[], results?: [{ id,name,price,maxAdults,maxChildren,rating,image }] }

const _chatSessions = new Map(); // sessionId -> { filters: { roomNames:[], minPrice, maxPrice, minAdults, maxAdults, minChildren, maxChildren, minRating }, lastUpdated }

function getSession(sessionId) {
  const sid = sessionId && typeof sessionId === 'string' ? sessionId : 'default';
  if (!_chatSessions.has(sid)) _chatSessions.set(sid, { filters: {}, lastUpdated: Date.now() });
  return { sid, state: _chatSessions.get(sid) };
}

// Parse price expressions like: "dưới 2 triệu", "< 1500000", "1-2 triệu", "từ 800k đến 1.2 triệu"
function parsePriceTokens(txt, filters) {
  const t = txt.toLowerCase();
  // Range patterns: 1-2 triệu OR 1 đến 2 triệu
  const rangeRegex = /(\d+[\d\.]*)(?:\s*(?:-|đến|to)\s*)(\d+[\d\.]*)\s*(triệu|trieu|m|k)?/;
  const mRange = t.match(rangeRegex);
  if (mRange) {
    let a = normalizePriceNumber(mRange[1], mRange[3]);
    let b = normalizePriceNumber(mRange[2], mRange[3]);
    if (a && b) {
      if (a > b) [a, b] = [b, a];
      filters.minPrice = a;
      filters.maxPrice = b;
    }
  }
  // Max only: dưới / nhỏ hơn / <=
  const maxRegex = /(dưới|<=|nhỏ hơn|nho hon|tối đa|toi da|không quá|khong qua|max)\s*(\d+[\d\.]*)\s*(triệu|trieu|m|k)?/;
  const mMax = t.match(maxRegex);
  if (mMax) {
    const v = normalizePriceNumber(mMax[2], mMax[3]);
    if (v) filters.maxPrice = v;
  }
  // Min only: trên / từ / ít nhất / >=
  const minRegex = /(trên|>=|từ|tu|ít nhất|it nhat|tối thiểu|toi thieu)\s*(\d+[\d\.]*)\s*(triệu|trieu|m|k)?/;
  const mMin = t.match(minRegex);
  if (mMin) {
    const v = normalizePriceNumber(mMin[2], mMin[3]);
    if (v) filters.minPrice = v;
  }
  // Single mention like "phòng 1.5 triệu" (set max if none)
  if (!filters.maxPrice && !filters.minPrice) {
    const single = t.match(/(\d+[\d\.]*)\s*(triệu|trieu|m|k)(?![a-z])/);
    if (single) {
      const v = normalizePriceNumber(single[1], single[2]);
      if (v) filters.maxPrice = v;
    }
  }
}

function normalizePriceNumber(raw, unit) {
  if (!raw) return null;
  let num = Number(String(raw).replace(/\./g, ''));
  if (Number.isNaN(num)) return null;
  const u = (unit || '').toLowerCase();
  if (u.includes('triệu') || u.includes('trieu') || u === 'm') num = num * 1_000_000;
  else if (u === 'k') num = num * 1_000;
  // Heuristic: if user typed a bare number like 1500 and it's plausibly thousands, scale to 1_500_000 (treat as 'k')
  if (!unit && num > 100 && num < 10_000) num = num * 1_000; // interpret 1500 => 1_500_000 VNĐ
  return Math.round(num);
}

function parseCapacity(txt, filters) {
  const adult = txt.match(/(\d+)\s*(người lớn|nguoi lon|nguoi\s*lon|nguoi)/i);
  if (adult) filters.minAdults = filters.maxAdults = Number(adult[1]);
  const child = txt.match(/(\d+)\s*(trẻ em|tre em|tre)/i);
  if (child) filters.minChildren = filters.maxChildren = Number(child[1]);
}

function parseRating(txt, filters) {
  // e.g. "trên 4 sao", ">=4.5 sao", "ít nhất 3 sao"
  const r = txt.match(/(trên|tren|>=|ít nhất|it nhat|từ|tu)?\s*(\d(?:[\.,]\d)?)\s*sao/);
  if (r) {
    let val = Number((r[2] || '0').replace(',', '.'));
    if (!Number.isNaN(val) && val > 0 && val <= 5) filters.minRating = val;
  }
}

function summarizeFilters(f) {
  const parts = [];
  if (f.roomNames && f.roomNames.length) parts.push(`loại: ${f.roomNames.join(', ')}`);
  if (f.minPrice || f.maxPrice) {
    const fmt = v => (v).toLocaleString('vi-VN') + 'đ';
    if (f.minPrice && f.maxPrice) parts.push(`giá ${fmt(f.minPrice)} - ${fmt(f.maxPrice)}`);
    else if (f.minPrice) parts.push(`giá từ ${fmt(f.minPrice)}`);
    else parts.push(`giá dưới ${fmt(f.maxPrice)}đ`);
  }
  if (f.minAdults) parts.push(`${f.minAdults} người lớn`);
  if (f.minChildren) parts.push(`${f.minChildren} trẻ em`);
  if (f.minRating) parts.push(`đánh giá ≥ ${f.minRating}★`);
  return parts.join(', ');
}

async function searchRoomTypesByFilters(pool, filters) {
  const where = ['1=1'];
  const req = pool.request();
  if (filters.roomNames && filters.roomNames.length) {
    const likes = [];
    filters.roomNames.forEach((n, i) => { const key = 'rn' + i; likes.push(`rt.Name LIKE @${key}`); req.input(key, sql.NVarChar(200), `%${n}%`); });
    where.push('(' + likes.join(' OR ') + ')');
  }
  if (filters.minPrice) { where.push('rt.BasePrice >= @minP'); req.input('minP', sql.Decimal(18,2), filters.minPrice); }
  if (filters.maxPrice) { where.push('rt.BasePrice <= @maxP'); req.input('maxP', sql.Decimal(18,2), filters.maxPrice); }
  if (filters.minAdults) { where.push('rt.MaxAdults >= @minA'); req.input('minA', sql.Int, filters.minAdults); }
  if (filters.minChildren) { where.push('rt.MaxChildren >= @minC'); req.input('minC', sql.Int, filters.minChildren); }

  // Build query with OUTER APPLY to compute average rating (half-star rating stored in Reviews.Rating /2 => star)
  const sqlText = `SELECT TOP 15 rt.Id, rt.Name, rt.BasePrice, rt.MaxAdults, rt.MaxChildren, rt.Image,
      (SELECT CAST(AVG(CAST(rv.Rating as float))/2.0 AS DECIMAL(4,2))
         FROM Bookings b INNER JOIN Reviews rv ON rv.BookingId = b.Id
         WHERE b.RoomTypeId = rt.Id) AS AvgRating
    FROM Room_Types rt
    WHERE ${where.join(' AND ')}
    ORDER BY rt.BasePrice ASC, rt.Name ASC`;
  const rs = await req.query(sqlText);
  let list = rs.recordset.map(r => ({
    id: r.Id,
    name: r.Name,
    price: Number(r.BasePrice || 0),
    maxAdults: r.MaxAdults,
    maxChildren: r.MaxChildren,
    rating: r.AvgRating !== null && r.AvgRating !== undefined ? Number(r.AvgRating) : null,
    image: r.Image || null
  }));
  if (filters.minRating) list = list.filter(x => (x.rating || 0) >= filters.minRating);
  return list;
}

app.post('/api/ai/chat', async (req, res) => {
  try {
    const userMsg = (req.body && req.body.message ? String(req.body.message) : '').trim();
    const sessionId = req.body && req.body.sessionId ? String(req.body.sessionId) : undefined;
    if (!userMsg) return res.status(400).json({ message: 'Thiếu nội dung tin nhắn' });
    const lower = userMsg.toLowerCase();
    const trainingEntriesAll = readTrainingData();
    const trainingEntriesActive = trainingEntriesAll.filter((it) => (it.status || 'Active') === 'Active');
    const { sid, state } = getSession(sessionId);
    const filters = state.filters || (state.filters = {});
    const suggestions = [];
    let reply = '';

    // Retrieve list of room type names once per request (for keyword matching)
    let roomTypeNames = [];
    try {
      const pool = await getPool();
      const rsNames = await pool.request().query('SELECT TOP 200 Name FROM Room_Types');
      roomTypeNames = rsNames.recordset.map(r => String(r.Name));
    } catch { /* ignore */ }

    // Extract explicit room type mentions
    const mentioned = roomTypeNames.filter(n => n && lower.includes(n.toLowerCase()));
    if (mentioned.length) {
      filters.roomNames = Array.from(new Set([...(filters.roomNames || []), ...mentioned]));
    }

    // Price / capacity / rating parsing
    parsePriceTokens(userMsg, filters);
    parseCapacity(userMsg, filters);
    parseRating(userMsg, filters);

    // Reset intent if user asks to clear
    if (/xóa lọc|xoa loc|reset|clear/.test(lower)) {
      state.filters = {}; // wipe
      reply = 'Đã xóa các bộ lọc. Bạn muốn tìm phòng theo tiêu chí nào mới? (ví dụ: "phòng deluxe dưới 2 triệu")';
      return res.json({ reply, suggestions: ['Phòng Deluxe dưới 2 triệu', 'Phòng cho 2 người lớn', 'Phòng Suite 4 sao'] });
    }

    // High-level intents (greeting / help)
    if (/^(xin chào|hello|hi|chào|hey)\b/.test(lower)) {
      reply = 'Chào bạn! Bạn có thể gõ ví dụ: "phòng deluxe dưới 2 triệu cho 2 người lớn" hoặc "suite 4 sao".';
      return res.json({ reply, suggestions: ['Phòng Deluxe dưới 2 triệu', 'Suite 4 sao', 'Phòng cho 2 người lớn'] });
    }

    const wantsBooking = /(đặt.*phòng|dat.*phong|phòng|phong)/.test(lower) || (filters.roomNames && filters.roomNames.length) || filters.minPrice || filters.maxPrice || filters.minAdults || filters.minRating;

    if (wantsBooking) {
      // Perform search
      try {
        const pool = await getPool();
        const results = await searchRoomTypesByFilters(pool, filters);
        if (results.length) {
          const summary = summarizeFilters(filters);
            reply = summary ? `Tìm thấy ${results.length} kết quả phù hợp (${summary}). Bạn có thể chọn một để đặt phòng.` : `Tìm thấy ${results.length} kết quả.`;
          // Provide top suggestions based on first results
          results.slice(0, 3).forEach(r => suggestions.push('Đặt phòng ' + r.name));
          if (results.length > 3) suggestions.push('Lọc giá thấp hơn', 'Lọc 4 sao');
          return res.json({ reply, suggestions, results });
        }
        // If no results but we have some filters -> ask to relax
        if (Object.keys(filters).length) {
          reply = 'Chưa tìm thấy phòng phù hợp với bộ lọc hiện tại. Bạn có muốn nới giá hoặc bỏ bớt điều kiện?';
          suggestions.push('Xóa lọc', 'Tăng giá tối đa', 'Giảm yêu cầu sao');
          return res.json({ reply, suggestions });
        }
      } catch (e) {
        reply = 'Không tìm được dữ liệu phòng (lỗi máy chủ). Bạn thử lại sau nhé.';
        return res.json({ reply });
      }
    }

    // Other informational intents
    if (/ưu đãi|khuyến mãi|giam|discount|promotion|uu dai/.test(lower)) {
      reply = 'Hiện có ưu đãi Đặt sớm -20% và Ở 3 đêm tặng 1 đêm. Bạn có muốn tìm phòng áp dụng ưu đãi không?';
      suggestions.push('Phòng dưới 2 triệu', 'Phòng Deluxe', 'Xóa lọc');
      return res.json({ reply, suggestions });
    }
    if (/dịch vụ|dich vu|service|spa|giặt ủi|giat ui|laundry|ăn uống|an uong/.test(lower)) {
      reply = 'Dịch vụ nổi bật: Spa, Giặt ủi, Nhà hàng 24/7, Đưa đón sân bay. Bạn muốn kết hợp tìm phòng luôn không?';
      suggestions.push('Phòng Deluxe dưới 2 triệu', 'Suite 4 sao', 'Xóa lọc');
      return res.json({ reply, suggestions });
    }
    if (/liên hệ|contact|điện thoại|email|hotline/.test(lower)) {
      reply = 'Liên hệ: 0123-456-7890 · Email: HMS_AI_Hotel@gmail.com. Bạn muốn tôi hỗ trợ tìm phòng luôn không?';
      suggestions.push('Phòng cho 2 người lớn', 'Phòng dưới 2 triệu');
      return res.json({ reply, suggestions });
    }
    if (/cảm ơn|thanks|thank you|ok|tạm biệt|bye/.test(lower)) {
      reply = 'Rất vui được hỗ trợ bạn! Khi cần chỉ cần gõ tiêu chí phòng hoặc "help".';
      return res.json({ reply });
    }
    if (/help|hỗ trợ|huong dan|hướng dẫn/.test(lower)) {
      reply = 'Bạn có thể kết hợp tiêu chí: loại phòng (Deluxe), giá (dưới 2 triệu), số khách (2 người lớn), sao (4 sao). Ví dụ: "Deluxe 2 người lớn dưới 2 triệu"';
      suggestions.push('Deluxe 2 người lớn dưới 2 triệu', 'Suite 4 sao', 'Phòng cho 3 người lớn');
      return res.json({ reply, suggestions });
    }

    const matchedTraining = findBestTrainingMatch(trainingEntriesActive, userMsg);
    if (matchedTraining) {
      const nowIso = new Date().toISOString();
      const idx = trainingEntriesAll.findIndex((it) => String(it.id) === String(matchedTraining.id));
      if (idx !== -1) {
        const updated = { ...trainingEntriesAll[idx], usageCount: (trainingEntriesAll[idx].usageCount || 0) + 1, lastUsedAt: nowIso };
        trainingEntriesAll[idx] = sanitizeTrainingEntry({ ...updated, updatedAt: trainingEntriesAll[idx].updatedAt, createdAt: trainingEntriesAll[idx].createdAt });
        writeTrainingData(trainingEntriesAll);
      }
      return res.json({ reply: matchedTraining.answer, suggestions: (matchedTraining.suggestions || []).slice(0, 6) });
    }

    // Fallback: treat as new search query attempt
    reply = 'Bạn vui lòng mô tả rõ hơn tiêu chí phòng (ví dụ: "suite dưới 3 triệu cho 2 người lớn 1 trẻ em").';
    suggestions.push('Deluxe 2 người lớn', 'Phòng dưới 2 triệu', 'Suite 4 sao');
    res.json({ reply, suggestions });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi xử lý chat' });
  }
});

// List roles
app.get('/api/admin/roles', authorize(['Admin']), async (_req, res) => {
  try {
    const pool = await getPool();
    const rs = await pool.request().query('SELECT Id, Name FROM Roles ORDER BY Name');
    res.json({ roles: rs.recordset.map(r => ({ id: r.Id, name: r.Name })) });
  } catch (err) {
    console.error('List roles error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách quyền' });
  }
});

// List users with roles
app.get('/api/admin/users', authorize(['Admin']), async (req, res) => {
  const q = (req.query.q || '').trim();
  const status = (req.query.status || '').trim().toLowerCase();
  try {
    const pool = await getPool();
    const hasStatus = await usersHasColumn(pool, 'Status');
    const r = pool.request();
    if (q) r.input('q', sql.NVarChar(200), `%${q}%`);
    const rs = await r.query(`
      SELECT u.Id, u.Name, u.Email, u.Phone, u.Address, u.RoleId, r.Name AS RoleName${hasStatus ? ', u.Status' : ", N'Hoạt động' AS Status"}
      FROM Users u
      LEFT JOIN Roles r ON r.Id = u.RoleId
      ${q ? 'WHERE (u.Name LIKE @q OR u.Email LIKE @q OR u.Phone LIKE @q)' : ''}
      ORDER BY u.Id`);
    res.json({
      users: rs.recordset.map(u => {
        const raw = (u.Status || 'Active').toString();
        const canonical = raw.trim();
        const label = canonical.toLowerCase() === 'block' ? 'Khóa' : 'Hoạt động';
        return {
          id: u.Id,
          name: u.Name,
          email: u.Email,
          phone: u.Phone,
          address: u.Address,
          roleId: u.RoleId,
          roleName: u.RoleName,
          status: label
        };
      })
    });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách người dùng' });
  }
});

// Create user
app.post('/api/admin/users', authorize(['Admin']), async (req, res) => {
  const { name, email, password, phone, address, roleId, status } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Thiếu email hoặc mật khẩu' });
  try {
    const pool = await getPool();
    const exists = await pool.request().input('email', sql.NVarChar(100), email)
      .query('SELECT 1 FROM Users WHERE Email = @email');
    if (exists.recordset.length) return res.status(400).json({ message: 'Email đã tồn tại' });
    const hasStatus = await usersHasColumn(pool, 'Status');
    const reqQ = pool.request()
      .input('name', sql.NVarChar(50), name || null)
      .input('email', sql.NVarChar(100), email)
      .input('password', sql.NVarChar(255), password)
      .input('phone', sql.NVarChar(50), phone || null)
      .input('address', sql.NVarChar(255), address || null)
      .input('roleId', sql.Int, roleId || null);
    let fields = 'Name, Email, Password, Phone, Address, RoleId';
    let values = '@name, @email, @password, @phone, @address, @roleId';
    if (hasStatus) {
      const canon = (status && status.toLowerCase() === 'block') ? 'Block' : 'Active';
      reqQ.input('status', sql.NVarChar(50), canon);
      fields += ', Status'; values += ', @status';
    }
    await reqQ.query(`INSERT INTO Users (${fields}) VALUES (${values})`);
    res.json({ message: 'Tạo người dùng thành công' });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tạo người dùng' });
  }
});

// Update user
app.put('/api/admin/users/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  const { name, email, phone, address, roleId, status } = req.body || {};
  try {
    const pool = await getPool();
    const hasStatus = await usersHasColumn(pool, 'Status');
    const sets = [];
    const r = pool.request().input('id', sql.Int, id);
    if (name !== undefined) { sets.push('Name = @name'); r.input('name', sql.NVarChar(50), name || null); }
    if (email !== undefined) { sets.push('Email = @email'); r.input('email', sql.NVarChar(100), email || null); }
    if (phone !== undefined) { sets.push('Phone = @phone'); r.input('phone', sql.NVarChar(50), phone || null); }
    if (address !== undefined) { sets.push('Address = @address'); r.input('address', sql.NVarChar(255), address || null); }
    if (roleId !== undefined) { sets.push('RoleId = @roleId'); r.input('roleId', sql.Int, roleId || null); }
    if (hasStatus && status !== undefined) {
      const canon = (status && status.toLowerCase() === 'block') ? 'Block' : (status && status.toLowerCase() === 'active' ? 'Active' : null);
      if (canon) { sets.push('Status = @status'); r.input('status', sql.NVarChar(50), canon); }
    }
    if (!sets.length) return res.status(400).json({ message: 'Không có trường nào để cập nhật' });
    const hasUpdUsers2 = await usersHasColumn(pool, 'UpdatedAt');
    await r.query(`UPDATE Users SET ${sets.join(', ')}${hasUpdUsers2 ? ', UpdatedAt = GETDATE()' : ''} WHERE Id = @id`);
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật người dùng' });
  }
});

// Delete user
app.delete('/api/admin/users/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM Users WHERE Id = @id');
    res.json({ message: 'Đã xóa người dùng' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi xóa người dùng' });
  }
});

// Change role
app.put('/api/admin/users/:id/role', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  const roleId = Number(req.body && req.body.roleId);
  if (!id || !roleId) return res.status(400).json({ message: 'Thiếu ID hoặc RoleId' });
  try {
    const pool = await getPool();
    const hasUpdUsers3 = await usersHasColumn(pool, 'UpdatedAt');
    await pool.request().input('id', sql.Int, id).input('roleId', sql.Int, roleId)
      .query(`UPDATE Users SET RoleId = @roleId${hasUpdUsers3 ? ', UpdatedAt = GETDATE()' : ''} WHERE Id = @id`);
    res.json({ message: 'Đã cập nhật phân quyền' });
  } catch (err) {
    console.error('Change role error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi đổi quyền' });
  }
});

// Lock/Unlock user
app.put('/api/admin/users/:id/lock', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  const lock = !!(req.body && req.body.lock);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    const hasStatus = await usersHasColumn(pool, 'Status');
    if (!hasStatus) return res.status(400).json({ message: 'Bảng Users không có cột Status' });
    const hasUpdUsers4 = await usersHasColumn(pool, 'UpdatedAt');
    await pool.request().input('id', sql.Int, id)
      .input('status', sql.NVarChar(50), lock ? 'Block' : 'Active')
      .query(`UPDATE Users SET Status = @status${hasUpdUsers4 ? ', UpdatedAt = GETDATE()' : ''} WHERE Id = @id`);
    res.json({ message: lock ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản', status: lock ? 'Block' : 'Active' });
  } catch (err) {
    console.error('Lock user error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật trạng thái' });
  }
});

// Complete payment: create bookings + payments, mark rooms occupied
// CHANGED BEHAVIOR (QR Pending Flow):
// Endpoint now only INITIATES a booking + payment in Pending state.
// Frontend will show QR code; Admin later confirms or user cancels.
// New auxiliary endpoints to be added below:
//   PUT /api/payments/:bookingId/confirm  (Admin)
//   PUT /api/payments/:bookingId/cancel   (User if still pending)
app.post('/api/payments/complete', async (req, res) => {
  const {
    token,
    email,
    asUserEmail,
    checkIn,
    checkOut,
    rooms,
    method,
  } = req.body || {};
  if ((!email && !asUserEmail) || !Array.isArray(rooms) || rooms.length === 0 || !checkIn || !checkOut) {
    return res.status(400).json({ message: 'Thiếu thông tin giao dịch' });
  }
  try {
    // Disallow Admin accounts from creating bookings (policy: Admin chỉ quản lý, không đặt)
    try {
      const callerEmail = (req.headers['x-user-email'] || '').toString().trim();
      if (callerEmail) {
        const callerRole = await getUserRoleByEmail(callerEmail);
        if (callerRole === 'Admin') return res.status(403).json({ message: 'Admin không được tạo đặt phòng' });
      }
    } catch (e) { /* ignore lookup errors and proceed */ }
    const pool = await getPool();
    // Determine the user this booking is for. Admins may create on behalf of another user by providing asUserEmail
    let targetEmail = email;
    try {
      const callerEmail = (req.headers['x-user-email'] || '').toString().trim();
      const callerRole = await getUserRoleByEmail(callerEmail);
      if (callerRole === 'Admin' && asUserEmail && typeof asUserEmail === 'string' && asUserEmail.trim()) {
        targetEmail = asUserEmail.trim();
      }
    } catch (e) { /* ignore and fall back to provided email */ }
    // Find target user
    const u = await pool.request().input('email', sql.NVarChar(100), targetEmail)
      .query('SELECT TOP 1 Id FROM Users WHERE Email = @email');
    if (!u.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const userId = u.recordset[0].Id;


    // Convert & validate dates
    const inD = new Date(checkIn);
    const outD = new Date(checkOut);
    if (!(inD instanceof Date) || isNaN(inD) || !(outD instanceof Date) || isNaN(outD) || outD <= inD) {
      return res.status(400).json({ message: 'Khoảng ngày không hợp lệ' });
    }
    const nights = Math.max(1, Math.ceil((outD - inD) / (1000 * 60 * 60 * 24)));

    const created = [];
    // First pass: resolve room rows and compute amounts per room so we can validate promo against total
    const rowsData = [];
    for (const r of rooms) {
      const roomId = Number(r.id);
      if (!roomId) continue;
      const rr = await pool.request().input('rid', sql.Int, roomId).query(`
        SELECT TOP 1 r.Id, r.HotelId, r.RoomTypeId, rt.BasePrice
        FROM Rooms r
        INNER JOIN Room_Types rt ON rt.Id = r.RoomTypeId
        WHERE r.Id = @rid`);
      if (!rr.recordset.length) continue;
      const row = rr.recordset[0];
      const amount = Number(r.price || row.BasePrice || 0) * nights;
      // Check existing booking for exact same room/date
      const existB = await pool.request()
        .input('rid', sql.Int, row.Id)
        .input('cin', sql.Date, inD)
        .input('cout', sql.Date, outD)
        .query(`
          SELECT TOP 1 b.Id, b.PaymentStatus
          FROM Bookings b
          WHERE b.RoomId=@rid AND b.CheckInDate=@cin AND b.CheckOutDate=@cout
            AND (b.PaymentStatus NOT IN (N'Hủy', N'Huy', N'Canceled', N'Cancel'))
        `);
      if (existB.recordset.length) {
        rowsData.push({ skipExistingBookingId: existB.recordset[0].Id });
        continue;
      }
      rowsData.push({ roomRow: row, requested: r, amount });
    }

    // Compute gross total for all new bookings
    const grossTotal = rowsData.reduce((s, x) => s + (x.amount || 0), 0);
    if (!(grossTotal > 0)) return res.status(400).json({ message: 'Tổng tiền không hợp lệ' });
    // Rule update: yêu cầu số người lớn (adults) >= 1, cho phép tổng khách = 1 (1 người lớn, 0 trẻ em)
    const totalAdults = rooms.reduce((acc, r) => acc + Number(r.adults || 0), 0);
    if (totalAdults < 1) return res.status(400).json({ message: 'Phải có ít nhất 1 người lớn' });

    // Promo validation & discount computation (with optional client override)
    let promo = null;
    let discountTotal = 0;
    const promoCode = (req.body && req.body.promoCode) ? String(req.body.promoCode).trim() : '';
    if (promoCode) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const pRs = await pool.request().input('code', sql.NVarChar(30), promoCode).input('now', sql.Date, today)
        .query(`SELECT TOP 1 * FROM Promotions WHERE Code = @code AND IsActive = 1 AND StartDate <= @now AND EndDate >= @now`);
      if (!pRs.recordset.length) return res.status(400).json({ message: 'Mã ưu đãi không hợp lệ hoặc không còn hiệu lực' });
      const p = pRs.recordset[0];
      if (p.HotelId) {
        const distinctHotels = new Set(rowsData.filter(x => x.roomRow).map(x => x.roomRow.HotelId));
        if (distinctHotels.size > 1 || !distinctHotels.has(Number(p.HotelId))) {
          return res.status(400).json({ message: 'Mã ưu đãi không áp dụng cho khách sạn đã chọn' });
        }
      }
      if (p.MinOrderAmount && Number(p.MinOrderAmount) > 0 && grossTotal < Number(p.MinOrderAmount)) {
        return res.status(400).json({ message: 'Mã chưa đủ điều kiện (giá trị đơn hàng nhỏ hơn yêu cầu)' });
      }
      const dtype = (p.DiscountType || '').toUpperCase();
      const dvalNum = Number(p.DiscountValue || 0);
      if (dvalNum > 0) {
        if (dtype === 'PERCENT') {
          if (dvalNum > 100) return res.status(400).json({ message: 'Phần trăm ưu đãi không hợp lệ (>100)' });
          discountTotal = grossTotal * (dvalNum / 100);
          if (p.MaxDiscount) discountTotal = Math.min(discountTotal, Number(p.MaxDiscount));
        } else {
          discountTotal = dvalNum;
        }
        if (discountTotal > grossTotal) discountTotal = grossTotal;
        discountTotal = Math.round(discountTotal);
        promo = { id: p.Id, code: p.Code, discountType: p.DiscountType, discountValue: Number(p.DiscountValue || 0), minOrderAmount: p.MinOrderAmount, maxDiscount: p.MaxDiscount, hotelId: p.HotelId || null };
      }
    }

    // ===== Client override parsing (final total, discount amount, percent) =====
    function parseNum(v) { if (v === undefined || v === null) return null; if (typeof v === 'number' && !isNaN(v)) return v; if (typeof v === 'string') { const c = v.replace(/[^0-9.,-]/g, '').replace(/,/g, ''); if (!c) return null; const n = Number(c); return isNaN(n) ? null : n; } return null; }
    const finals = [req.body?.finalTotal, req.body?.finalAmount, req.body?.final_amount, req.body?.totalAfterDiscount, req.body?.netTotal].map(parseNum).filter(v => v !== null && v >= 0);
    const discountsAbs = [req.body?.discountAmount, req.body?.discount_value, req.body?.discountValue].map(parseNum).filter(v => v !== null && v >= 0);
    const percents = [req.body?.discountPercent, req.body?.discount_percentage, req.body?.percentDiscount].map(parseNum).filter(v => v !== null && v > 0 && v <= 100);

    if (finals.length) {
      // Use smallest plausible final to avoid overcharging
      const minFinal = Math.min(...finals);
      if (minFinal <= grossTotal) {
        const impliedDiscount = grossTotal - minFinal;
        if (impliedDiscount > discountTotal) discountTotal = impliedDiscount;
      }
    } else if (discountsAbs.length) {
      const maxDisc = Math.min(grossTotal, Math.max(...discountsAbs));
      if (maxDisc > discountTotal) discountTotal = maxDisc;
    } else if (percents.length && discountTotal === 0) {
      const maxP = Math.min(100, Math.max(...percents));
      discountTotal = Math.round(grossTotal * (maxP / 100));
    }

    if (discountTotal < 0) discountTotal = 0;
    if (discountTotal > grossTotal) discountTotal = grossTotal;
    const finalAllNet = Math.max(0, Math.round(grossTotal - discountTotal));
    const depositRate = 0.2;
    const depositBase = finalAllNet > 0 ? finalAllNet : grossTotal;
    const targetDepositTotal = roundCurrency(depositBase * depositRate);
    const activeRows = rowsData.filter(x => x.roomRow);
    const activeRowCount = activeRows.length;
    const depositAllocations = [];
    let remainingDeposit = targetDepositTotal;
    let processedActive = 0;

    for (const rd of rowsData) {
      if (!rd.roomRow) {
        depositAllocations.push(0);
        continue;
      }
      processedActive += 1;
      if (targetDepositTotal <= 0) {
        depositAllocations.push(0);
        continue;
      }
      let shareAmount = 0;
      if (processedActive === activeRowCount) {
        shareAmount = remainingDeposit;
      } else {
        const share = grossTotal > 0 ? (rd.amount || 0) / grossTotal : 0;
        shareAmount = roundCurrency(targetDepositTotal * share);
        if (shareAmount > remainingDeposit) shareAmount = remainingDeposit;
      }
      shareAmount = Math.max(0, roundCurrency(shareAmount));
      depositAllocations.push(shareAmount);
      remainingDeposit = roundCurrency(remainingDeposit - shareAmount);
    }

    // ===== REVERT MODE (A1): Per yêu cầu người dùng: lưu GIÁ GỐC vào DB, KHÔNG lưu số tiền đã giảm =====
    // Lý do: Người dùng muốn "hoàn tác" việc ghi số tiền sau giảm vào Bookings.TotalAmount.
    // Giữ lại phần tính discount để trả về frontend (grossTotal, discountTotal, finalTotal) nhưng KHÔNG áp dụng vào giá lưu DB.
    // Vì vậy: TotalAmount = gross (mỗi phòng), OriginalAmount (nếu có) = gross, Payments.Amount = gross.
    // Cảnh báo: Sau thay đổi này, dữ liệu DB sẽ không phản ánh doanh thu sau giảm giá (mất khả năng phân tích chính xác giảm giá).

    // Second pass: insert bookings with both stored amounts = gross (net bỏ qua) theo revert A1.
    for (let idx = 0; idx < rowsData.length; idx += 1) {
      const rd = rowsData[idx];
      if (rd.skipExistingBookingId) { created.push(rd.skipExistingBookingId); continue; }
      const row = rd.roomRow; const reqRoom = rd.requested; const gross = rd.amount || 0;
      const depositAmount = roundCurrency(depositAllocations[idx] || 0);
      const requestBooking = pool.request()
        .input('userId', sql.Int, userId)
        .input('hotelId', sql.Int, row.HotelId)
        .input('roomTypeId', sql.Int, row.RoomTypeId)
        .input('roomId', sql.Int, row.Id)
        .input('checkIn', sql.Date, inD)
        .input('checkOut', sql.Date, outD)
        .input('adults', sql.Int, reqRoom.adults || 1)
        .input('children', sql.Int, reqRoom.children || 0)
        .input('status', sql.NVarChar(20), 'Pending')
        .input('totalAmount', sql.Decimal(10,2), gross) // reverted: store gross
        .input('paymentStatus', sql.NVarChar(20), 'Pending');
      // Preserve OriginalAmount only for reference; user requirement: TotalAmount must be final net.
      const hasOriginal = await tableHasColumn(pool, 'dbo.Bookings', 'OriginalAmount');
      if (hasOriginal) requestBooking.input('originalAmount', sql.Decimal(10,2), gross);
      const insertSql = hasOriginal ? `INSERT INTO Bookings (UserId, HotelId, RoomTypeId, RoomId, CheckInDate, CheckOutDate, Adults, Children, Status, OriginalAmount, TotalAmount, PaymentStatus)
          OUTPUT INSERTED.Id AS Id
          VALUES (@userId, @hotelId, @roomTypeId, @roomId, @checkIn, @checkOut, @adults, @children, @status, @originalAmount, @totalAmount, @paymentStatus)`
        : `INSERT INTO Bookings (UserId, HotelId, RoomTypeId, RoomId, CheckInDate, CheckOutDate, Adults, Children, Status, TotalAmount, PaymentStatus)
          OUTPUT INSERTED.Id AS Id
          VALUES (@userId, @hotelId, @roomTypeId, @roomId, @checkIn, @checkOut, @adults, @children, @status, @totalAmount, @paymentStatus)`;
      const b = await requestBooking.query(insertSql);
      const bookingId = b.recordset[0].Id;
      // Payment row reflects deposit (20% of final payable amount)
      if (depositAmount > 0) {
        await pool.request()
          .input('bookingId', sql.Int, bookingId)
          .input('userId', sql.Int, userId)
          .input('amount', sql.Decimal(10,2), depositAmount)
          .input('method', sql.NVarChar(30), method || 'Unknown')
          .input('status', sql.NVarChar(20), 'Pending')
          .input('orderId', sql.NVarChar(50), token || null)
          .query(`IF NOT EXISTS (SELECT 1 FROM Payments WHERE OrderId = @orderId AND BookingId=@bookingId)
                  INSERT INTO Payments (BookingId, UserId, Amount, Method, Status, OrderId)
                  VALUES (@bookingId, @userId, @amount, @method, @status, @orderId)`);
      }
      created.push(bookingId);

      // Notifications
      try {
        const code = 'HMS' + String(bookingId).padStart(6, '0');
        let custName = 'Khách hàng';
        try { const u2 = await pool.request().input('uid', sql.Int, userId).query('SELECT TOP 1 Name FROM Users WHERE Id = @uid'); if (u2.recordset.length && u2.recordset[0].Name) custName = String(u2.recordset[0].Name); } catch { }
        const adminMsg = `Khách hàng \"${custName}\" đã đặt phòng ${code}, vui lòng xác nhận để hoàn tất quy trình.||bookingId=${bookingId}`;
        await insertNotificationForAdmins(pool, 'BookingPending', 'Đơn hàng mới-Cần xác nhận!', adminMsg);
      } catch (e) { /* ignore notif error */ }
      try {
        const code = 'HMS' + String(bookingId).padStart(6, '0');
        await insertNotification(pool, userId, 'BookingPending', 'Yêu cầu đặt phòng đã gửi thành công', `Bạn đã gửi yêu cầu đặt phòng ${code}. Đang chờ xác nhận thanh toán từ quản trị.`);
      } catch (e) { /* ignore user notif */ }
    }

    res.json({ ok: true, bookings: created, status: 'Pending', grossTotal, discountTotal, finalTotal: finalAllNet, depositRate, depositTotal: targetDepositTotal, promo });
  } catch (err) {
    console.error('complete payment error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lưu giao dịch' });
  }
});

// Admin confirm payment: set Payment -> Paid, Booking -> Paid/Confirmed
app.put('/api/payments/:bookingId/confirm', authorize(['Admin']), async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (!bookingId) return res.status(400).json({ message: 'Thiếu bookingId' });
  try {
    const pool = await getPool();
    const bRs = await pool.request().input('id', sql.Int, bookingId).query(`SELECT TOP 1 Id, PaymentStatus, Status, UserId, TotalAmount FROM Bookings WHERE Id=@id`);
    if (!bRs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Booking' });
    const bRow = bRs.recordset[0];
    const payStatus = String(bRow.PaymentStatus || '').toLowerCase();
    if (payStatus.includes('huy')) return res.status(400).json({ message: 'Booking đã hủy' });
    if (payStatus.includes('đã') || payStatus.includes('da') || payStatus.includes('paid')) {
      return res.json({ ok: true, message: 'Đã thanh toán trước đó', finalAmount: Number(bRow.TotalAmount || 0) });
    }
    // Do NOT change TotalAmount here; it already stores net final amount.
    await pool.request().input('id', sql.Int, bookingId)
      .query(`UPDATE Bookings SET PaymentStatus=N'Đã thanh toán', Status='Confirmed' WHERE Id=@id`);
    // Mark payments paid (keeping their recorded amounts which equal net)
    await pool.request().input('id', sql.Int, bookingId)
      .query(`UPDATE Payments SET Status='Paid' WHERE BookingId=@id`);
    let depositSum = 0;
    try {
      const sumRs = await pool.request().input('id', sql.Int, bookingId)
        .query("SELECT SUM(CAST(CASE WHEN Status <> 'Canceled' THEN Amount ELSE 0 END AS DECIMAL(18,2))) AS S FROM Payments WHERE BookingId=@id");
      depositSum = Number(sumRs.recordset?.[0]?.S || 0);
    } catch { depositSum = 0; }
    // Notify customer
    try {
      if (bRow.UserId) {
        const code = 'HMS' + String(bookingId).padStart(6, '0');
        await insertNotification(pool, bRow.UserId, 'BookingConfirmed', 'Thanh toán đã xác nhận', `Booking ${code} đã được xác nhận thanh toán.`);
      }
    } catch (e) { /* ignore notif */ }
    res.json({ ok: true, message: 'Đã xác nhận thanh toán', bookingId, finalAmount: Number(bRow.TotalAmount || 0), depositAmount: roundCurrency(depositSum) });
  } catch (e) {
    console.error('confirm payment error', e);
    res.status(500).json({ message: 'Lỗi máy chủ khi xác nhận thanh toán' });
  }
});

// User cancel pending payment: refund 85%, fee 15%
app.put('/api/payments/:bookingId/cancel', async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (!bookingId) return res.status(400).json({ message: 'Thiếu bookingId' });
  const userEmail = (req.body && req.body.email) || (req.user && req.user.email) || null;
  if (!userEmail) return res.status(401).json({ message: 'Thiếu email người dùng' });
  try {
    const pool = await getPool();
    const u = await pool.request().input('email', sql.NVarChar(100), userEmail).query('SELECT TOP 1 Id FROM Users WHERE Email=@email');
    if (!u.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const userId = u.recordset[0].Id;
    const bRs = await pool.request().input('id', sql.Int, bookingId).input('uid', sql.Int, userId).query(`
      SELECT TOP 1 Id, TotalAmount, PaymentStatus FROM Bookings WHERE Id=@id AND UserId=@uid`);
    if (!bRs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Booking cho user' });
    const bRow = bRs.recordset[0];
    const pStat = String(bRow.PaymentStatus || '').toLowerCase();
    if (pStat.includes('đã') || pStat.includes('da') || pStat.includes('paid')) return res.status(400).json({ message: 'Đã thanh toán - không thể hủy' });
    if (pStat.includes('huy')) return res.status(400).json({ message: 'Đã hủy trước đó' });
    const payRs = await pool.request().input('id', sql.Int, bookingId)
      .query("SELECT Amount, Status FROM Payments WHERE BookingId=@id");
    const depositSum = roundCurrency((payRs.recordset || []).reduce((acc, row) => {
      const status = (row.Status || '').toLowerCase();
      if (status === 'canceled') return acc;
      return acc + Number(row.Amount || 0);
    }, 0));
    const fallbackDeposit = roundCurrency(Number(bRow.TotalAmount || 0) * 0.2);
    const depositBase = depositSum > 0 ? depositSum : fallbackDeposit;
    if (!(depositBase > 0)) return res.status(400).json({ message: 'Không tìm thấy tiền cọc để hoàn' });
    const cancellationFee = roundCurrency(depositBase * 0.15);
    const refundAmount = roundCurrency(depositBase - cancellationFee);
    await pool.request().input('id', sql.Int, bookingId)
      .query("UPDATE Bookings SET PaymentStatus=N'Hủy', Status='Canceled' WHERE Id=@id");
    await pool.request().input('id', sql.Int, bookingId)
      .query("UPDATE Payments SET Status='Canceled' WHERE BookingId=@id");
    if (refundAmount > 0) {
      const existRefund = await pool.request().input('id', sql.Int, bookingId)
        .query("SELECT TOP 1 Id FROM Payments WHERE BookingId=@id AND Status LIKE 'Refunded%'");
      if (!existRefund.recordset.length) {
        await pool.request()
          .input('bookingId', sql.Int, bookingId)
          .input('userId', sql.Int, userId)
          .input('amount', sql.Decimal(10, 2), refundAmount)
          .input('method', sql.NVarChar(30), 'UserRefund')
          .input('status', sql.NVarChar(20), 'RefundedUser')
          .input('orderId', sql.NVarChar(50), `REF-USER-${bookingId}-${Date.now()}`)
          .query(`INSERT INTO Payments (BookingId, UserId, Amount, Method, Status, OrderId)
                  VALUES (@bookingId, @userId, @amount, @method, @status, @orderId)`);
      }
    }
    res.json({ ok: true, bookingId, refundAmount, cancellationFee, depositAmount: depositBase, message: 'Đã hủy - hoàn 85% tiền cọc', refundStatus: 'RefundedUser' });
  } catch (e) {
    console.error('cancel payment error', e);
    res.status(500).json({ message: 'Lỗi máy chủ khi hủy thanh toán' });
  }
});

// Admin cancel booking (100% refund) when still pending/confirmed but not paid
app.put('/api/payments/:bookingId/admin-cancel', authorize(['Admin']), async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (!bookingId) return res.status(400).json({ message: 'Thiếu bookingId' });
  try {
    const pool = await getPool();
    const rs = await pool.request().input('id', sql.Int, bookingId)
      .query('SELECT TOP 1 Id, UserId, TotalAmount, PaymentStatus, Status FROM Bookings WHERE Id=@id');
    if (!rs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Booking' });
    const row = rs.recordset[0];
    const payStat = String(row.PaymentStatus || '').toLowerCase();
    if (payStat.includes('đã') || payStat.includes('da') || payStat.includes('paid')) {
      return res.status(400).json({ message: 'Booking đã thanh toán - không thể hủy admin-cancel kiểu hoàn 100%' });
    }
    if (payStat.includes('huy')) return res.status(400).json({ message: 'Đã hủy trước đó' });
    const payRs = await pool.request().input('id', sql.Int, bookingId)
      .query("SELECT Amount, Status FROM Payments WHERE BookingId=@id");
    const depositSum = roundCurrency((payRs.recordset || []).reduce((acc, row) => {
      const status = (row.Status || '').toLowerCase();
      if (status === 'canceled') return acc;
      return acc + Number(row.Amount || 0);
    }, 0));
    const fallbackDeposit = roundCurrency(Number(row.TotalAmount || 0) * 0.2);
    const refundAmount = depositSum > 0 ? depositSum : fallbackDeposit;
    // Update booking + payment (100% refund conceptually -> just set canceled)
    await pool.request().input('id', sql.Int, bookingId)
      .query("UPDATE Bookings SET Status = 'Canceled', PaymentStatus = N'Hủy', UpdatedAt = SYSDATETIME() WHERE Id = @id");
    await pool.request().input('id', sql.Int, bookingId)
      .query("UPDATE Payments SET Status='Canceled' WHERE BookingId=@id");
    if (refundAmount > 0 && row.UserId) {
      const existRefund = await pool.request().input('id', sql.Int, bookingId)
        .query("SELECT TOP 1 Id FROM Payments WHERE BookingId=@id AND Status LIKE 'Refunded%'");
      if (!existRefund.recordset.length) {
        await pool.request()
          .input('bookingId', sql.Int, bookingId)
          .input('userId', sql.Int, row.UserId)
          .input('amount', sql.Decimal(10, 2), refundAmount)
          .input('method', sql.NVarChar(30), 'AdminRefund')
          .input('status', sql.NVarChar(20), 'RefundedAdmin')
          .input('orderId', sql.NVarChar(50), `REF-ADMIN-${bookingId}-${Date.now()}`)
          .query(`INSERT INTO Payments (BookingId, UserId, Amount, Method, Status, OrderId)
                  VALUES (@bookingId, @userId, @amount, @method, @status, @orderId)`);
      }
    }
    // Notify customer
    try {
      if (row.UserId) {
        const code = 'HMS' + String(bookingId).padStart(6, '0');
        await insertNotification(pool, row.UserId, 'BookingCancelled', 'Đơn đặt phòng đã bị hủy', `Booking ${code} đã bị quản trị hủy. Bạn sẽ được hoàn 100% số tiền đã thanh toán (nếu có).`);
      }
    } catch (e) { console.warn('notify customer admin cancel warn', e.message); }
    res.json({ ok: true, message: 'Đã hủy và hoàn 100% tiền cọc', refundAmount, depositAmount: refundAmount, cancellationFee: 0, refundStatus: 'RefundedAdmin' });
  } catch (e) {
    console.error('admin cancel booking error', e);
    res.status(500).json({ message: 'Lỗi máy chủ khi admin hủy booking' });
  }
});

// ===== Notifications APIs =====
// Get recent notifications for current user (requires x-user-email header)
app.get('/api/notifications', async (req, res) => {
  const email = (req.headers['x-user-email'] || '').toString().trim();
  if (!email) return res.status(401).json({ message: 'Thiếu email' });
  try {
    const pool = await getPool();
    const userId = await getUserIdByEmail(email);
    if (!userId) return res.status(404).json({ message: 'Không tìm thấy user' });
    const unreadOnly = (req.query.unreadOnly === '1' || req.query.unreadOnly === 'true');
    const top = Math.min(100, Number(req.query.top || 20));
    const rs = await pool.request()
      .input('uid', sql.Int, userId)
      .query(`SELECT TOP ${top} Id, Title, Message, Type, SentAt, IsRead FROM Notifications WHERE UserId=@uid ${unreadOnly ? 'AND IsRead=0' : ''} ORDER BY SentAt DESC, Id DESC`);
    res.json({
      items: rs.recordset.map(r => ({
        id: r.Id,
        title: r.Title,
        message: r.Message,
        type: r.Type,
        sentAt: r.SentAt,
        isRead: !!r.IsRead
      }))
    });
  } catch (e) {
    console.error('list notifications error', e); res.status(500).json({ message: 'Lỗi lấy thông báo' });
  }
});

app.get('/api/notifications/unread-count', async (req, res) => {
  const email = (req.headers['x-user-email'] || '').toString().trim();
  if (!email) return res.status(401).json({ message: 'Thiếu email' });
  try {
    const pool = await getPool();
    const userId = await getUserIdByEmail(email);
    if (!userId) return res.status(404).json({ message: 'Không tìm thấy user' });
    const rs = await pool.request().input('uid', sql.Int, userId)
      .query('SELECT COUNT(1) AS C FROM Notifications WHERE UserId=@uid AND IsRead=0');
    const count = rs.recordset.length ? rs.recordset[0].C : 0;
    res.json({ count });
  } catch (e) { console.error('unread count error', e); res.status(500).json({ message: 'Lỗi lấy số thông báo' }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  const email = (req.headers['x-user-email'] || '').toString().trim();
  if (!email) return res.status(401).json({ message: 'Thiếu email' });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu id' });
  try {
    const pool = await getPool();
    const userId = await getUserIdByEmail(email);
    if (!userId) return res.status(404).json({ message: 'Không tìm thấy user' });
    await pool.request().input('id', sql.Int, id).input('uid', sql.Int, userId)
      .query('UPDATE Notifications SET IsRead=1 WHERE Id=@id AND UserId=@uid');
    res.json({ ok: true });
  } catch (e) { console.error('mark read error', e); res.status(500).json({ message: 'Lỗi cập nhật' }); }
});

app.put('/api/notifications/read-all', async (req, res) => {
  const email = (req.headers['x-user-email'] || '').toString().trim();
  if (!email) return res.status(401).json({ message: 'Thiếu email' });
  try {
    const pool = await getPool();
    const userId = await getUserIdByEmail(email);
    if (!userId) return res.status(404).json({ message: 'Không tìm thấy user' });
    await pool.request().input('uid', sql.Int, userId)
      .query('UPDATE Notifications SET IsRead=1 WHERE UserId=@uid AND IsRead=0');
    res.json({ ok: true });
  } catch (e) {
    console.error('mark all read error', e); res.status(500).json({ message: 'Lỗi cập nhật' });
  }
});

// Permanent delete a single notification (user-owned)
app.delete('/api/notifications/:id', async (req, res) => {
  const email = (req.headers['x-user-email'] || '').toString().trim();
  if (!email) return res.status(401).json({ message: 'Thiếu email' });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu id' });
  try {
    const pool = await getPool();
    const userId = await getUserIdByEmail(email);
    if (!userId) return res.status(404).json({ message: 'Không tìm thấy user' });
    const rs = await pool.request().input('id', sql.Int, id).input('uid', sql.Int, userId)
      .query('DELETE FROM Notifications WHERE Id=@id AND UserId=@uid; SELECT @@ROWCOUNT AS Affected;');
    if (!rs.recordset.length || !rs.recordset[0].Affected) return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    res.json({ ok: true, id });
  } catch (e) {
    console.error('delete notification error', e); res.status(500).json({ message: 'Lỗi xóa thông báo' });
  }
});
// Removed: staff cash booking endpoint

// Removed: admin notifications APIs

// Removed: admin confirm-cash endpoint

// ===== Staff Support: tickets and messages =====
// List tickets
app.get('/api/staff/support/tickets', authorize(['Staff']), async (req, res) => {
  const status = (req.query.status || '').trim();
  const q = (req.query.q || '').trim();
  try {
    const pool = await getPool();
    const r = pool.request();
    let where = '1=1';
    if (status) { where += ' AND (t.Status = @st)'; r.input('st', sql.NVarChar(20), status); }
    if (q) { where += ' AND (u.Name LIKE @q OR u.Email LIKE @q OR t.Subject LIKE @q)'; r.input('q', sql.NVarChar(200), `%${q}%`); }
    const rs = await r.query(`
      SELECT TOP 200 t.Id, t.Subject, t.Status, t.Priority, t.CreatedAt, t.UpdatedAt,
             u.Name AS CustomerName, u.Email AS CustomerEmail
      FROM SupportTickets t
      LEFT JOIN Users u ON u.Id = t.UserId
      WHERE ${where}
      ORDER BY t.UpdatedAt DESC, t.Id DESC`);
    res.json({
      items: rs.recordset.map(x => ({
        id: x.Id,
        subject: x.Subject || `Ticket #${x.Id}`,
        status: x.Status || 'Open',
        priority: x.Priority || null,
        createdAt: x.CreatedAt,
        updatedAt: x.UpdatedAt,
        customerName: x.CustomerName || null,
        customerEmail: x.CustomerEmail || null,
      }))
    });
  } catch (err) {
    console.error('support list error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy yêu cầu hỗ trợ' });
  }
});

// Check availability for a single room between given dates
app.get('/api/rooms/:id/availability', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu room id' });
  const checkIn = (req.query.checkIn || '').toString().trim(); // expected YYYY-MM-DD
  const checkOut = (req.query.checkOut || '').toString().trim();
  if (!checkIn || !checkOut) return res.status(400).json({ message: 'Thiếu checkIn hoặc checkOut' });
  try {
    const pool = await getPool();
    // Normalize dates to date-only (no time) for comparison
    const ci = checkIn; const co = checkOut;
    // Overlap logic: an existing booking overlaps if NOT (existing.CheckOutDate <= ci OR existing.CheckInDate >= co)
    // We'll consider bookings with Status != 'Canceled' as blocking (Pending, Confirmed, etc.)
    const rs = await pool.request()
      .input('rid', sql.Int, id)
      .input('ci', sql.Date, ci)
      .input('co', sql.Date, co)
      .query(`SELECT Id, CheckInDate, CheckOutDate, Status, PaymentStatus FROM Bookings WHERE RoomId=@rid AND (Status IS NULL OR Status <> 'Canceled') AND NOT (CheckOutDate <= @ci OR CheckInDate >= @co)`);
    const conflicts = rs.recordset || [];
    const available = (conflicts.length === 0);
    res.json({ available, conflicts: conflicts.map(c => ({ id: c.Id, checkIn: c.CheckInDate, checkOut: c.CheckOutDate, status: c.Status, paymentStatus: c.PaymentStatus })) });
  } catch (err) {
    console.error('availability check error', err);
    res.status(500).json({ message: 'Lỗi kiểm tra availability' });
  }
});

// Availability for all rooms (or filtered by hotel) for a given date range
app.get('/api/rooms/availability', async (req, res) => {
  const checkIn = (req.query.checkIn || '').toString().trim();
  const checkOut = (req.query.checkOut || '').toString().trim();
  try {
    const pool = await getPool();
    // default to today -> tomorrow when not provided
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const ci = checkIn || todayStr;
    const co = checkOut || tomorrowStr;
    // Optional hotel filter
    const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
    // Find conflicting booked RoomIds for the period
    const conflictedRs = await pool.request().input('ci', sql.Date, ci).input('co', sql.Date, co)
      .query(`SELECT DISTINCT RoomId FROM Bookings WHERE (Status IS NULL OR Status <> 'Canceled') AND NOT (CheckOutDate <= @ci OR CheckInDate >= @co)`);
    const conflicted = (conflictedRs.recordset || []).map(r => Number(r.RoomId));
    // Fetch rooms (optionally by hotel) and map availability
    let roomsQuery = 'SELECT Id FROM Rooms';
    if (hotelId) roomsQuery += ' WHERE HotelId = ' + hotelId;
    const roomsRs = await pool.request().query(roomsQuery);
    const rows = roomsRs.recordset || [];
    const items = rows.map(r => ({ roomId: Number(r.Id), available: !conflicted.includes(Number(r.Id)) }));
    res.json({ checkIn: ci, checkOut: co, items });
  } catch (err) {
    console.error('rooms availability error', err);
    res.status(500).json({ message: 'Lỗi kiểm tra availability cho tất cả phòng' });
  }
});

// Ticket details + messages
app.get('/api/staff/support/tickets/:id', authorize(['Staff']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    const head = await pool.request().input('id', sql.Int, id).query(`
      SELECT TOP 1 t.Id, t.Subject, t.Status, t.Priority, t.CreatedAt, t.UpdatedAt,
             u.Id AS CustomerId, u.Name AS CustomerName, u.Email AS CustomerEmail
      FROM SupportTickets t
      LEFT JOIN Users u ON u.Id = t.UserId
      WHERE t.Id = @id`);
    if (!head.recordset.length) return res.status(404).json({ message: 'Không tìm thấy ticket' });
    const tk = head.recordset[0];
    const msgs = await pool.request().input('id', sql.Int, id).query(`
      SELECT m.Id, m.SenderUserId, m.SenderRole, m.Body, m.CreatedAt,
             u.Name AS SenderName, u.Email AS SenderEmail
      FROM SupportMessages m
      LEFT JOIN Users u ON u.Id = m.SenderUserId
      WHERE m.TicketId = @id
      ORDER BY m.CreatedAt ASC, m.Id ASC`);
    res.json({
      ticket: {
        id: tk.Id,
        subject: tk.Subject || `Ticket #${tk.Id}`,
        status: tk.Status || 'Open',
        priority: tk.Priority || null,
        createdAt: tk.CreatedAt,
        updatedAt: tk.UpdatedAt,
        customer: { id: tk.CustomerId || null, name: tk.CustomerName || null, email: tk.CustomerEmail || null }
      },
      messages: msgs.recordset.map(m => ({
        id: m.Id,
        role: m.SenderRole || (m.SenderEmail ? 'Customer' : 'Staff'),
        senderName: m.SenderName || null,
        senderEmail: m.SenderEmail || null,
        body: m.Body,
        createdAt: m.CreatedAt,
      }))
    });
  } catch (err) {
    console.error('support detail error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy chi tiết hỗ trợ' });
  }
});

// Reply to a ticket as staff
app.post('/api/staff/support/tickets/:id/reply', authorize(['Staff']), async (req, res) => {
  const id = Number(req.params.id);
  const body = (req.body && req.body.body) ? String(req.body.body).trim() : '';
  if (!id || !body) return res.status(400).json({ message: 'Thiếu nội dung' });
  try {
    const pool = await getPool();
    const email = (req.user && req.user.email) ? String(req.user.email).trim() : '';
    const u = await pool.request().input('email', sql.NVarChar(100), email)
      .query('SELECT TOP 1 Id FROM Users WHERE Email = @email');
    const staffId = u.recordset.length ? u.recordset[0].Id : null;
    await pool.request()
      .input('tid', sql.Int, id)
      .input('uid', sql.Int, staffId)
      .input('role', sql.NVarChar(20), 'Staff')
      .input('body', sql.NVarChar(sql.MAX), body)
      .query('INSERT INTO SupportMessages (TicketId, SenderUserId, SenderRole, Body) VALUES (@tid, @uid, @role, @body)');
    await pool.request().input('id', sql.Int, id).query('UPDATE SupportTickets SET UpdatedAt = SYSDATETIME() WHERE Id = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error('support reply error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi gửi trả lời' });
  }
});

// Resolve/close a ticket
app.post('/api/staff/support/tickets/:id/resolve', authorize(['Staff']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).query("UPDATE SupportTickets SET Status = N'Closed', UpdatedAt = SYSDATETIME() WHERE Id = @id");
    res.json({ ok: true });
  } catch (err) {
    console.error('support resolve error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi đóng ticket' });
  }
});

// Create or update a review for a booking
app.post('/api/reviews', async (req, res) => {
  const { email, bookingId, rating, comment } = req.body || {};
  if (!email || !bookingId || !rating) {
    return res.status(400).json({ message: 'Thiếu thông tin đánh giá' });
  }
  try {
    const pool = await getPool();
    const u = await pool.request().input('email', sql.NVarChar(100), email)
      .query('SELECT TOP 1 Id FROM Users WHERE Email = @email');
    if (!u.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const userId = u.recordset[0].Id;

    // Ensure the booking belongs to this user
    const b = await pool.request().input('bid', sql.Int, Number(bookingId)).input('uid', sql.Int, userId)
      .query('SELECT TOP 1 Id FROM Bookings WHERE Id = @bid AND UserId = @uid');
    if (!b.recordset.length) return res.status(404).json({ message: 'Không tìm thấy đặt phòng phù hợp' });

    // Store rating as half-star integer (1..10)
    let rHalf = Math.round(Number(rating) * 2);
    if (!isFinite(rHalf)) rHalf = 1;
    rHalf = Math.max(1, Math.min(10, rHalf));

    // Upsert: if a review exists for this booking+user, update; else insert
    const exist = await pool.request().input('bid', sql.Int, Number(bookingId)).input('uid', sql.Int, userId)
      .query('SELECT TOP 1 Id FROM Reviews WHERE BookingId = @bid AND UserId = @uid');

    if (exist.recordset.length) {
      const rid = exist.recordset[0].Id;
      await pool.request()
        .input('rid', sql.Int, rid)
        .input('rating', sql.Int, rHalf)
        .input('comment', sql.NVarChar(sql.MAX), comment || null)
        .query('UPDATE Reviews SET Rating = @rating, Comment = @comment WHERE Id = @rid');
      return res.json({ ok: true, updated: true });
    }

    await pool.request()
      .input('bid', sql.Int, Number(bookingId))
      .input('uid', sql.Int, userId)
      .input('rating', sql.Int, rHalf)
      .input('comment', sql.NVarChar(sql.MAX), comment || null)
      .query('INSERT INTO Reviews (BookingId, UserId, Rating, Comment) VALUES (@bid, @uid, @rating, @comment)');
    res.json({ ok: true, created: true });
  } catch (err) {
    console.error('create review error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lưu đánh giá' });
  }
});

// Get existing review for a booking by user
app.get('/api/reviews', async (req, res) => {
  const email = (req.query.email || '').trim();
  const bookingId = req.query.bookingId ? Number(req.query.bookingId) : null;
  if (!email) return res.status(400).json({ message: 'Thiếu tham số' });
  try {
    const pool = await getPool();
    const u = await pool.request().input('email', sql.NVarChar(100), email)
      .query('SELECT TOP 1 Id FROM Users WHERE Email = @email');
    if (!u.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const userId = u.recordset[0].Id;

    if (bookingId) {
      const rs = await pool.request().input('bid', sql.Int, bookingId).input('uid', sql.Int, userId)
        .query('SELECT TOP 1 Id, Rating, Comment, CreatedAt FROM Reviews WHERE BookingId = @bid AND UserId = @uid ORDER BY Id DESC');
      if (!rs.recordset.length) return res.json({ review: null });
      const r = rs.recordset[0];
      return res.json({ review: { id: r.Id, rating: (Number(r.Rating) || 0) / 2, comment: r.Comment || '', createdAt: r.CreatedAt } });
    } else {
      // List all reviews for this user, joined with booking/hotel/room
      const rs = await pool.request().input('uid', sql.Int, userId)
        .query(`
          SELECT r.Id, r.Rating, r.Comment, r.CreatedAt,
                 b.Id AS BookingId, b.CheckInDate, b.CheckOutDate,
                 h.Name AS HotelName, ro.RoomNumber AS RoomName
          FROM Reviews r
          INNER JOIN Bookings b ON b.Id = r.BookingId
          INNER JOIN Hotels h ON h.Id = b.HotelId
          LEFT JOIN Rooms ro ON ro.Id = b.RoomId
          WHERE r.UserId = @uid
          ORDER BY r.CreatedAt DESC
        `);
      const reviews = rs.recordset.map(r => ({
        id: r.Id,
        rating: (Number(r.Rating) || 0) / 2,
        comment: r.Comment || '',
        createdAt: r.CreatedAt,
        bookingId: r.BookingId,
        checkIn: r.CheckInDate,
        checkOut: r.CheckOutDate,
        hotelName: r.HotelName,
        roomName: r.RoomName
      }));
      return res.json({ reviews });
    }
  } catch (err) {
    console.error('get review error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy đánh giá' });
  }
});

// Public: list reviews by room or room type (no login required)
app.get('/api/public-reviews', async (req, res) => {
  const roomId = req.query.roomId ? Number(req.query.roomId) : null;
  const roomTypeName = (req.query.roomType || '').trim();
  if (!roomId && !roomTypeName) return res.status(400).json({ message: 'Thiếu tham số phòng' });
  try {
    const pool = await getPool();
    let where = '';
    const r = pool.request();
    if (roomId) {
      where = 'b.RoomId = @rid';
      r.input('rid', sql.Int, roomId);
    } else {
      // Find room type by name (case/diacritic insensitive)
      const rt = await pool.request().input('name', sql.NVarChar(60), roomTypeName).query(`
        SELECT TOP 1 Id FROM Room_Types WHERE RTRIM(LTRIM(Name)) COLLATE Vietnamese_CI_AI = RTRIM(LTRIM(@name)) COLLATE Vietnamese_CI_AI
      `);
      if (!rt.recordset.length) return res.json({ reviews: [], avgRating: 0 });
      where = 'b.RoomTypeId = @rtid';
      r.input('rtid', sql.Int, rt.recordset[0].Id);
    }

    const sqlText = `
      SELECT r.Id, r.Rating, r.Comment, r.CreatedAt,
             b.Id AS BookingId,
             h.Name AS HotelName,
             ro.RoomNumber AS RoomName,
             rt.Name AS RoomType,
             COALESCE(
               NULLIF(u.Name, ''),
               CASE WHEN CHARINDEX('@', u.Email) > 1 THEN LEFT(u.Email, CHARINDEX('@', u.Email) - 1) ELSE u.Email END
             ) AS UserDisplay
      FROM Reviews r
      INNER JOIN Bookings b ON b.Id = r.BookingId
      INNER JOIN Users u ON u.Id = r.UserId
      INNER JOIN Hotels h ON h.Id = b.HotelId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      LEFT JOIN Room_Types rt ON rt.Id = b.RoomTypeId
      WHERE ${where}
      ORDER BY r.CreatedAt DESC`;
    const rs = await r.query(sqlText);
    const reviews = rs.recordset.map(x => ({
      id: x.Id,
      rating: (Number(x.Rating) || 0) / 2,
      comment: x.Comment || '',
      createdAt: x.CreatedAt,
      bookingId: x.BookingId,
      hotelName: x.HotelName,
      roomName: x.RoomName,
      roomType: x.RoomType,
      user: x.UserDisplay || 'Khách'
    }));
    const avgRating = reviews.length ? (reviews.reduce((s, v) => s + (v.rating || 0), 0) / reviews.length) : 0;
    res.json({ reviews, avgRating });
  } catch (err) {
    console.error('public reviews error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy đánh giá phòng' });
  }
});

// ===== Admin: Reviews (Feedback) Management =====
// List all reviews with reply status; q=search text; status=replied|unreplied|all
app.get('/api/admin/reviews', authorize(['Admin']), async (req, res) => {
  const q = (req.query.q || '').trim();
  const status = (req.query.status || 'all').toLowerCase();
  try {
    const pool = await getPool();
    const r = pool.request();
    let whereQ = '';
    if (q) {
      r.input('q', sql.NVarChar(300), `%${q}%`);
      whereQ = ` AND (
        u.Name LIKE @q OR u.Email LIKE @q OR
        h.Name LIKE @q OR ro.RoomNumber LIKE @q OR
        r.Comment LIKE @q
      )`;
    }
    let statusHaving = '';
    if (status === 'replied') statusHaving = ' AND rep.RepliedAt IS NOT NULL';
    if (status === 'unreplied') statusHaving = ' AND rep.RepliedAt IS NULL';

    const sqlText = `
      SELECT TOP 500 r.Id AS ReviewId, r.Rating, r.Comment, r.CreatedAt,
             u.Name AS CustomerName, u.Email AS CustomerEmail,
             b.Id AS BookingId, h.Name AS HotelName, ro.RoomNumber AS RoomName,
             rep.RepliedAt
      FROM Reviews r
      INNER JOIN Bookings b ON b.Id = r.BookingId
      INNER JOIN Users u ON u.Id = r.UserId
      INNER JOIN Hotels h ON h.Id = b.HotelId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      OUTER APPLY (
        SELECT TOP 1 rr.CreatedAt AS RepliedAt
        FROM ReviewReplies rr
        WHERE rr.ReviewId = r.Id
        ORDER BY rr.Id DESC
      ) rep
      WHERE 1=1 ${whereQ} ${statusHaving}
      ORDER BY r.CreatedAt DESC`;
    const rs = await r.query(sqlText);
    const rows = rs.recordset.map(x => ({
      reviewId: x.ReviewId,
      code: 'PH' + String(x.ReviewId).padStart(3, '0'),
      customerName: x.CustomerName || x.CustomerEmail,
      customerEmail: x.CustomerEmail,
      content: x.Comment || '',
      rating: (Number(x.Rating) || 0) / 2,
      reviewDate: x.CreatedAt,
      replyDate: x.RepliedAt || null,
      status: x.RepliedAt ? 'replied' : 'unreplied',
      bookingId: x.BookingId,
      hotelName: x.HotelName,
      roomName: x.RoomName,
    }));
    res.json({ items: rows });
  } catch (err) {
    console.error('admin reviews list error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tải phản hồi' });
  }
});

// Get detail of a specific review, include reply history
app.get('/api/admin/reviews/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT TOP 1 r.Id AS ReviewId, r.Rating, r.Comment, r.CreatedAt,
             u.Name AS CustomerName, u.Email AS CustomerEmail,
             b.Id AS BookingId, b.CheckInDate, b.CheckOutDate,
             h.Name AS HotelName, ro.RoomNumber AS RoomName
      FROM Reviews r
      INNER JOIN Bookings b ON b.Id = r.BookingId
      INNER JOIN Users u ON u.Id = r.UserId
      INNER JOIN Hotels h ON h.Id = b.HotelId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      WHERE r.Id = @id
    `);
    if (!rs.recordset.length) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
    const row = rs.recordset[0];
    const replies = await pool.request().input('rid', sql.Int, id).query(`
      SELECT rr.Id, rr.Reply, rr.CreatedAt,
             au.Name AS AdminName, au.Email AS AdminEmail
      FROM ReviewReplies rr
      LEFT JOIN Users au ON au.Id = rr.AdminUserId
      WHERE rr.ReviewId = @rid
      ORDER BY rr.Id DESC
    `);
    res.json({
      review: {
        id: row.ReviewId,
        rating: (Number(row.Rating) || 0) / 2,
        comment: row.Comment || '',
        createdAt: row.CreatedAt,
        customerName: row.CustomerName || row.CustomerEmail,
        customerEmail: row.CustomerEmail,
        bookingId: row.BookingId,
        checkIn: row.CheckInDate,
        checkOut: row.CheckOutDate,
        hotelName: row.HotelName,
        roomName: row.RoomName,
      },
      replies: replies.recordset.map(r => ({ id: r.Id, body: r.Reply || '', createdAt: r.CreatedAt, adminName: r.AdminName || r.AdminEmail }))
    });
  } catch (err) {
    console.error('admin reviews detail error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy chi tiết phản hồi' });
  }
});

// Post an admin reply to a review
app.post('/api/admin/reviews/:id/reply', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  const { body } = req.body || {};
  if (!id || !body) return res.status(400).json({ message: 'Thiếu nội dung phản hồi' });
  try {
    const email = String(req.headers['x-user-email'] || '').trim();
    const pool = await getPool();
    let adminUserId = null;
    if (email) {
      const u = await pool.request().input('email', sql.NVarChar(100), email).query('SELECT TOP 1 Id FROM Users WHERE Email = @email');
      adminUserId = u.recordset.length ? u.recordset[0].Id : null;
    }
    await pool.request()
      .input('rid', sql.Int, id)
      .input('auid', sql.Int, adminUserId)
      .input('reply', sql.NVarChar(sql.MAX), body)
      .query('INSERT INTO ReviewReplies (ReviewId, AdminUserId, Reply) VALUES (@rid, @auid, @reply)');
    res.json({ ok: true });
  } catch (err) {
    console.error('admin reviews reply error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi gửi phản hồi' });
  }
});

// ===== Admin: Bookings Management =====
// Map database payment/status combos into UI keys
function normalizeForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapBookingStatus(row) {
  const psRaw = String(row.PaymentStatus || '');
  const bsRaw = String(row.Status || '');
  const ps = psRaw.toLowerCase();
  const bs = bsRaw.toLowerCase();
  const psAscii = normalizeForCompare(psRaw);
  const bsAscii = normalizeForCompare(bsRaw);
  // NEW LOGIC:
  // 1. Cancellation has highest priority
  if (
    ps.includes('hủy') || ps.includes('huy') ||
    bs.includes('hủy') || bs.includes('huy') ||
    psAscii.includes('huy') ||
    bsAscii.includes('huy') ||
    bsAscii.includes('cancel')
  ) {
    return 'canceled';
  }
  // 2. Explicit pending indicators
  if (ps.includes('chờ') || ps.includes('cho') || ps.includes('pending')) return 'pending';
  // 3. If booking status shows confirmed/booked but payment not yet marked paid -> 'confirmed'
  if (bs.includes('xác nhận') || bs.includes('xac nhan') || bs === 'confirmed' || bs === 'booked') {
    // If payment also shows paid wording but booking not moved to a post-payment terminal, still treat as confirmed first
    if (ps.includes('đã') || ps.includes('da') || ps.includes('paid')) {
      // Only escalate to success if booking status is already progressed beyond confirmed (e.g., checked-in/completed)
      const progressed = /checked|check|complete|success/.test(bs);
      return progressed ? 'success' : 'confirmed';
    }
    return 'confirmed';
  }
  // 4. Pure payment paid but booking status not updated -> treat as confirmed (avoid premature success)
  if (ps.includes('đã') || ps.includes('da') || ps.includes('paid')) return 'confirmed';
  // 5. Fallback pending
  return 'pending';
}

// GET /api/admin/bookings?q=...&status=(success|confirmed|pending|canceled)
app.get('/api/admin/bookings', authorize(['Admin']), async (req, res) => {
  const q = (req.query.q || '').trim();
  const status = (req.query.status || '').trim().toLowerCase();
  try {
    const pool = await getPool();
    const r = pool.request();
    const hasUserPhone = await tableHasColumn(pool, 'dbo.Users', 'Phone');
    const hasRoomNumber = await tableHasColumn(pool, 'dbo.Rooms', 'RoomNumber');
    let whereQ = '';
    if (q) {
      r.input('q', sql.NVarChar(200), `%${q}%`);
      whereQ = ` AND (
        u.Name LIKE @q OR u.Email LIKE @q OR u.Phone LIKE @q OR
        h.Name LIKE @q OR rt.Name LIKE @q OR ro.RoomNumber LIKE @q OR
        CAST(b.Id AS NVARCHAR(20)) LIKE @q OR
        ('BK' + RIGHT('000000' + CAST(b.Id AS NVARCHAR(6)), 6)) LIKE @q
      )`;
    }

    const rs = await r.query(`
      SELECT TOP 500
        b.Id AS BookingId,
        b.Status,
        b.PaymentStatus,
        'BK' + RIGHT('000000' + CAST(b.Id AS NVARCHAR(6)), 6) AS Code,
        u.Name AS CustomerName, u.Email AS CustomerEmail, ${hasUserPhone ? 'u.Phone' : "NULL"} AS CustomerPhone,
        h.Name AS HotelName,
        ${hasRoomNumber ? 'ro.RoomNumber' : "NULL"} AS RoomName,
        rt.Name AS RoomType,
        b.CheckInDate, b.CheckOutDate,
        DATEDIFF(day, b.CheckInDate, b.CheckOutDate) AS Nights,
        CONCAT(b.Adults, ' NL', CASE WHEN b.Children IS NULL OR b.Children=0 THEN '' ELSE ' + ' + CAST(b.Children AS NVARCHAR(10)) + ' TE' END) AS Guests,
        b.TotalAmount,
        p.Method
      FROM Bookings b
      INNER JOIN Users u ON u.Id = b.UserId
      INNER JOIN Hotels h ON h.Id = b.HotelId
      INNER JOIN Room_Types rt ON rt.Id = b.RoomTypeId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      OUTER APPLY (
        SELECT TOP 1 Method FROM Payments p WHERE p.BookingId = b.Id ORDER BY CreatedAt DESC
      ) p
      WHERE 1=1 ${whereQ}
        AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')
      ORDER BY b.CreatedAt DESC`);

    let items = rs.recordset.map(rw => ({
      bookingId: rw.BookingId,
      code: rw.Code,
      customerName: rw.CustomerName,
      customerEmail: rw.CustomerEmail,
      customerPhone: rw.CustomerPhone,
      hotelName: rw.HotelName,
      roomName: rw.RoomName,
      roomType: rw.RoomType,
      checkIn: rw.CheckInDate,
      checkOut: rw.CheckOutDate,
      nights: rw.Nights,
      guests: rw.Guests,
      total: rw.TotalAmount,
      method: rw.Method || null,
      statusKey: mapBookingStatus(rw)
    }));

    if (status) {
      items = items.filter(x => x.statusKey === status);
    }

    res.json({ items });
  } catch (err) {
    console.error('admin bookings list error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách đặt phòng' });
  }
});

// ===== Admin: Check-in / Check-out =====
// GET /api/admin/checkinout?date=YYYY-MM-DD&q=
app.get('/api/admin/checkinout', authorize(['Staff']), async (req, res) => {
  const dateStr = (req.query.date || '').trim();
  const q = (req.query.q || '').trim();
  let date = null;
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d)) date = d;
  }
  try {
    const pool = await getPool();
    const r = pool.request();
    const hasUserPhone = await tableHasColumn(pool, 'dbo.Users', 'Phone');
    const hasRoomNumber = await tableHasColumn(pool, 'dbo.Rooms', 'RoomNumber');
    let where = '1=1';
    if (date) {
      r.input('d', sql.Date, date);
      where += ' AND (CAST(b.CheckInDate AS DATE) <= @d AND CAST(b.CheckOutDate AS DATE) >= @d)';
    }
    if (q) {
      r.input('q', sql.NVarChar(200), `%${q}%`);
      where += ` AND (
        (u.Name COLLATE Vietnamese_CI_AI LIKE @q) OR
        ${hasUserPhone ? '(u.Phone LIKE @q) OR' : ''} (u.Email LIKE @q) OR
        (CAST(b.Id AS NVARCHAR(20)) LIKE @q) OR
        (RIGHT('000000' + CAST(b.Id AS NVARCHAR(6)), 6) LIKE @q) OR
        (('BK' + RIGHT('000000' + CAST(b.Id AS NVARCHAR(6)), 6)) LIKE @q) OR
        ${hasRoomNumber ? '(ro.RoomNumber LIKE @q) OR' : ''} (rt.Name COLLATE Vietnamese_CI_AI LIKE @q)
      )`;
    }
    const rs = await r.query(`
      SELECT b.Id AS BookingId,
             'BK' + RIGHT('000000' + CAST(b.Id AS NVARCHAR(6)), 6) AS Code,
             u.Name AS CustomerName,
             ${hasUserPhone ? 'u.Phone' : "NULL"} AS Phone,
             ${hasRoomNumber ? 'ro.RoomNumber' : "NULL"} AS RoomNumber,
             rt.Name AS RoomType,
             b.CheckInDate, b.CheckOutDate,
             b.Status,
             b.PaymentStatus
      FROM Bookings b
      INNER JOIN Users u ON u.Id = b.UserId
      INNER JOIN Room_Types rt ON rt.Id = b.RoomTypeId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      WHERE ${where}
        AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')
      ORDER BY b.CheckInDate ASC, b.Id ASC`);
    const itemsRaw = rs.recordset;
    const today = date ? new Date(date) : new Date();
    const isSameDate = (a, b) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
    let stToday = { checkin: 0, checkout: 0, stay: 0 };
    const items = itemsRaw.map(rw => {
      const st = String(rw.Status || '').toLowerCase();
      const cin = rw.CheckInDate ? new Date(rw.CheckInDate) : null;
      const cout = rw.CheckOutDate ? new Date(rw.CheckOutDate) : null;
      // Count stats if date provided (or today by default)
      if (cin && isSameDate(new Date(cin), today)) stToday.checkin += 1;
      if (cout && isSameDate(new Date(cout), today)) stToday.checkout += 1;
      if (cin && cout && (today >= new Date(cin)) && (today < new Date(cout))) stToday.stay += 1;
      // Determine ui state
      // Robust mapping: handle hyphen/space/diacritics and Vietnamese keywords
      const stNorm = st.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isCompleted = /complet(ed)?/.test(stNorm);
      const isCheckOut = /\bcheck(?:ed)?[\s_-]*out\b/.test(stNorm) || /tra\s*-?\s*phong/.test(stNorm) || /tra phong/.test(stNorm);
      const isCheckIn = /\bcheck(?:ed)?[\s_-]*in\b/.test(stNorm) || /nhan\s*-?\s*phong/.test(stNorm) || /nhan phong/.test(stNorm);
      let uiState = 'pending'; // Chưa check-in
      if (isCompleted) uiState = 'completed';
      else if (isCheckOut) uiState = 'checkedout';
      else if (isCheckIn || st.replace(/[^a-z]/g, '') === 'checkedin') uiState = 'checkedin';
      return {
        bookingId: rw.BookingId,
        code: rw.Code,
        customerName: rw.CustomerName,
        phone: rw.Phone,
        roomNumber: rw.RoomNumber,
        roomType: rw.RoomType,
        checkIn: rw.CheckInDate,
        checkOut: rw.CheckOutDate,
        status: uiState
      };
    });
    res.json({ items, stats: stToday });
  } catch (err) {
    console.error('checkinout list error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách check-in/out' });
  }
});

// PUT /api/admin/checkinout/:id/checkin
app.put('/api/admin/checkinout/:id/checkin', authorize(['Staff']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    try { console.log('[CHECKIN] request by', req.user?.email, 'booking', id); } catch { }
    // optional columns detection
    const hasActualCin = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='ActualCheckIn' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasUpdBookings = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasUpdRooms = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Rooms')")
      .then(r => !!r.recordset.length).catch(() => false);
    // Update booking status
    const rq = pool.request().input('id', sql.Int, id);
    let setSql = "Status = 'Checked-in'";
    if (hasUpdBookings) setSql += ", UpdatedAt = SYSDATETIME()";
    if (hasActualCin) setSql += ", ActualCheckIn = SYSDATETIME()";
    const upd = await rq.query(`UPDATE Bookings SET ${setSql} WHERE Id = @id`);
    if (!upd.rowsAffected || !upd.rowsAffected[0]) {
      return res.status(404).json({ message: 'Không tìm thấy đặt phòng để cập nhật' });
    }
    // Try to mark room occupied (only if booking has a RoomId)
    const hasRoom = await pool.request().input('id', sql.Int, id)
      .query('SELECT TOP 1 RoomId FROM Bookings WHERE Id = @id');
    const roomId = hasRoom.recordset?.[0]?.RoomId;
    if (roomId) {
      const setRoom = `Status = 'Occupied'${hasUpdRooms ? ", UpdatedAt = SYSDATETIME()" : ''}`;
      await pool.request().input('rid', sql.Int, roomId)
        .query(`UPDATE Rooms SET ${setRoom} WHERE Id = @rid`);
    } else {
      try { console.warn('[CHECKIN] booking', id, 'has no RoomId; room status not updated'); } catch { }
    }
    // Return updated snapshot
    const snap = await pool.request().input('id', sql.Int, id).query(`
      SELECT b.Id AS BookingId, b.Status,
             ro.RoomNumber, r2.Status AS RoomStatus
      FROM Bookings b
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      LEFT JOIN Rooms r2 ON r2.Id = b.RoomId
      WHERE b.Id = @id`);
    const row = snap.recordset && snap.recordset[0] ? snap.recordset[0] : null;
    try { console.log('[CHECKIN] done booking', id, 'snapshot:', row); } catch { }
    res.json({ message: 'Đã check-in', booking: row });
  } catch (err) {
    console.error('check-in error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi check-in' });
  }
});

// PUT /api/admin/checkinout/:id/checkout
app.put('/api/admin/checkinout/:id/checkout', authorize(['Staff']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    try { console.log('[CHECKOUT] request by', req.user?.email, 'booking', id); } catch { }
    const hasActualCin = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='ActualCheckIn' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasActualCout = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='ActualCheckOut' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasUpdBookings = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasUpdRooms = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Rooms')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasFinalAmount = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='FinalAmount' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasRoomPrice = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='Price' AND [object_id]=OBJECT_ID('dbo.Rooms')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasPaymentStatusCol = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='Status' AND [object_id]=OBJECT_ID('dbo.Payments')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasPaymentsTable = await pool.request()
      .query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Payments]') AND type in (N'U')")
      .then(r => !!r.recordset.length).catch(() => false);

    // Update booking status and actual checkout time if column exists
    const rq = pool.request().input('id', sql.Int, id);
    let setSql = "Status = 'Checked-out'";
    if (hasUpdBookings) setSql += ", UpdatedAt = SYSDATETIME()";
    if (hasActualCout) setSql += ", ActualCheckOut = SYSDATETIME()";
    await rq.query(`UPDATE Bookings SET ${setSql} WHERE Id = @id`);

    // Set room to Cleaning after checkout (only if booking has a RoomId)
    const hasRoom2 = await pool.request().input('id', sql.Int, id)
      .query('SELECT TOP 1 RoomId FROM Bookings WHERE Id = @id');
    const roomId2 = hasRoom2.recordset?.[0]?.RoomId;
    if (roomId2) {
      const setRoom = `Status = 'Cleaning'${hasUpdRooms ? ", UpdatedAt = SYSDATETIME()" : ''}`;
      await pool.request().input('rid', sql.Int, roomId2)
        .query(`UPDATE Rooms SET ${setRoom} WHERE Id = @rid`);
    } else {
      try { console.warn('[CHECKOUT] booking', id, 'has no RoomId; room status not updated'); } catch { }
    }

    // Build invoice details with planned vs actual
    const aCinExpr = hasActualCin ? 'COALESCE(b.ActualCheckIn, b.CheckInDate)' : 'b.CheckInDate';
    const aCoutExpr = hasActualCout ? 'COALESCE(b.ActualCheckOut, SYSDATE())' : 'SYSDATETIME()';
    const inv = await pool.request().input('id', sql.Int, id).query(`
      SELECT b.Id AS BookingId,
             u.Name AS CustomerName, u.Phone,
             h.Name AS HotelName,
             ro.RoomNumber,
             rt.Name AS RoomType,
             ${hasRoomPrice ? 'COALESCE(ro.Price, rt.BasePrice)' : 'rt.BasePrice'} AS UnitPrice,
             b.CheckInDate AS PCheckIn,
             b.CheckOutDate AS PCheckOut,
             COALESCE(b.TotalAmount, 0) AS PlannedTotal,
             ${aCinExpr} AS ACheckIn,
             ${aCoutExpr} AS ACheckOut,
        b.PaymentStatus AS PaymentStatus
      FROM Bookings b
      INNER JOIN Users u ON u.Id = b.UserId
      INNER JOIN Hotels h ON h.Id = b.HotelId
      INNER JOIN Room_Types rt ON rt.Id = b.RoomTypeId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      WHERE b.Id = @id`);
    const row = inv.recordset[0];
    const cin = row && row.ACheckIn ? new Date(row.ACheckIn) : null;
    const cout = row && row.ACheckOut ? new Date(row.ACheckOut) : null;
    const pCin = row && row.PCheckIn ? new Date(row.PCheckIn) : null;
    const pCout = row && row.PCheckOut ? new Date(row.PCheckOut) : null;
    const nights = (cin && cout) ? Math.max(1, Math.ceil((cout - cin) / (1000 * 60 * 60 * 24))) : 1;
    const plannedNights = (pCin && pCout) ? Math.max(1, Math.ceil((pCout - pCin) / (1000 * 60 * 60 * 24))) : nights;
    const unit = Number(row && row.UnitPrice || 0);
    const total = unit * nights;
    const plannedTotal = Number(row && row.PlannedTotal != null ? row.PlannedTotal : (unit * plannedNights));
    // Sum payments for this booking
    let paid = 0;
    if (hasPaymentsTable) {
      const paySql = hasPaymentStatusCol
        ? `SELECT COALESCE(SUM(CAST(Amount AS DECIMAL(18,2))), 0) AS Paid
        FROM Payments WHERE BookingId = @id
        AND (Status COLLATE Vietnamese_CI_AI IN (N'Đã thanh toán', N'Da thanh toan', N'Paid', N'paid') OR Status IS NULL)`
        : `SELECT COALESCE(SUM(CAST(Amount AS DECIMAL(18,2))), 0) AS Paid
        FROM Payments WHERE BookingId = @id`;
      const pay = await pool.request().input('id', sql.Int, id).query(paySql);
      paid = Number(pay.recordset?.[0]?.Paid || 0);
    }
    // Fallback: if no payment rows but booking marked as paid, assume planned total was paid
    const ps = String(row && row.PaymentStatus || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const isPaid = /da thanh toan|paid/.test(ps) || ps === 'đã thanh toán' || ps === 'da thanh toan';
    if (paid <= 0 && isPaid) paid = Number(plannedTotal || 0);

    const diff = paid - total; // >0 refund to customer, <0 collect more
    const earlyCheckout = pCout && cout ? (cout.getTime() < pCout.getTime()) : false;

    if (hasFinalAmount) {
      await pool.request().input('id', sql.Int, id)
        .input('amt', sql.Decimal(10, 2), total)
        .query('UPDATE Bookings SET FinalAmount = @amt WHERE Id = @id');
    }

    try { console.log('[CHECKOUT] done booking', id, 'total', total); } catch { }
    res.json({
      message: 'Đã check-out', invoice: {
        bookingId: id,
        customerName: row.CustomerName,
        phone: row.Phone,
        hotelName: row.HotelName,
        roomNumber: row.RoomNumber,
        roomType: row.RoomType,
        checkIn: row.ACheckIn,
        checkOut: row.ACheckOut,
        nights,
        unitPrice: unit,
        total,
        plannedCheckOut: row.PCheckOut,
        plannedNights,
        plannedTotal,
        paidAmount: paid,
        refund: diff > 0 ? diff : 0,
        collect: diff < 0 ? -diff : 0,
        earlyCheckout
      }
    });
  } catch (err) {
    console.error('check-out error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi check-out' });
  }
});

// GET /api/admin/checkinout/:id/checkout-preview
// Compute invoice and early-checkout flag WITHOUT updating booking/room
app.get('/api/admin/checkinout/:id/checkout-preview', authorize(['Staff']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    const hasActualCin = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='ActualCheckIn' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasActualCout = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='ActualCheckOut' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasRoomPrice = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='Price' AND [object_id]=OBJECT_ID('dbo.Rooms')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasPaymentsTable = await pool.request()
      .query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Payments]') AND type in (N'U')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasPaymentStatusCol = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='Status' AND [object_id]=OBJECT_ID('dbo.Payments')")
      .then(r => !!r.recordset.length).catch(() => false);

    const aCinExpr = hasActualCin ? 'COALESCE(b.ActualCheckIn, b.CheckInDate)' : 'b.CheckInDate';
    const aCoutExpr = hasActualCout ? 'COALESCE(b.ActualCheckOut, SYSDATETIME())' : 'SYSDATETIME()';
    const inv = await pool.request().input('id', sql.Int, id).query(`
      SELECT b.Id AS BookingId,
             u.Name AS CustomerName, u.Phone,
             h.Name AS HotelName,
             ro.RoomNumber,
             rt.Name AS RoomType,
             ${hasRoomPrice ? 'COALESCE(ro.Price, rt.BasePrice)' : 'rt.BasePrice'} AS UnitPrice,
             b.CheckInDate AS PCheckIn,
             b.CheckOutDate AS PCheckOut,
             COALESCE(b.TotalAmount, 0) AS PlannedTotal,
             ${aCinExpr} AS ACheckIn,
             ${aCoutExpr} AS ACheckOut,
             b.PaymentStatus AS PaymentStatus
      FROM Bookings b
      INNER JOIN Users u ON u.Id = b.UserId
      INNER JOIN Hotels h ON h.Id = b.HotelId
      INNER JOIN Room_Types rt ON rt.Id = b.RoomTypeId
      LEFT JOIN Rooms ro ON ro.Id = b.RoomId
      WHERE b.Id = @id`);
    if (!inv.recordset.length) return res.status(404).json({ message: 'Không tìm thấy đặt phòng' });
    const row = inv.recordset[0];
    const cin = row && row.ACheckIn ? new Date(row.ACheckIn) : null;
    const cout = row && row.ACheckOut ? new Date(row.ACheckOut) : null;
    const pCin = row && row.PCheckIn ? new Date(row.PCheckIn) : null;
    const pCout = row && row.PCheckOut ? new Date(row.PCheckOut) : null;
    const nights = (cin && cout) ? Math.max(1, Math.ceil((cout - cin) / (1000 * 60 * 60 * 24))) : 1;
    const plannedNights = (pCin && pCout) ? Math.max(1, Math.ceil((pCout - pCin) / (1000 * 60 * 60 * 24))) : nights;
    const unit = Number(row && row.UnitPrice || 0);
    const total = unit * nights;
    const plannedTotal = Number(row && row.PlannedTotal != null ? row.PlannedTotal : (unit * plannedNights));
    let paid = 0;
    if (hasPaymentsTable) {
      const paySql = hasPaymentStatusCol
        ? `SELECT COALESCE(SUM(CAST(Amount AS DECIMAL(18,2))), 0) AS Paid
        FROM Payments WHERE BookingId = @id
        AND (Status COLLATE Vietnamese_CI_AI IN (N'Đã thanh toán', N'Da thanh toan', N'Paid', N'paid') OR Status IS NULL)`
        : `SELECT COALESCE(SUM(CAST(Amount AS DECIMAL(18,2))), 0) AS Paid
        FROM Payments WHERE BookingId = @id`;
      const pay = await pool.request().input('id', sql.Int, id).query(paySql);
      paid = Number(pay.recordset?.[0]?.Paid || 0);
    }
    const ps = String(row && row.PaymentStatus || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const isPaid = /da thanh toan|paid/.test(ps) || ps === 'đã thanh toán' || ps === 'da thanh toan';
    if (paid <= 0 && isPaid) paid = Number(plannedTotal || 0);
    const diff = paid - total;
    const earlyCheckout = pCout && cout ? (cout.getTime() < pCout.getTime()) : false;
    return res.json({
      invoice: {
        bookingId: id,
        customerName: row.CustomerName,
        phone: row.Phone,
        hotelName: row.HotelName,
        roomNumber: row.RoomNumber,
        roomType: row.RoomType,
        checkIn: row.ACheckIn,
        checkOut: row.ACheckOut,
        nights,
        unitPrice: unit,
        total,
        plannedCheckOut: row.PCheckOut,
        plannedNights,
        plannedTotal,
        paidAmount: paid,
        refund: diff > 0 ? diff : 0,
        collect: diff < 0 ? -diff : 0,
        earlyCheckout
      }
    });
  } catch (err) {
    console.error('checkout preview error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tính hóa đơn' });
  }
});

// PUT /api/admin/checkinout/:id/complete - mark room available after cleaning
app.put('/api/admin/checkinout/:id/complete', authorize(['Staff']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    try { console.log('[COMPLETE] request by', req.user?.email, 'booking', id); } catch { }
    const hasUpdBookings = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasUpdRooms = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Rooms')")
      .then(r => !!r.recordset.length).catch(() => false);
    // Update booking status to Completed (if such a state is desired), but do not overwrite payment
    try {
      const setSql = `Status = 'Completed'${hasUpdBookings ? ", UpdatedAt = SYSDATETIME()" : ''}`;
      await pool.request().input('id', sql.Int, id)
        .query(`UPDATE Bookings SET ${setSql} WHERE Id = @id`);
    } catch (e) {
      // ignore non-fatal
    }
    // Set room Available
    const hasRoom3 = await pool.request().input('id', sql.Int, id)
      .query('SELECT TOP 1 RoomId FROM Bookings WHERE Id = @id');
    const roomId3 = hasRoom3.recordset?.[0]?.RoomId;
    if (roomId3) {
      const setRoom = `Status = 'Available'${hasUpdRooms ? ", UpdatedAt = SYSDATETIME()" : ''}`;
      await pool.request().input('rid', sql.Int, roomId3)
        .query(`UPDATE Rooms SET ${setRoom} WHERE Id = @rid`);
    } else {
      try { console.warn('[COMPLETE] booking', id, 'has no RoomId; room status not updated'); } catch { }
    }
    res.json({ message: 'Đã chuyển phòng về Trống' });
  } catch (err) {
    console.error('complete cleaning error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi hoàn tất dọn dẹp' });
  }
});

// DELETE /api/admin/checkinout/:id - soft delete a booking (admin)
app.delete('/api/admin/checkinout/:id', authorize(['Staff', 'Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    // Optional: prevent deleting bookings that are already checked-in/out/completed
    const st = await pool.request().input('id', sql.Int, id)
      .query("SELECT TOP 1 Status FROM Bookings WHERE Id = @id");
    if (!st.recordset.length) return res.status(404).json({ message: 'Không tìm thấy đặt phòng' });
    const status = String(st.recordset[0].Status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/deleted/.test(status)) {
      return res.json({ message: 'Đơn đã được xóa trước đó' });
    }
    if (/checked.?in|checked.?out/.test(status)) {
      return res.status(400).json({ message: 'Không thể xóa đơn đang xử lý' });
    }
    // Soft delete: set Status = 'Deleted' and update UpdatedAt if exists
    const hasUpdBookings = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    await pool.request().input('id', sql.Int, id)
      .query(`UPDATE Bookings SET Status = N'Deleted'${hasUpdBookings ? ", UpdatedAt = SYSDATETIME()" : ''} WHERE Id = @id`);
    res.json({ message: 'Đã xóa đơn' });
  } catch (err) {
    console.error('delete booking error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi xóa đơn' });
  }
});

// POST /api/admin/checkinout/bulk-delete - soft delete multiple bookings (admin)
app.post('/api/admin/checkinout/bulk-delete', authorize(['Staff', 'Admin']), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ message: 'Thiếu danh sách ID' });
  try {
    const pool = await getPool();
    // Filter out processed bookings
    const tmp = await pool.request().query(`SELECT Id, Status FROM Bookings WHERE Id IN (${ids.join(',')})`);
    const removable = tmp.recordset.filter(r => {
      const s = String(r.Status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (/deleted/.test(s)) return false; // already deleted
      return /complete/.test(s) && !(/checked.?in|checked.?out/.test(s));
    }).map(r => r.Id);
    if (!removable.length) return res.status(400).json({ message: 'Không có đơn hợp lệ để xóa' });
    const hasUpdBookings = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    await pool.request().query(`UPDATE Bookings SET Status = N'Deleted'${hasUpdBookings ? ', UpdatedAt = SYSDATETIME()' : ''} WHERE Id IN (${removable.join(',')})`);
    res.json({ message: `Đã xóa ${removable.length} đơn`, deletedIds: removable });
  } catch (err) {
    console.error('bulk delete error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi xóa hàng loạt' });
  }
});

// List hotels for admin/client selectors
app.get('/api/hotels', async (req, res) => {
  try {
    const pool = await getPool();
    const rs = await pool.request().query('SELECT Id, Name, City, Country FROM Hotels ORDER BY Name');
    res.json(rs.recordset.map(h => ({ id: h.Id, name: h.Name, city: h.City, country: h.Country })));
  } catch (err) {
    console.error('List hotels error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách khách sạn' });
  }
});

// ===== Admin: Hotel Services =====
// services table expected columns: Id, Name, Description, Price (decimal), Status (NVarChar, e.g., 'Hoạt động' | 'Tạm dừng')
app.get('/api/admin/services', authorize(['Admin']), async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const pool = await getPool();
    const r = pool.request();
    if (q) r.input('q', sql.NVarChar(200), `%${q}%`);
    const rs = await r.query(`
      SELECT Id, Name, Description, Price, Status
      FROM Services
      ${q ? 'WHERE (Name LIKE @q OR Description LIKE @q)' : ''}
      ORDER BY Id`);
    res.json({
      services: rs.recordset.map(s => ({
        id: s.Id,
        name: s.Name,
        description: s.Description,
        price: Number(s.Price || 0),
        status: s.Status || 'Hoạt động'
      }))
    });
  } catch (err) {
    console.error('List services error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách dịch vụ' });
  }
});

app.post('/api/admin/services', authorize(['Admin']), async (req, res) => {
  const { name, description, price, status } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ message: 'Thiếu tên dịch vụ' });
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return res.status(400).json({ message: 'Giá không hợp lệ' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('name', sql.NVarChar(100), name.trim())
      .input('desc', sql.NVarChar(sql.MAX), description || null)
      .input('price', sql.Decimal(10, 2), p)
      .input('status', sql.NVarChar(50), status || 'Hoạt động')
      .query('INSERT INTO Services (Name, Description, Price, Status) VALUES (@name, @desc, @price, @status)');
    res.json({ message: 'Tạo dịch vụ thành công' });
  } catch (err) {
    console.error('Create service error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tạo dịch vụ' });
  }
});

app.put('/api/admin/services/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  const { name, description, price, status } = req.body || {};
  try {
    const sets = [];
    const pool = await getPool();
    const r = pool.request().input('id', sql.Int, id);
    if (name !== undefined) { sets.push('Name = @name'); r.input('name', sql.NVarChar(100), name || null); }
    if (description !== undefined) { sets.push('Description = @desc'); r.input('desc', sql.NVarChar(sql.MAX), description || null); }
    if (price !== undefined) { const p = Number(price); if (!Number.isFinite(p) || p < 0) return res.status(400).json({ message: 'Giá không hợp lệ' }); sets.push('Price = @price'); r.input('price', sql.Decimal(10, 2), p); }
    if (status !== undefined) { sets.push('Status = @status'); r.input('status', sql.NVarChar(50), status || null); }
    if (!sets.length) return res.status(400).json({ message: 'Không có trường nào để cập nhật' });
    const hasUpdServices = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Services')")
      .then(r => !!r.recordset.length).catch(() => false);
    await r.query(`UPDATE Services SET ${sets.join(', ')}${hasUpdServices ? ', UpdatedAt = SYSDATETIME()' : ''} WHERE Id = @id`);
    res.json({ message: 'Cập nhật dịch vụ thành công' });
  } catch (err) {
    console.error('Update service error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật dịch vụ' });
  }
});

app.delete('/api/admin/services/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM Services WHERE Id = @id');
    res.json({ message: 'Đã xóa dịch vụ' });
  } catch (err) {
    console.error('Delete service error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi xóa dịch vụ' });
  }
});

app.put('/api/admin/services/:id/status', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  const status = (req.body && req.body.status) || '';
  if (!id || !status) return res.status(400).json({ message: 'Thiếu ID hoặc trạng thái' });
  try {
    const pool = await getPool();
    const hasUpdServices2 = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Services')")
      .then(r => !!r.recordset.length).catch(() => false);
    await pool.request().input('id', sql.Int, id).input('status', sql.NVarChar(50), status)
      .query(`UPDATE Services SET Status = @status${hasUpdServices2 ? ', UpdatedAt = SYSDATETIME()' : ''} WHERE Id = @id`);
    res.json({ message: 'Đã cập nhật trạng thái' });
  } catch (err) {
    console.error('Change service status error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật trạng thái' });
  }
});

// ===== Admin: Rooms =====
app.get('/api/admin/rooms', authorize(['Admin']), async (req, res) => {
  const q = (req.query.q || '').trim();
  const typeId = req.query.typeId ? Number(req.query.typeId) : null;
  const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
  try {
    const pool = await getPool();
    // detect optional columns
    const hasName = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Name' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const hasFloor = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Floor' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const hasPrice = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Price' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const hasAdults = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxAdults' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const hasChildren = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxChildren' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const hasDesc = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Description' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const hasImages = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Images' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const hasImage = await (async () => { try { const r = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Image' AND [object_id]=OBJECT_ID('dbo.Rooms')"); return !!r.recordset.length; } catch { return false; } })();
    const r = pool.request();
    if (q) r.input('q', sql.NVarChar(200), `%${q}%`);
    if (typeId) r.input('typeId', sql.Int, typeId);
    if (hotelId) r.input('hid', sql.Int, hotelId);
    // Fetch base room data first
    const rs = await r.query(`
      SELECT r.Id, r.HotelId, r.RoomNumber, r.RoomTypeId, r.Status,
             ${hasName ? 'r.Name' : 'NULL'} AS RoomName,
             ${hasFloor ? 'r.Floor' : 'NULL'} AS Floor,
             ${hasPrice ? 'r.Price' : 'NULL'} AS Price,
             ${hasAdults ? 'r.MaxAdults' : 'NULL'} AS RMaxAdults,
             ${hasChildren ? 'r.MaxChildren' : 'NULL'} AS RMaxChildren,
             ${hasDesc ? 'r.Description' : 'NULL'} AS RDescription,
             ${hasImages ? 'r.Images' : 'NULL'} AS Images,
             ${hasImage ? 'r.Image' : 'NULL'} AS Image,
             rt.Name AS RoomTypeName, rt.BasePrice, rt.MaxAdults, rt.MaxChildren,
             rt.Description AS RTDescription
      FROM Rooms r
      INNER JOIN Room_Types rt ON rt.Id = r.RoomTypeId
      WHERE 1=1
        ${q ? ' AND (r.RoomNumber LIKE @q OR rt.Name LIKE @q' + (hasName ? ' OR r.Name LIKE @q)' : ')') : ''}
        ${typeId ? ' AND (r.RoomTypeId = @typeId)' : ''}
        ${hotelId ? ' AND (r.HotelId = @hid)' : ''}
      ORDER BY r.RoomNumber`);
    const roomsRaw = rs.recordset || [];
    // Collect unique roomTypeIds to query amenities mapping
    const roomTypeIds = [...new Set(roomsRaw.map(x => x.RoomTypeId).filter(Boolean))];
    let amenitiesByType = {};
    if (roomTypeIds.length) {
      try {
        const pool2 = await getPool();
        // Query Room_Amenities join if table exists (avoid errors if legacy DB missing)
        const hasRoomAmenities = await pool2.request().query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Room_Amenities') AND type in ('U')").then(r2 => !!r2.recordset.length).catch(() => false);
        const hasAmenitiesTbl = await pool2.request().query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Amenities') AND type in ('U')").then(r2 => !!r2.recordset.length).catch(() => false);
        if (hasRoomAmenities && hasAmenitiesTbl) {
          // Build IN list safely using table variable
          // Use a temp table to pass ids
          const tv = roomTypeIds.map(id => `SELECT ${Number(id)} AS Id`).join(' UNION ALL ');
          const amenRs = await pool2.request().query(`
            WITH T AS (${tv})
            SELECT ra.RoomTypeId, a.Id AS AmenityId, a.Name AS AmenityName, ra.IsIncluded
            FROM Room_Amenities ra
            INNER JOIN T ON T.Id = ra.RoomTypeId
            INNER JOIN Amenities a ON a.Id = ra.AmenityId
            ORDER BY ra.RoomTypeId, a.Name`);
          amenRs.recordset.forEach(row => {
            if (!amenitiesByType[row.RoomTypeId]) amenitiesByType[row.RoomTypeId] = [];
            amenitiesByType[row.RoomTypeId].push({ id: row.AmenityId, name: row.AmenityName, included: row.IsIncluded ? true : false });
          });
          // Debug: log counts
          console.log('[DEBUG] Room_Amenities loaded types:', Object.keys(amenitiesByType).length, 'total rows:', amenRs.recordset.length);
        }
      } catch (e) {
        console.warn('Fetch Room_Amenities skipped:', e && e.message ? e.message : e);
      }
    }
    const rooms = rs.recordset.map(x => ({
      id: x.Id,
      name: x.RoomName || null,
      roomNumber: x.RoomNumber,
      hotelId: x.HotelId,
      roomTypeId: x.RoomTypeId,
      roomTypeName: x.RoomTypeName,
      basePrice: Number((hasPrice && x.Price != null) ? x.Price : (x.BasePrice || 0)),
      maxAdults: (hasAdults && x.RMaxAdults != null) ? x.RMaxAdults : x.MaxAdults,
      maxChildren: (hasChildren && x.RMaxChildren != null) ? x.RMaxChildren : x.MaxChildren,
      // Provide summary string of included amenities; fallback to room/room-type description
      amenities: (() => {
        const list = amenitiesByType[x.RoomTypeId];
        if (list && list.length) {
          const inc = list.filter(a => a.included).map(a => a.name);
          if (inc.length) return inc.join(', ');
        }
        return (hasDesc && x.RDescription != null) ? x.RDescription : (x.RTDescription || null);
      })(),
      amenitiesDetailed: amenitiesByType[x.RoomTypeId] || [],
      amenitiesDebug: amenitiesByType[x.RoomTypeId] ? amenitiesByType[x.RoomTypeId].length : 0,
      floor: hasFloor ? x.Floor : null,
      images: (() => {
        const arr = (hasImages && x.Images) ? safeParseImages(x.Images) : [];
        if ((!arr || arr.length === 0) && hasImage && x.Image) {
          return [normalizeImagePath(x.Image)];
        }
        return arr;
      })(),
      status: x.Status || 'Available'
    }));
    res.json({ rooms });
  } catch (err) {
    console.error('List rooms error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách phòng' });
  }
});

// ===== Public: Rooms (read-only) =====
// Returns all rooms with hotel & type info; optional q, hotelId, typeId filters.
app.get('/api/rooms', async (req, res) => {
  const q = (req.query.q || '').trim();
  const typeId = req.query.typeId ? Number(req.query.typeId) : null;
  const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
  try {
    const pool = await getPool();
    // Detect optional columns to avoid querying non-existent columns (causing 500 errors)
    const [hasFloor, hasImages, hasPrice, hasImage] = await Promise.all([
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Floor' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Images' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Price' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Image' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false)
    ]);
    const r = pool.request();
    if (q) r.input('q', sql.NVarChar(200), `%${q}%`);
    if (typeId) r.input('typeId', sql.Int, typeId);
    if (hotelId) r.input('hid', sql.Int, hotelId);
    const rs = await r.query(`
      SELECT TOP 1000 r.Id, r.HotelId, r.RoomTypeId, r.RoomNumber, r.Status,
             ${hasFloor ? 'r.Floor' : 'NULL'} AS Floor,
             ${hasImages ? 'r.Images' : 'NULL'} AS Images,
             ${hasPrice ? 'r.Price' : 'NULL'} AS Price,
             ${hasImage ? 'r.Image' : 'NULL'} AS Image,
             rt.Name AS RoomTypeName, rt.BasePrice, rt.Description AS RTDescription,
             h.Name AS HotelName
      FROM Rooms r
      INNER JOIN Room_Types rt ON rt.Id = r.RoomTypeId
      INNER JOIN Hotels h ON h.Id = r.HotelId
      WHERE 1=1
        ${q ? ' AND (r.RoomNumber LIKE @q OR rt.Name LIKE @q OR h.Name LIKE @q)' : ''}
        ${typeId ? ' AND r.RoomTypeId = @typeId' : ''}
        ${hotelId ? ' AND r.HotelId = @hid' : ''}
      ORDER BY r.HotelId, r.RoomTypeId, r.RoomNumber`);
    const items = rs.recordset.map(x => ({
      id: x.Id,
      hotelId: x.HotelId,
      hotelName: x.HotelName,
      roomTypeId: x.RoomTypeId,
      roomType: x.RoomTypeName,
      roomNumber: x.RoomNumber,
      floor: hasFloor ? x.Floor : null,
      status: x.Status || 'Available',
      price: (hasPrice && x.Price != null) ? Number(x.Price) : Number(x.BasePrice || 0),
      description: x.RTDescription || '',
      images: (() => {
        const arr = hasImages ? safeParseImages(x.Images) : [];
        if ((!arr || arr.length === 0) && hasImage && x.Image) {
          return [normalizeImagePath(x.Image)];
        }
        return arr;
      })()
    }));
    res.json({ items });
  } catch (err) {
    console.error('public rooms list error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh sách phòng' });
  }
});

// Public: Room detail by id (includes optional columns, images parsed)
app.get('/api/rooms/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID phòng' });
  try {
    const pool = await getPool();
    const [hasFloor, hasImages, hasPrice, hasAdults, hasChildren, hasDesc, hasImage] = await Promise.all([
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Floor' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Images' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Price' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxAdults' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxChildren' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Description' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
      pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Image' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r => !!r.recordset.length).catch(() => false),
    ]);
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT TOP 1 ro.Id, ro.HotelId, ro.RoomTypeId, ro.RoomNumber, ro.Status,
             ${hasFloor ? 'ro.Floor' : 'NULL'} AS Floor,
             ${hasImages ? 'ro.Images' : 'NULL'} AS Images,
             ${hasPrice ? 'ro.Price' : 'NULL'} AS Price,
             ${hasAdults ? 'ro.MaxAdults' : 'NULL'} AS MaxAdults,
             ${hasChildren ? 'ro.MaxChildren' : 'NULL'} AS MaxChildren,
             ${hasDesc ? 'ro.Description' : 'NULL'} AS RDescription,
             ${hasImage ? 'ro.Image' : 'NULL'} AS Image,
             rt.Name AS RoomTypeName, rt.BasePrice, rt.Description AS RTDescription,
             h.Name AS HotelName
      FROM Rooms ro
      INNER JOIN Room_Types rt ON rt.Id = ro.RoomTypeId
      INNER JOIN Hotels h ON h.Id = ro.HotelId
      WHERE ro.Id = @id`);
    if (!r.recordset.length) return res.status(404).json({ message: 'Không tìm thấy phòng' });
    const x = r.recordset[0];
    // Fetch amenities for the room type (if tables exist)
    let amenities = [];
    try {
      const hasRoomAmenities = await pool.request().query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Room_Amenities') AND type in ('U')").then(r2 => !!r2.recordset.length).catch(() => false);
      const hasAmenitiesTbl = await pool.request().query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Amenities') AND type in ('U')").then(r2 => !!r2.recordset.length).catch(() => false);
      if (hasRoomAmenities && hasAmenitiesTbl) {
        const amRs = await pool.request().input('rt', sql.Int, x.RoomTypeId).query(`
          SELECT a.Id, a.Name, ra.IsIncluded
          FROM Room_Amenities ra
          INNER JOIN Amenities a ON a.Id = ra.AmenityId
          WHERE ra.RoomTypeId = @rt
          ORDER BY a.Name`);
        amenities = amRs.recordset.map(rw => ({ id: rw.Id, name: rw.Name, included: rw.IsIncluded ? true : false }));
      }
    } catch (e) { /* ignore for public endpoint */ }
    const detail = {
      id: x.Id,
      hotelId: x.HotelId,
      hotelName: x.HotelName,
      roomTypeId: x.RoomTypeId,
      roomType: x.RoomTypeName,
      roomNumber: x.RoomNumber,
      floor: hasFloor ? x.Floor : null,
      status: x.Status || 'Available',
      price: (hasPrice && x.Price != null) ? Number(x.Price) : Number(x.BasePrice || 0),
      basePrice: Number(x.BasePrice || 0),
      maxAdults: hasAdults ? x.MaxAdults : null,
      maxChildren: hasChildren ? x.MaxChildren : null,
      description: (hasDesc && x.RDescription) ? x.RDescription : (x.RTDescription || ''),
      images: (() => {
        const arr = hasImages ? (safeParseImages(x.Images) || []) : [];
        if ((!arr || arr.length === 0) && hasImage && x.Image) {
          return [normalizeImagePath(x.Image)];
        }
        return arr;
      })(),
      amenities: amenities,
    };
    res.json({ room: detail });
  } catch (e) {
    console.error('public room detail error:', e);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy chi tiết phòng' });
  }
});

// Public: Room reviews list by room id (fallback to recent reviews referencing this room)
app.get('/api/rooms/:id/reviews', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID phòng' });
  try {
    const pool = await getPool();
    // Join Reviews via Bookings to Room
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT TOP 100 r.Id, r.Rating, r.Comment, r.CreatedAt,
             u.Name AS CustomerName, u.Email AS CustomerEmail,
             b.Id AS BookingId
      FROM Reviews r
      INNER JOIN Bookings b ON b.Id = r.BookingId
      LEFT JOIN Users u ON u.Id = r.UserId
      WHERE b.RoomId = @id
      ORDER BY r.CreatedAt DESC`);
    const reviews = rs.recordset.map(x => ({
      id: x.Id,
      rating: (Number(x.Rating) || 0) / 2,
      comment: x.Comment || '',
      createdAt: x.CreatedAt,
      customer: x.CustomerName || x.CustomerEmail || 'Khách',
      bookingId: x.BookingId
    }));
    const avgRating = reviews.length ? (reviews.reduce((s, v) => s + (v.rating || 0), 0) / reviews.length) : 0;
    res.json({ reviews, avgRating });
  } catch (e) {
    console.error('public room reviews error:', e);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy đánh giá phòng' });
  }
});


app.post('/api/admin/rooms', authorize(['Admin']), async (req, res) => {
  const { roomNumber, roomTypeId, status, name, floor, price, maxAdults, maxChildren, description, images, hotelId: hotelIdBody } = req.body || {};
  if (!roomNumber || !String(roomNumber).trim()) return res.status(400).json({ message: 'Thiếu số phòng' });
  if (!roomTypeId) return res.status(400).json({ message: 'Thiếu loại phòng' });
  try {
    const pool = await getPool();
    // Find hotelId from the selected room type
    let hotelId = hotelIdBody ? Number(hotelIdBody) : null;
    if (!hotelId) {
      const typeRow = await pool.request().input('rt', sql.Int, Number(roomTypeId)).query('SELECT HotelId FROM Room_Types WHERE Id = @rt');
      if (!typeRow.recordset.length) return res.status(400).json({ message: 'Loại phòng không tồn tại' });
      hotelId = typeRow.recordset[0].HotelId;
    }
    // Prevent duplicate room number within the same hotel
    const dup = await pool.request()
      .input('rn', sql.NVarChar(20), String(roomNumber).trim())
      .input('hid', sql.Int, Number(hotelId))
      .query('SELECT COUNT(1) AS n FROM Rooms WHERE RoomNumber = @rn AND HotelId = @hid');
    if ((dup.recordset?.[0]?.n || 0) > 0) {
      return res.status(400).json({ message: 'Số phòng đã tồn tại trong khách sạn này' });
    }
    // detect optional columns
    const hasName = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Name' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasFloor = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Floor' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasPrice = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Price' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasAdults = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxAdults' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasChildren = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxChildren' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasDesc = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Description' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasImages = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Images' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);

    const rq = pool.request()
      .input('rn', sql.NVarChar(20), String(roomNumber).trim())
      .input('rt', sql.Int, Number(roomTypeId))
      .input('st', sql.NVarChar(30), status || 'Available');
    let fields = 'HotelId, RoomNumber, RoomTypeId, Status';
    let values = '@hid, @rn, @rt, @st';
    rq.input('hid', sql.Int, Number(hotelId));
    if (hasName && name !== undefined) { fields += ', Name'; values += ', @name'; rq.input('name', sql.NVarChar(100), name || null); }
    if (hasFloor && floor !== undefined) { fields += ', Floor'; values += ', @floor'; rq.input('floor', sql.Int, floor ? Number(floor) : null); }
    if (hasPrice && price !== undefined) { fields += ', Price'; values += ', @price'; rq.input('price', sql.Decimal(10, 2), Number(price) || 0); }
    if (hasAdults && maxAdults !== undefined) { fields += ', MaxAdults'; values += ', @adults'; rq.input('adults', sql.Int, maxAdults ? Number(maxAdults) : null); }
    if (hasChildren && maxChildren !== undefined) { fields += ', MaxChildren'; values += ', @children'; rq.input('children', sql.Int, maxChildren ? Number(maxChildren) : null); }
    if (hasDesc && description !== undefined) { fields += ', Description'; values += ', @desc'; rq.input('desc', sql.NVarChar(sql.MAX), description || null); }
    if (hasImages && images !== undefined) { fields += ', Images'; values += ', @images'; rq.input('images', sql.NVarChar(sql.MAX), Array.isArray(images) ? JSON.stringify(images) : (images || null)); }
    await rq.query(`INSERT INTO Rooms (${fields}) VALUES (${values})`);
    res.json({ message: 'Tạo phòng thành công' });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tạo phòng' });
  }
});

// Update amenities mapping for a room type
// PUT /api/admin/room-types/:id/amenities  body: { amenities: [{ amenityId, included }] }
app.put('/api/admin/room-types/:id/amenities', authorize(['Admin']), async (req, res) => {
  const roomTypeId = Number(req.params.id);
  if (!roomTypeId) return res.status(400).json({ message: 'Thiếu ID loại phòng' });
  const list = Array.isArray(req.body?.amenities) ? req.body.amenities : [];
  try {
    const pool = await getPool();
    // Guard table existence
    const hasRoomAmenities = await pool.request().query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Room_Amenities') AND type in ('U')").then(r => !!r.recordset.length).catch(() => false);
    const hasAmenities = await pool.request().query("SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Amenities') AND type in ('U')").then(r => !!r.recordset.length).catch(() => false);
    if (!hasRoomAmenities || !hasAmenities) {
      return res.status(400).json({ message: 'Bảng Room_Amenities hoặc Amenities không tồn tại' });
    }
    // Validate room type exists
    const rt = await pool.request().input('rt', sql.Int, roomTypeId).query('SELECT 1 FROM Room_Types WHERE Id = @rt');
    if (!rt.recordset.length) return res.status(404).json({ message: 'Loại phòng không tồn tại' });
    // Normalize payload (dedupe by amenityId)
    const normMap = new Map();
    list.forEach(it => {
      const aid = Number(it.amenityId || it.id || 0);
      if (!aid) return;
      normMap.set(aid, { amenityId: aid, included: !!it.included });
    });
    const finalList = Array.from(normMap.values());
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const reqDel = new sql.Request(tx);
      await reqDel.input('rt', sql.Int, roomTypeId).query('DELETE FROM Room_Amenities WHERE RoomTypeId = @rt');
      if (finalList.length) {
        for (const row of finalList) {
          const reqIns = new sql.Request(tx);
          reqIns.input('rt', sql.Int, roomTypeId)
            .input('aid', sql.Int, row.amenityId)
            .input('inc', sql.Bit, row.included ? 1 : 0);
          await reqIns.query('INSERT INTO Room_Amenities (RoomTypeId, AmenityId, IsIncluded) VALUES (@rt, @aid, @inc)');
        }
      }
      await tx.commit();
      res.json({ ok: true, count: finalList.length });
    } catch (inner) {
      try { await tx.rollback(); } catch { }
      throw inner;
    }
  } catch (err) {
    console.error('Update room-type amenities error:', err);
    res.status(500).json({ message: 'Lỗi cập nhật tiện nghi loại phòng' });
  }
});

app.put('/api/admin/rooms/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  const { roomNumber, roomTypeId, status, name, floor, price, maxAdults, maxChildren, description, images } = req.body || {};
  try {
    const pool = await getPool();
    const sets = [];
    const r = pool.request().input('id', sql.Int, id);
    if (roomNumber !== undefined) { sets.push('RoomNumber = @rn'); r.input('rn', sql.NVarChar(20), roomNumber || null); }
    if (roomTypeId !== undefined) {
      // also update HotelId according to room type
      const typeRow = await pool.request().input('rt', sql.Int, Number(roomTypeId)).query('SELECT HotelId FROM Room_Types WHERE Id = @rt');
      if (!typeRow.recordset.length) return res.status(400).json({ message: 'Loại phòng không tồn tại' });
      const hotelId = typeRow.recordset[0].HotelId;
      sets.push('RoomTypeId = @rt'); r.input('rt', sql.Int, roomTypeId || null);
      sets.push('HotelId = @hid'); r.input('hid', sql.Int, hotelId);
    }
    if (status !== undefined) { sets.push('Status = @st'); r.input('st', sql.NVarChar(30), status || null); }
    // optional columns
    const hasName = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Name' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasFloor = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Floor' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasPrice = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Price' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasAdults = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxAdults' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasChildren = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='MaxChildren' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasDesc = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Description' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    const hasImages = await pool.request().query("SELECT 1 FROM sys.columns WHERE [name]='Images' AND [object_id]=OBJECT_ID('dbo.Rooms')").then(r2 => !!r2.recordset.length).catch(() => false);
    if (hasName && name !== undefined) { sets.push('Name = @name'); r.input('name', sql.NVarChar(100), name || null); }
    if (hasFloor && floor !== undefined) { sets.push('Floor = @floor'); r.input('floor', sql.Int, floor ? Number(floor) : null); }
    if (hasPrice && price !== undefined) { sets.push('Price = @price'); r.input('price', sql.Decimal(10, 2), Number(price) || 0); }
    if (hasAdults && maxAdults !== undefined) { sets.push('MaxAdults = @adults'); r.input('adults', sql.Int, maxAdults ? Number(maxAdults) : null); }
    if (hasChildren && maxChildren !== undefined) { sets.push('MaxChildren = @children'); r.input('children', sql.Int, maxChildren ? Number(maxChildren) : null); }
    if (hasDesc && description !== undefined) { sets.push('Description = @desc'); r.input('desc', sql.NVarChar(sql.MAX), description || null); }
    if (hasImages && images !== undefined) { sets.push('Images = @images'); r.input('images', sql.NVarChar(sql.MAX), Array.isArray(images) ? JSON.stringify(images) : (images || null)); }
    if (!sets.length) return res.status(400).json({ message: 'Không có trường nào để cập nhật' });
    const hasUpdRooms = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='UpdatedAt' AND [object_id]=OBJECT_ID('dbo.Rooms')")
      .then(r => !!r.recordset.length).catch(() => false);
    await r.query(`UPDATE Rooms SET ${sets.join(', ')}${hasUpdRooms ? ', UpdatedAt = SYSDATETIME()' : ''} WHERE Id = @id`);
    res.json({ message: 'Cập nhật phòng thành công' });
  } catch (err) {
    console.error('Update room error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật phòng' });
  }
});

app.delete('/api/admin/rooms/:id', authorize(['Admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu ID' });
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM Rooms WHERE Id = @id');
    res.json({ message: 'Đã xóa phòng' });
  } catch (err) {
    console.error('Delete room error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi xóa phòng' });
  }
});

// Upload room images
app.post('/api/admin/rooms/upload', authorize(['Admin']), upload.array('files', 5), async (req, res) => {
  try {
    const sel = (req.files || []).slice(0, 5);
    const files = sel.map(f => `/uploads/${f.filename}`.replace(/\\/g, '/'));
    res.json({ files });
  } catch (err) {
    console.error('Upload room images error:', err);
    res.status(500).json({ message: 'Lỗi tải ảnh' });
  }
});

// ===== Admin: Today Stats =====
// GET /api/admin/stats/today
// Returns counts for today: { checkInsToday, checkOutsToday, notArrivedToday }
app.get('/api/admin/stats/today', authorize(['Staff']), async (_req, res) => {
  try {
    const pool = await getPool();
    const hasActualCin = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='ActualCheckIn' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasActualCout = await pool.request()
      .query("SELECT 1 FROM sys.columns WHERE [name]='ActualCheckOut' AND [object_id]=OBJECT_ID('dbo.Bookings')")
      .then(r => !!r.recordset.length).catch(() => false);

    let sqlText = `DECLARE @today DATE = CAST(GETDATE() AS DATE);
      SELECT
        CheckInsToday = (
          SELECT COUNT(1) FROM Bookings b
          WHERE ${hasActualCin ? "b.ActualCheckIn IS NOT NULL AND CAST(b.ActualCheckIn AS DATE) = @today" : "b.Status = 'Checked-in' AND CAST(b.CheckInDate AS DATE) = @today"}
            AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')
        ),
        CheckOutsToday = (
          SELECT COUNT(1) FROM Bookings b
          WHERE ${hasActualCout ? "b.ActualCheckOut IS NOT NULL AND CAST(b.ActualCheckOut AS DATE) = @today" : "b.Status = 'Checked-out' AND CAST(b.CheckOutDate AS DATE) = @today"}
            AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')
        ),
        NotArrivedToday = (
          SELECT COUNT(1) FROM Bookings b
          WHERE CAST(b.CheckInDate AS DATE) = @today
            AND NOT (
              b.Status COLLATE Vietnamese_CI_AI IN (N'Checked-in', N'Checked in', N'Checked-out', N'Checked out', N'Completed', N'Canceled', N'Cancel', N'Huy', N'Hủy')
              OR COALESCE(b.PaymentStatus, N'') COLLATE Vietnamese_CI_AI IN (N'Canceled', N'Cancel', N'Huy', N'Hủy')
            )
            AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')
        );`;
    const rs = await pool.request().query(sqlText);
    const row = rs.recordset && rs.recordset[0] ? rs.recordset[0] : { CheckInsToday: 0, CheckOutsToday: 0, NotArrivedToday: 0 };
    res.json({
      checkInsToday: Number(row.CheckInsToday || 0),
      checkOutsToday: Number(row.CheckOutsToday || 0),
      notArrivedToday: Number(row.NotArrivedToday || 0)
    });
  } catch (err) {
    console.error('today stats error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi thống kê hôm nay' });
  }
});

// ===== Admin: Reports (Summary + Monthly Revenue) =====
// GET /api/admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/api/admin/reports/summary', authorize(['Admin']), async (req, res) => {
  try {
    const pool = await getPool();
    const fromStr = (req.query.from || '').toString();
    const toStr = (req.query.to || '').toString();
    const today = new Date();
    const toDate = toStr ? new Date(toStr) : null;
    const fromDate = fromStr ? new Date(fromStr) : null;
    const hasRange = !!(fromDate && toDate);

    const hasBookingsStatus = await tableHasColumn(pool, 'dbo.Bookings', 'Status');
    const hasPaymentsTable = await pool.request()
      .query("SELECT 1 AS ok FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Payments') AND type in (N'U')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasPaymentsCreatedAt = hasPaymentsTable ? await tableHasColumn(pool, 'dbo.Payments', 'CreatedAt') : false;
    const hasBookingsFinalAmount = await tableHasColumn(pool, 'dbo.Bookings', 'FinalAmount');
    const hasBookingsPaymentStatus = await tableHasColumn(pool, 'dbo.Bookings', 'PaymentStatus');

    // Total bookings in range by CheckInDate
    const rbReq = pool.request();
    if (hasRange) { rbReq.input('from', sql.Date, fromDate).input('to', sql.Date, toDate); }
    const rb = await rbReq.query(`SELECT COUNT(1) AS n FROM Bookings b
              WHERE 1=1
                ${hasRange ? 'AND CAST(b.CheckInDate AS DATE) BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)' : ''}
                ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
                ${hasBookingsPaymentStatus ? "AND (COALESCE(b.PaymentStatus,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))" : ''}`);
    const totalBookings = Number(rb.recordset?.[0]?.n || 0);

    // Check-ins today (kept for compatibility)
    const hasActualCin = await tableHasColumn(pool, 'dbo.Bookings', 'ActualCheckIn');
    const hasActualCout = await tableHasColumn(pool, 'dbo.Bookings', 'ActualCheckOut');
    const rsToday = await pool.request().query(`DECLARE @today DATE = CAST(GETDATE() AS DATE);
      SELECT
        CheckInsToday = (
          SELECT COUNT(1) FROM Bookings b
          WHERE ${hasActualCin ? "b.ActualCheckIn IS NOT NULL AND CAST(b.ActualCheckIn AS DATE) = @today" : "b.Status = 'Checked-in' AND CAST(b.CheckInDate AS DATE) = @today"}
            ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
        );`);
    const checkInsToday = Number(rsToday.recordset?.[0]?.CheckInsToday || 0);

    // Check-ins count (all-time or by date range)
    let checkInsCount = 0;
    if (hasActualCin) {
      const rci = pool.request();
      if (hasRange) { rci.input('from', sql.Date, fromDate).input('to', sql.Date, toDate); }
      const q = `SELECT COUNT(1) AS n FROM Bookings b
        WHERE b.ActualCheckIn IS NOT NULL
          ${hasRange ? 'AND CAST(b.ActualCheckIn AS DATE) BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)' : ''}
          ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
          ${hasBookingsPaymentStatus ? "AND (COALESCE(b.PaymentStatus,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))" : ''}`;
      const rs = await rci.query(q);
      checkInsCount = Number(rs.recordset?.[0]?.n || 0);
    } else {
      const rci = pool.request();
      if (hasRange) { rci.input('from', sql.Date, fromDate).input('to', sql.Date, toDate); }
      const q = `SELECT COUNT(1) AS n FROM Bookings b
        WHERE 1=1
          ${hasRange ? 'AND CAST(b.CheckInDate AS DATE) BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)' : ''}
          ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
          ${hasBookingsPaymentStatus ? "AND (COALESCE(b.PaymentStatus,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))" : ''}`;
      const rs = await rci.query(q);
      checkInsCount = Number(rs.recordset?.[0]?.n || 0);
    }

    // Revenue in range
    // Revenue: prefer Payments; if none (0 or NULL), fallback to Bookings
    let revenue = 0;
    let paymentsRev = 0;
    if (hasPaymentsTable && hasPaymentsCreatedAt) {
      const r1Req = pool.request();
      if (hasRange) { r1Req.input('from', sql.DateTime2, fromDate).input('to', sql.DateTime2, toDate); }
      const r1 = await r1Req.query(`SELECT SUM(CAST(p.Amount AS DECIMAL(18,2))) AS rev
                FROM Payments p
                INNER JOIN Bookings b ON b.Id = p.BookingId
                WHERE 1=1
                  ${hasRange ? 'AND CAST(p.CreatedAt AS DATE) BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)' : ''}
                  AND (COALESCE(p.Status,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))
                  ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}`);
      paymentsRev = Number(r1.recordset?.[0]?.rev || 0);
    }
    if (!paymentsRev) {
      // Fallback: sum Bookings amounts by CheckOutDate and paid status
      const r2Req = pool.request();
      if (hasRange) { r2Req.input('from', sql.Date, fromDate).input('to', sql.Date, toDate); }
      const r2 = await r2Req.query(`SELECT SUM(CAST(COALESCE(${hasBookingsFinalAmount ? 'b.FinalAmount' : 'b.TotalAmount'}, 0) AS DECIMAL(18,2))) AS rev
                FROM Bookings b
                WHERE 1=1
                  ${hasRange ? 'AND CAST(b.CheckOutDate AS DATE) BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)' : ''}
                  ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
                  ${hasBookingsPaymentStatus ? "AND (COALESCE(b.PaymentStatus,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))" : ''}`);
      revenue = Number(r2.recordset?.[0]?.rev || 0);
      if (!revenue) {
        // Second fallback: sum by CheckInDate window
        const r3Req = pool.request();
        if (hasRange) { r3Req.input('from', sql.Date, fromDate).input('to', sql.Date, toDate); }
        const r3 = await r3Req.query(`SELECT SUM(CAST(COALESCE(${hasBookingsFinalAmount ? 'b.FinalAmount' : 'b.TotalAmount'}, 0) AS DECIMAL(18,2))) AS rev
                  FROM Bookings b
                  WHERE 1=1
                    ${hasRange ? 'AND CAST(b.CheckInDate AS DATE) BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)' : ''}
                    ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
                    ${hasBookingsPaymentStatus ? "AND (COALESCE(b.PaymentStatus,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))" : ''}`);
        revenue = Number(r3.recordset?.[0]?.rev || 0);
      }
    } else {
      revenue = paymentsRev;
    }

    // Available rooms now
    const roomsHasStatus = await tableHasColumn(pool, 'dbo.Rooms', 'Status');
    const rr = await pool.request().query(`SELECT COUNT(1) AS n FROM Rooms ${roomsHasStatus ? "WHERE Status COLLATE Vietnamese_CI_AI = 'Available'" : ''}`);
    const availableRooms = Number(rr.recordset?.[0]?.n || 0);

    // Total rooms overall (for statistics) irrespective of status
    let totalRooms = 0;
    try {
      const trRs = await pool.request().query('SELECT COUNT(1) AS n FROM Rooms');
      totalRooms = Number(trRs.recordset?.[0]?.n || 0);
    } catch { /* ignore */ }

    res.json({
      totalBookings,
      checkInsToday,
      checkInsCount,
      revenue,
      availableRooms,
      totalRooms
    });
  } catch (err) {
    console.error('reports summary error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy báo cáo tổng quan' });
  }
});

// GET /api/admin/reports/monthly?year=YYYY
app.get('/api/admin/reports/monthly', authorize(['Admin']), async (req, res) => {
  try {
    const pool = await getPool();
    const year = Number(req.query.year) || new Date().getFullYear();
    const hasBookingsStatus = await tableHasColumn(pool, 'dbo.Bookings', 'Status');
    const hasPaymentsTable = await pool.request()
      .query("SELECT 1 AS ok FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Payments') AND type in (N'U')")
      .then(r => !!r.recordset.length).catch(() => false);
    const hasPaymentsCreatedAt = hasPaymentsTable ? await tableHasColumn(pool, 'dbo.Payments', 'CreatedAt') : false;
    const hasBookingsFinalAmount = await tableHasColumn(pool, 'dbo.Bookings', 'FinalAmount');
    const hasBookingsPaymentStatus = await tableHasColumn(pool, 'dbo.Bookings', 'PaymentStatus');

    let rows = [];
    let rowsFromPayments = [];
    if (hasPaymentsTable && hasPaymentsCreatedAt) {
      const sqlText = `
        WITH X AS (
          SELECT MONTH(p.CreatedAt) AS m, SUM(CAST(p.Amount AS DECIMAL(18,2))) AS rev
          FROM Payments p
          INNER JOIN Bookings b ON b.Id = p.BookingId
          WHERE YEAR(p.CreatedAt) = @y
            AND (COALESCE(p.Status,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))
            ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
          GROUP BY MONTH(p.CreatedAt)
        )
        SELECT m, rev FROM X`;
      const rs = await pool.request().input('y', sql.Int, year).query(sqlText);
      rowsFromPayments = rs.recordset || [];
    }
    const paymentsTotal = (rowsFromPayments || []).reduce((s, r) => s + Number(r.rev || 0), 0);
    if (paymentsTotal > 0) {
      rows = rowsFromPayments;
    } else {
      const sqlText = `
        WITH X AS (
          SELECT MONTH(b.CheckOutDate) AS m,
                 SUM(CAST(COALESCE(${hasBookingsFinalAmount ? 'b.FinalAmount' : 'b.TotalAmount'},0) AS DECIMAL(18,2))) AS rev
          FROM Bookings b
          WHERE YEAR(b.CheckOutDate) = @y
            ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
            ${hasBookingsPaymentStatus ? "AND (COALESCE(b.PaymentStatus,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))" : ''}
          GROUP BY MONTH(b.CheckOutDate)
        )
        SELECT m, rev FROM X`;
      const rs = await pool.request().input('y', sql.Int, year).query(sqlText);
      rows = rs.recordset || [];
      const bookingsTotal = (rows || []).reduce((s, r) => s + Number(r.rev || 0), 0);
      if (!bookingsTotal) {
        // Second fallback: derive by CheckInDate month
        const sqlAlt = `
          WITH X AS (
            SELECT MONTH(b.CheckInDate) AS m,
                   SUM(CAST(COALESCE(${hasBookingsFinalAmount ? 'b.FinalAmount' : 'b.TotalAmount'},0) AS DECIMAL(18,2))) AS rev
            FROM Bookings b
            WHERE YEAR(b.CheckInDate) = @y
              ${hasBookingsStatus ? "AND (COALESCE(b.Status, N'') COLLATE Vietnamese_CI_AI <> N'Deleted')" : ''}
              ${hasBookingsPaymentStatus ? "AND (COALESCE(b.PaymentStatus,N'') COLLATE Vietnamese_CI_AI NOT IN (N'Canceled', N'Cancel', N'Huy', N'Hủy'))" : ''}
            GROUP BY MONTH(b.CheckInDate)
          )
          SELECT m, rev FROM X`;
        const rsAlt = await pool.request().input('y', sql.Int, year).query(sqlAlt);
        rows = rsAlt.recordset || [];
      }
    }

    // Ensure 12 months output
    const byMonth = new Map(rows.map(r => [Number(r.m), Number(r.rev || 0)]));
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: byMonth.get(i + 1) || 0 }));
    res.json({ year, months });
  } catch (err) {
    console.error('reports monthly error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy doanh thu theo tháng' });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
