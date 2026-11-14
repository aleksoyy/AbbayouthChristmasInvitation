require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const ExcelJS = require("exceljs");
const QRCode = require("qrcode");
const { PrismaClient, Prisma } = require("@prisma/client");
const { z } = require("zod");

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to a random string of at least 32 characters.");
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(cookieParser());
// Signed, persistent browser identifier. This is a browser-based restriction,
// not hardware identification: clearing cookies or using another browser can bypass it.
const DEVICE_COOKIE = "abbayouth_device";
const DEVICE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
function deviceCookieOptions(req) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DEVICE_MAX_AGE };
}
function readDeviceId(req) {
  const token = req.cookies[DEVICE_COOKIE];
  if (!token || typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"], issuer: "abbayouth-device" });
    return typeof payload.deviceId === "string" && /^[a-f0-9]{64}$/.test(payload.deviceId) ? payload.deviceId : null;
  } catch { return null; }
}
function ensureDevice(req, res, next) {
  let deviceId = readDeviceId(req);
  if (!deviceId) {
    deviceId = crypto.randomBytes(32).toString("hex");
    const token = jwt.sign({ deviceId }, JWT_SECRET, { algorithm: "HS256", issuer: "abbayouth-device", expiresIn: "365d" });
    res.cookie(DEVICE_COOKIE, token, deviceCookieOptions(req));
  }
  req.deviceId = deviceId;
  next();
}
app.use("/register", ensureDevice);
app.use("/api/register", ensureDevice);
app.use("/api/public/status", ensureDevice);
app.use("/api/public/my-registration", ensureDevice);
app.use("/success", ensureDevice);
app.use(express.static(path.join(__dirname, "public")));

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Silakan coba lagi beberapa saat." }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  phoneNumber: z.string().trim().min(8).max(20).regex(/^(?:\+62|62|0)[0-9]{7,15}$/),
  address: z.string().trim().min(3).max(1000),
  mentorName: z.string().trim().max(150).optional().default(""),
  churchName: z.string().trim().max(200).optional().default(""),
  informationSource: z.enum(["Instagram", "TikTok", "WhatsApp", "Teman / Keluarga", "Gereja", "Undangan", "Lainnya"]).optional().or(z.literal("")),
  informationSourceOther: z.string().trim().max(200).optional().default(""),
  submissionToken: z.string().uuid()
});

function authRequired(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: "Silakan login sebagai administrator." });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie("admin_token");
    return res.status(401).json({ error: "Sesi login berakhir. Silakan login kembali." });
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.get("/api/public/status", async (_req, res) => {
  const [registered, available] = await Promise.all([
    prisma.guest.count(),
    prisma.lotteryNumber.count({ where: { isUsed: false } })
  ]);
  const alreadyRegistered = Boolean(await prisma.guest.findUnique({ where: { deviceId: _req.deviceId }, select: { id: true } }));
  res.json({ full: available === 0, alreadyRegistered });
});

// Return only the registration tied to this browser's signed, HttpOnly cookie.
// Never accept a guest ID or ticket number from the client.
app.get("/api/public/my-registration", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { deviceId: req.deviceId },
      select: { fullName: true, lotteryNumber: true, registeredAt: true }
    });
    res.set("Cache-Control", "no-store");
    if (!guest) return res.status(404).json({ registered: false });
    return res.json({ registered: true, guest });
  } catch (error) {
    console.error("My registration lookup error:", error);
    return res.status(500).json({ error: "Tidak dapat memeriksa registrasi." });
  }
});

