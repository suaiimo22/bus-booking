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

// ================= REGISTER =================
app.post("/register", async (req, res) => {
try {
const { name, email, user_password } = req.body;

if (!name || !email || !user_password)
return res.status(400).json({ message: "Semua field wajib diisi" });

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

// ================= GET SCHEDULES =================
app.get("/schedules", async (req, res) => {
try {
const [results] = await db.query(`
SELECT
schedules.id,
buses.name AS bus_name,
routes.origin,
routes.destination,
schedules.departure_time,
schedules.arrival_time,
schedules.price
FROM schedules
JOIN buses ON schedules.bus_id = buses.id
JOIN routes ON schedules.route_id = routes.id
ORDER BY schedules.departure_time ASC
`);

res.json(results);

} catch {
res.status(500).json({ message: "Gagal ambil schedules" });
}
});

// ================= ADMIN CREATE SCHEDULE =================
app.post("/admin/schedules", verifyToken, verifyAdmin, async (req, res) => {
try {
const { bus_id, route_id, departure_time, arrival_time, price } = req.body;

if (!bus_id || !route_id || !departure_time || !price)
return res.status(400).json({ message: "Data tidak lengkap" });

await db.query(
`INSERT INTO schedules
(bus_id, route_id, departure_time, arrival_time, price)
VALUES (?, ?, ?, ?, ?)`,
[bus_id, route_id, departure_time, arrival_time, price]
);

res.json({ message: "Schedule berhasil dibuat" });

} catch {
res.status(500).json({ message: "Server error" });
}
});

// ================= BOOKING =================
app.post("/bookings", verifyToken, async (req, res) => {
try {
const { schedule_id, seat_number } = req.body;
const user_id = req.user.id;

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

// ================= DOWNLOAD TICKET =================
app.get("/ticket/:id", verifyToken, async (req, res) => {
try {
const bookingId = req.params.id;

const [results] = await db.query(`
SELECT b.*, s.price, r.origin, r.destination, u.name
FROM bookings b
JOIN schedules s ON b.schedule_id = s.id
JOIN routes r ON s.route_id = r.id
JOIN users u ON b.user_id = u.id
WHERE b.id = ?
`, [bookingId]);

if (results.length === 0)
return res.status(404).json({ message: "Booking tidak ditemukan" });

const booking = results[0];

if (booking.status !== "PAID")
return res.status(400).json({ message: "Tiket hanya bisa diunduh jika PAID" });

const doc = new PDFDocument();

res.setHeader("Content-Type", "application/pdf");
res.setHeader("Content-Disposition", `attachment; filename=ticket-${booking.id}.pdf`);

doc.pipe(res);
doc.fontSize(20).text("E-TICKET BUS", { align: "center" });
doc.moveDown();
doc.fontSize(14).text(`Nama: ${booking.name}`);
doc.text(`Rute: ${booking.origin} → ${booking.destination}`);
doc.text(`Seat: ${booking.seat_number}`);
doc.text(`Harga: Rp ${booking.price}`);
doc.text(`Booking ID: ${booking.id}`);
doc.end();

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