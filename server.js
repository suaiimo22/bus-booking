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

// ================= ROUTE UTAMA =================
app.get("/", (req, res) => {
res.send("Server Bus Booking Berjalan 🚀");
});

// ================= REGISTER =================
app.post("/register", async (req, res) => {
try {
const { name, email, user_password } = req.body;

if (!name || !email || !user_password) {
return res.status(400).json({
message: "Semua field wajib diisi"
});
}

const hashedPassword = await bcrypt.hash(user_password, 10);

await db.query(
"INSERT INTO users (name, email, user_password) VALUES (?, ?, ?)",
[name, email, hashedPassword]
);

res.json({ message: "Register berhasil" });

} catch (error) {
console.error("REGISTER ERROR:", error);
res.status(500).json({
message: "Email sudah terdaftar atau server error"
});
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

if (results.length === 0) {
return res.status(400).json({ message: "User tidak ditemukan" });
}

const user = results[0];

const isMatch = await bcrypt.compare(password, user.user_password);

if (!isMatch) {
return res.status(400).json({ message: "Password salah" });
}

const token = jwt.sign(
{ id: user.id, email: user.email, role: user.role },
process.env.SECRET_KEY,
{ expiresIn: "1h" }
);

res.json({
message: "Login berhasil",
token
});

} catch (error) {
console.error("LOGIN ERROR:", error);
res.status(500).json({ message: "Server error" });
}
});

// ================= SCHEDULES =================
app.get("/schedules", async (req, res) => {
try {
const [results] = await db.query("SELECT * FROM schedules");
res.json(results);
} catch (error) {
console.error("SCHEDULE ERROR:", error);
res.status(500).json({ message: "Gagal ambil data schedules" });
}
});

// ================= BOOKING =================
app.post("/bookings", verifyToken, async (req, res) => {
try {
const { schedule_id, seat_number } = req.body;
const user_id = req.user.id;

if (!schedule_id || !seat_number) {
return res.status(400).json({
message: "schedule_id dan seat_number wajib diisi"
});
}

const [seatCheck] = await db.query(
`SELECT * FROM bookings
WHERE schedule_id = ?
AND seat_number = ?
AND status IN ('PENDING','PAID')`,
[schedule_id, seat_number]
);

if (seatCheck.length > 0) {
return res.status(400).json({ message: "Seat sudah dibooking" });
}

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

} catch (error) {
console.error("BOOKING ERROR:", error);
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

if (results.length === 0) {
return res.status(404).json({ message: "Booking tidak ditemukan" });
}

const booking = results[0];

if (booking.status === "EXPIRED") {
return res.status(400).json({ message: "Booking sudah expired" });
}

if (booking.status === "PAID") {
return res.status(400).json({ message: "Sudah dibayar" });
}

await db.query(
"UPDATE bookings SET status = 'PAID' WHERE id = ?",
[bookingId]
);

res.json({ message: "Pembayaran berhasil (simulasi)" });

} catch (error) {
console.error("PAYMENT ERROR:", error);
res.status(500).json({ message: "Server error" });
}
});

// ================= DOWNLOAD E-TICKET =================
app.get("/ticket/:id", verifyToken, async (req, res) => {
try {
const bookingId = req.params.id;

const [results] = await db.query(
`SELECT b.*, s.origin, s.destination, s.price, u.name
FROM bookings b
JOIN schedules s ON b.schedule_id = s.id
JOIN users u ON b.user_id = u.id
WHERE b.id = ?`,
[bookingId]
);

if (results.length === 0) {
return res.status(404).json({ message: "Booking tidak ditemukan" });
}

const booking = results[0];

if (booking.status !== "PAID") {
return res.status(400).json({
message: "Tiket hanya bisa diunduh jika sudah PAID"
});
}

const doc = new PDFDocument();

res.setHeader("Content-Type", "application/pdf");
res.setHeader(
"Content-Disposition",
`attachment; filename=ticket-${booking.id}.pdf`
);

doc.pipe(res);

doc.fontSize(20).text("E-TICKET BUS", { align: "center" });
doc.moveDown();

doc.fontSize(14).text(`Nama: ${booking.name}`);
doc.text(`Rute: ${booking.origin} → ${booking.destination}`);
doc.text(`Seat: ${booking.seat_number}`);
doc.text(`Harga: Rp ${booking.price}`);
doc.text(`Booking ID: ${booking.id}`);
doc.text(`Status: ${booking.status}`);

doc.end();

} catch (error) {
console.error("TICKET ERROR:", error);
res.status(500).json({ message: "Server error" });
}
});

// ================= ADMIN BOOKINGS =================
app.get("/admin/bookings", verifyToken, verifyAdmin, async (req, res) => {
try {
const [results] = await db.query(`
SELECT
bookings.id,
users.name,
users.email,
schedules.origin,
schedules.destination,
schedules.price,
bookings.seat_number,
bookings.status,
bookings.created_at
FROM bookings
JOIN users ON bookings.user_id = users.id
JOIN schedules ON bookings.schedule_id = schedules.id
ORDER BY bookings.created_at DESC
`);

res.json(results);

} catch (error) {
console.error("ADMIN ERROR:", error);
res.status(500).json({
message: "Gagal ambil data booking"
});
}
});

// ================= AUTO EXPIRE =================
// startExpireJob();

// ================= START SERVER =================
const PORT = process.env.PORT;

app.listen(PORT, () => {
console.log("Server berjalan di port", PORT);
});