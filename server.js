require("dotenv").config();
const express = require("express");
const path = require("path");
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
  res.json({ registered, available, capacity: 500, full: available === 0 });
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
      const existing = await tx.guest.findUnique({ where: { submissionToken: data.submissionToken } });
      if (existing) return existing;

      // Lock one available number. SKIP LOCKED allows concurrent registrations to
      // claim different numbers without assigning the same number twice.
      const rows = await tx.$queryRaw`
        SELECT number FROM "LotteryNumber"
        WHERE "isUsed" = false
        ORDER BY random()
        FOR UPDATE SKIP LOCKED
        LIMIT 1
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
          submissionToken: data.submissionToken
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    res.status(201).json({
      success: true,
      guest: { fullName: guest.fullName, lotteryNumber: guest.lotteryNumber, registeredAt: guest.registeredAt }
    });
  } catch (error) {
    if (error.message === "LOTTERY_FULL") return res.status(409).json({ error: "Kuota registrasi dan nomor undian 1–500 sudah penuh." });
    if (error.code === "P2002") return res.status(409).json({ error: "Permintaan registrasi terdeteksi duplikat. Silakan muat ulang halaman." });
    console.error("Registration error:", error);
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
  const [registered, available] = await Promise.all([
    prisma.guest.count(),
    prisma.lotteryNumber.count({ where: { isUsed: false } })
  ]);
  res.json({ registered, available, used: 500 - available, capacity: 500, progress: Math.round(registered / 500 * 100) });
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
      ...(Number.isInteger(Number(search)) && Number(search) >= 1 && Number(search) <= 500 ? [{ lotteryNumber: Number(search) }] : [])
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
  const png = await QRCode.toBuffer(`${baseUrl}/register`, { width: 700, margin: 2, color: { dark: "#123D2B", light: "#FFFFFF" } });
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
