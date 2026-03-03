require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");

const db = require("./db");
const verifyAdmin = require("./middleware/verifyAdmin");
const verifyToken = require("./middleware/verifyToken");
const startExpireJob = require("./services/expireService");

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= ROOT =================
app.get("/", (req, res) => {
res.json({ status: "ok", message: "Bus Booking API running" });
});

// ================= MIGRATION V2 =================
app.get("/migrate-v2", async (req, res) => {
try {

await db.query(`
CREATE TABLE IF NOT EXISTS buses (
id INT AUTO_INCREMENT PRIMARY KEY,
name VARCHAR(100) NOT NULL,
plate_number VARCHAR(50),
total_seats INT NOT NULL,
bus_class VARCHAR(50),
status VARCHAR(20) DEFAULT 'ACTIVE',
image VARCHAR(255),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);

await db.query(`
CREATE TABLE IF NOT EXISTS routes (
id INT AUTO_INCREMENT PRIMARY KEY,
origin VARCHAR(100) NOT NULL,
destination VARCHAR(100) NOT NULL,
distance INT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);

await db.query(`
ALTER TABLE schedules
ADD COLUMN bus_id INT,
ADD COLUMN route_id INT
`).catch(() => {});

res.send("Migration V2 success ✅");

} catch (err) {
res.status(500).json(err);
}
});

// ================= REGISTER =================
app.post("/register", async (req, res) => {
try {
const { name, email, user_password } = req.body;

if (!name || !email || !user_password) {
return res.status(400).json({ message: "Semua field wajib diisi" });
}

const hashedPassword = await bcrypt.hash(user_password, 10);

await db.query(
"INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
[name, email, hashedPassword]
);

res.json({ message: "Register berhasil" });

} catch {
res.status(500).json({ message: "Email sudah terdaftar atau server error" });
}
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
try {
const { email, password } = req.body;

const [results] = await db.query(
"SELECT * FROM users WHERE email = ?",
[email]
);

if (results.length === 0)
return res.status(400).json({ message: "User tidak ditemukan" });

const user = results[0];

const isMatch = await bcrypt.compare(password, user.password);
if (!isMatch)
return res.status(400).json({ message: "Password salah" });

const token = jwt.sign(
{ id: user.id, email: user.email, role: user.role },
process.env.SECRET_KEY,
{ expiresIn: "1h" }
);

res.json({ message: "Login berhasil", token });

} catch {
res.status(500).json({ message: "Server error" });
}
});

// ================= SCHEDULES =================
app.get("/schedules", async (req, res) => {
try {
const [results] = await db.query("SELECT * FROM schedules");
res.json(results);
} catch {
res.status(500).json({ message: "Gagal ambil data schedules" });
}
});

// ================= BOOKING =================
app.post("/bookings", verifyToken, async (req, res) => {
try {
const { schedule_id, seat_number } = req.body;
const user_id = req.user.id;

if (!schedule_id || !seat_number)
return res.status(400).json({
message: "schedule_id dan seat_number wajib diisi"
});

const [seatCheck] = await db.query(
`SELECT * FROM bookings
WHERE schedule_id = ?
AND seat_number = ?
AND status IN ('PENDING','PAID')
AND (expired_at IS NULL OR expired_at > NOW())`,
[schedule_id, seat_number]
);

if (seatCheck.length > 0)
return res.status(400).json({ message: "Seat sudah dibooking" });

const expiredAt = new Date(Date.now() + 15 * 60 * 1000);

const [result] = await db.query(
`INSERT INTO bookings
(user_id, schedule_id, seat_number, status, expired_at)
VALUES (?, ?, ?, 'PENDING', ?)`,
[user_id, schedule_id, seat_number, expiredAt]
);

res.json({
message: "Booking berhasil dibuat",
bookingId: result.insertId,
expired_at: expiredAt
});

} catch {
res.status(500).json({ message: "Server error" });
}
});

// ================= PAYMENT =================
app.post("/bookings/:id/pay", verifyToken, async (req, res) => {
try {
const bookingId = req.params.id;

const [results] = await db.query(
"SELECT * FROM bookings WHERE id = ?",
[bookingId]
);

if (results.length === 0)
return res.status(404).json({ message: "Booking tidak ditemukan" });

const booking = results[0];

if (booking.status === "PAID")
return res.status(400).json({ message: "Sudah dibayar" });

if (booking.expired_at && new Date(booking.expired_at) < new Date()) {
await db.query(
"UPDATE bookings SET status = 'EXPIRED' WHERE id = ?",
[bookingId]
);
return res.status(400).json({ message: "Booking sudah expired" });
}

await db.query(
"UPDATE bookings SET status = 'PAID', paid_at = NOW() WHERE id = ?",
[bookingId]
);

res.json({ message: "Pembayaran berhasil (simulasi)" });

} catch {
res.status(500).json({ message: "Server error" });
}
});

// ================= AUTO EXPIRE =================
startExpireJob();

// ================= START SERVER =================
const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
console.log("Server berjalan di port", PORT);
});