app.post("/api/register", registrationLimiter, async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Periksa kembali data yang wajib diisi dan format nomor handphone." });
  }
  const data = parsed.data;

  try {
    const guest = await prisma.$transaction(async (tx) => {
      // Idempotency: retrying the same request token returns its original registration.
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(20261225)`;
      const existing = await tx.guest.findUnique({ where: { submissionToken: data.submissionToken } });
      if (existing) return existing;
      const deviceGuest = await tx.guest.findUnique({ where: { deviceId: req.deviceId } });
      if (deviceGuest) throw new Error("DEVICE_ALREADY_REGISTERED");

      // Lock one available number. SKIP LOCKED allows concurrent registrations to
      // claim different numbers without assigning the same number twice.
      const rows = await tx.$queryRaw`
        SELECT number FROM "LotteryNumber"
        WHERE "isUsed" = false
        ORDER BY random()
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!rows.length) throw new Error("LOTTERY_FULL");
      const number = rows[0].number;
      await tx.lotteryNumber.update({
        where: { number },
        data: { isUsed: true, assignedAt: new Date() }
      });
      return tx.guest.create({
        data: {
          lotteryNumber: number,
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          address: data.address,
          mentorName: data.mentorName || null,
          churchName: data.churchName || null,
          informationSource: data.informationSource || null,
          informationSourceOther: data.informationSource === "Lainnya" ? (data.informationSourceOther || null) : null,
          submissionToken: data.submissionToken,
          deviceId: req.deviceId
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000, maxWait: 10000 });

    res.status(201).json({
      success: true,
      guest: { fullName: guest.fullName, lotteryNumber: guest.lotteryNumber, registeredAt: guest.registeredAt }
    });
  } catch (error) {
    if (error.message === "DEVICE_ALREADY_REGISTERED") return res.status(409).json({ error: "Perangkat/browser ini sudah digunakan untuk mendaftarkan satu peserta. Hubungi panitia jika ingin mengubah data." });
    if (error.message === "LOTTERY_FULL") return res.status(409).json({ error: "Mohon maaf, kuota peserta sudah penuh." });
    if (error.code === "P2002") return res.status(409).json({ error: "Perangkat/browser ini sudah pernah mendaftar atau permintaan terdeteksi duplikat." });
    console.error("Registration error:", { code: error.code, message: error.message, meta: error.meta, stack: error.stack });
    res.status(500).json({ error: "Registrasi belum berhasil disimpan. Silakan coba kembali." });
  }
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  const admin = await prisma.admin.findUnique({ where: { username } });
  const valid = admin && await bcrypt.compare(password, admin.passwordHash);
  if (!valid) return res.status(401).json({ error: "Username atau password tidak sesuai." });
  const token = jwt.sign({ sub: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: "8h" });
  res.cookie("admin_token", token, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000, path: "/"
  });
  res.json({ success: true, username: admin.username });
});

app.post("/api/admin/logout", authRequired, (_req, res) => {
  res.clearCookie("admin_token", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ success: true });
});

app.get("/api/admin/me", authRequired, (req, res) => res.json({ username: req.admin.username }));

app.get("/api/admin/dashboard", authRequired, async (_req, res) => {
  const [registered, available, capacity] = await Promise.all([
    prisma.guest.count(),
    prisma.lotteryNumber.count({ where: { isUsed: false } }),
    prisma.lotteryNumber.count()
  ]);
  // Guest records are the source of truth. A stale isUsed flag must not be
  // presented as a real registration; the repair action below fixes the pool.
  const used = registered;
  const outOfSync = capacity - available !== registered;
  res.json({ registered, available, used, capacity, outOfSync, progress: capacity ? Math.round(registered / capacity * 100) : 0 });
});

// Repair orphaned reserved numbers without deleting any guest records.
// All operations are serialized with registration, capacity changes and reset.
app.post("/api/admin/guests/reconcile", authRequired, sameOriginRequired, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(20261225)`;
      const guests = await tx.guest.findMany({ select: { lotteryNumber: true } });
      const assigned = guests.map((g) => g.lotteryNumber);
      const released = await tx.lotteryNumber.updateMany({
        where: { isUsed: true, ...(assigned.length ? { number: { notIn: assigned } } : {}) },
        data: { isUsed: false, assignedAt: null }
      });
      // When there are no guest records, release ALL reserved numbers.
      const restored = assigned.length ? await tx.lotteryNumber.updateMany({
        where: { number: { in: assigned }, isUsed: false },
        data: { isUsed: true }
      }) : { count: 0 };
      return { released: released.count, restored: restored.count, registered: guests.length };
    }, { timeout: 60000, maxWait: 15000 });
    console.info("Guest allocation reconciliation", { admin: req.admin.username, ...result });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Guest reconciliation failed:", error);
    res.status(500).json({ error: "Sinkronisasi gagal. Tidak ada perubahan parsial yang disimpan." });
  }
});

// All lottery mutations share one PostgreSQL advisory lock with registration.
// This prevents a capacity change or reset racing an incoming registration.
app.put("/api/admin/lottery/capacity", authRequired, sameOriginRequired, async (req, res) => {
  const capacity = req.body?.capacity;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
    return res.status(400).json({ error: "Kapasitas peserta harus berupa angka antara 1 dan 100.000." });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(20261225)`;
      const highestUsed = await tx.lotteryNumber.findFirst({ where: { isUsed: true }, orderBy: { number: "desc" } });
      if (highestUsed && highestUsed.number > capacity) throw new Error("CAPACITY_IN_USE");
      const current = await tx.lotteryNumber.count();
      if (capacity > current) {
        // Create the missing numbers without changing previously assigned numbers.
        const rows = Array.from({ length: capacity - current }, (_, i) => ({ number: current + i + 1 }));
        await tx.lotteryNumber.createMany({ data: rows, skipDuplicates: true });
      } else if (capacity < current) {
        await tx.lotteryNumber.deleteMany({ where: { number: { gt: capacity }, isUsed: false } });
      }
      return { capacity: await tx.lotteryNumber.count() };
    }, { timeout: 30000, maxWait: 10000 });
    console.info("Lottery capacity updated", { admin: req.admin.username, capacity: result.capacity });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.message === "CAPACITY_IN_USE") return res.status(409).json({ error: "Tidak dapat mengurangi kapasitas: ada nomor di atas batas baru yang masih digunakan. Hapus registrasi terkait atau lakukan reset terlebih dahulu." });
    console.error("Capacity update failed:", error);
    res.status(500).json({ error: "Gagal memperbarui kapasitas peserta." });
  }
});

app.post("/api/admin/lottery/reset", authRequired, sameOriginRequired, async (req, res) => {
  if (req.body?.confirmation !== "RESET PESERTA") {
    return res.status(400).json({ error: "Konfirmasi reset tidak valid." });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(20261225)`;
      const removed = await tx.guest.deleteMany({});
      await tx.lotteryNumber.updateMany({
        where: { OR: [{ isUsed: true }, { assignedAt: { not: null } }] },
        data: { isUsed: false, assignedAt: null }
      });
      return { deletedRegistrations: removed.count, capacity: await tx.lotteryNumber.count() };
    }, { timeout: 60000, maxWait: 15000 });
    console.warn("Lottery and guest registrations reset", { admin: req.admin.username, ...result });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Lottery reset failed:", { code: error.code, message: error.message, meta: error.meta, stack: error.stack });
    res.status(500).json({ error: "Reset gagal. Data tidak diubah jika transaksi gagal." });
  }
});

app.get("/api/admin/guests", authRequired, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(req.query.pageSize, 10) || 20));
  const search = String(req.query.search || "").trim().slice(0, 100);
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00+07:00`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999+07:00`) : null;
  const where = {
    ...(search ? { OR: [
      { fullName: { contains: search, mode: "insensitive" } },
      { phoneNumber: { contains: search } },
      ...(Number.isInteger(Number(search)) && Number(search) >= 1 && Number(search) <= 100000 ? [{ lotteryNumber: Number(search) }] : [])
    ] } : {}),
    ...(from || to ? { registeredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
  };
  const allowedSort = ["registeredAt", "fullName", "lotteryNumber"];
  const sort = allowedSort.includes(req.query.sort) ? req.query.sort : "registeredAt";
  const direction = req.query.direction === "asc" ? "asc" : "desc";
  const [total, guests] = await Promise.all([
    prisma.guest.count({ where }),
    prisma.guest.findMany({ where, orderBy: { [sort]: direction }, skip: (page - 1) * pageSize, take: pageSize })
  ]);
  res.json({ guests, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// Delete the guest and return its lottery number to the available pool atomically.
// Only cancel registrations whose issued tickets should no longer be honored.
function sameOriginRequired(req, res, next) {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!origin || !host) return res.status(403).json({ error: "Origin permintaan tidak valid." });
  try {
    const parsed = new URL(origin);
    if (parsed.host !== host || !["http:", "https:"].includes(parsed.protocol)) {
      return res.status(403).json({ error: "Origin permintaan tidak diizinkan." });
    }
  } catch { return res.status(403).json({ error: "Origin permintaan tidak valid." }); }
  next();
}

app.delete("/api/admin/guests/:id", authRequired, sameOriginRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(req.params.id)) {
    return res.status(400).json({ error: "ID registrasi tidak valid." });
  }
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      // Deleting the guest releases the unique relation to its lottery number.
      // The number remains unavailable until the same transaction commits.
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(20261225)`;
      const guest = await tx.guest.delete({ where: { id: req.params.id } });
      const released = await tx.lotteryNumber.updateMany({
        where: { number: guest.lotteryNumber, isUsed: true },
        data: { isUsed: false, assignedAt: null }
      });
      if (released.count !== 1) throw new Error("LOTTERY_RELEASE_FAILED");
      return guest;
    }, { timeout: 30000, maxWait: 10000 });
    console.info("Admin deleted registration and released lottery number", { admin: req.admin.username, guestId: deleted.id, lotteryNumber: deleted.lotteryNumber });
    return res.json({ success: true, lotteryNumber: deleted.lotteryNumber, numberReleased: true });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "Data registrasi tidak ditemukan." });
    if (error.message === "LOTTERY_RELEASE_FAILED") return res.status(409).json({ error: "Status nomor undian tidak sesuai. Data tidak dihapus; hubungi administrator teknis." });
    console.error("Admin guest deletion failed:", error);
    return res.status(500).json({ error: "Gagal menghapus data registrasi." });
  }
});

app.get("/api/admin/export", authRequired, async (_req, res) => {
  const guests = await prisma.guest.findMany({ orderBy: { registeredAt: "asc" } });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Abbayouth Christmas Registration";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Registrasi Pengunjung");
  sheet.columns = [
    { header: "Nomor", key: "row", width: 9 },
    { header: "Nomor Undian", key: "lotteryNumber", width: 16 },
    { header: "Nama Lengkap", key: "fullName", width: 28 },
    { header: "Nomor Handphone", key: "phoneNumber", width: 20 },
    { header: "Alamat", key: "address", width: 38 },
    { header: "Nama Pemurid", key: "mentorName", width: 24 },
    { header: "Gereja Asal", key: "churchName", width: 25 },
    { header: "Sumber Informasi", key: "informationSource", width: 22 },
    { header: "Sumber Informasi Lainnya", key: "informationSourceOther", width: 28 },
    { header: "Waktu Registrasi (WIB)", key: "registeredAt", width: 25 }
  ];
  guests.forEach((g, i) => sheet.addRow({
    row: i + 1, lotteryNumber: g.lotteryNumber, fullName: g.fullName,
    phoneNumber: g.phoneNumber, address: g.address, mentorName: g.mentorName || "",
    churchName: g.churchName || "", informationSource: g.informationSource || "",
    informationSourceOther: g.informationSourceOther || "",
    registeredAt: new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Jakarta" }).format(g.registeredAt)
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123D2B" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "J1" };
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Abbayouth_Christmas_Registration_${date}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

app.get("/api/admin/qr", authRequired, async (_req, res) => {
  const baseUrl = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
  const png = await QRCode.toBuffer(`${baseUrl}/register`, { width: 700, margin: 2, color: { dark: "#10234D", light: "#FFFFFF" } });
  res.type("png").send(png);
});

app.get("/", (_req, res) => res.redirect("/register"));
app.get("/register", (_req, res) => res.sendFile(path.join(__dirname, "public", "register.html")));
app.get("/success", (_req, res) => res.sendFile(path.join(__dirname, "public", "success.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

app.listen(PORT, () => console.log(`Abbayouth registration running at http://localhost:${PORT}`));
