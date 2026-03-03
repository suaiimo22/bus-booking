require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const cors = require("cors");
const PDFDocument = require("pdfkit");

const db = require("./db");
const verifyToken = require("./middleware/verifyToken");
const startExpireJob = require("./services/expireService");

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
res.json({ status: "ok", message: "Bus Booking API running 🚀" });
});

/* ================= AUTO MIGRATION ================= */
async function autoMigrate() {
try {
await db.query(`ALTER TABLE schedules ADD COLUMN departure_time DATETIME NULL`).catch(()=>{});
await db.query(`ALTER TABLE schedules ADD COLUMN arrival_time DATETIME NULL`).catch(()=>{});
console.log("Migration checked ✅");
} catch {}
}
autoMigrate();

/* ================= REGISTER ================= */
app.post("/register", async (req, res) => {
try {
const { name, email, user_password } = req.body;

if (!name || !email || !user_password)
return res.status(400).json({ message: "Semua field wajib diisi" });

const [existing] = await db.query(
"SELECT id FROM users WHERE email = ?",
[email]
);

if (existing.length)
return res.status(400).json({ message: "Email sudah terdaftar" });

const hashed = await bcrypt.hash(user_password, 10);

await db.query(
"INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
[name, email, hashed]
);

res.json({ message: "Register berhasil" });
} catch (err) {
res.status(500).json({ message: "Server error", error: err.message });
}
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
try {
const { email, password } = req.body;

const [rows] = await db.query(
"SELECT * FROM users WHERE email = ?",
[email]
);

if (!rows.length)
return res.status(400).json({ message: "User tidak ditemukan" });

const user = rows[0];

const match = await bcrypt.compare(password, user.password);
if (!match)
return res.status(400).json({ message: "Password salah" });

const token = jwt.sign(
{ id: user.id, role: user.role },
process.env.SECRET_KEY,
{ expiresIn: "1h" }
);

res.json({ message: "Login berhasil", token });
} catch (err) {
res.status(500).json({ message: "Server error", error: err.message });
}
});

/* ================= FORCE ADMIN (DEV ONLY) ================= */
app.get("/make-admin", async (req, res) => {
if (process.env.NODE_ENV !== "development")
return res.status(403).send("Not allowed");

await db.query(`
UPDATE users
SET role = 'admin'
WHERE email = 'admin@email.com'
`);

res.send("User upgraded to admin ✅");
});

/* ================= GET SCHEDULES ================= */
app.get("/schedules", async (req, res) => {
try {
const [results] = await db.query(`
SELECT
s.id,
s.price,
s.departure_time,
s.arrival_time,
r.origin,
r.destination,
b.name AS bus_name,
b.total_seats
FROM schedules s
LEFT JOIN buses b ON s.bus_id = b.id
LEFT JOIN routes r ON s.route_id = r.id
ORDER BY s.id DESC
`);

res.json(results);
} catch (err) {
res.status(500).json({ message: "Query schedules gagal", error: err.message });
}
});

/* ================= ADMIN CREATE SCHEDULE ================= */
app.post("/admin/schedules", verifyToken, async (req, res) => {
try {
if (req.user.role !== "admin")
return res.status(403).json({ message: "Akses admin saja" });

const { bus_id, route_id, price, departure_time, arrival_time } = req.body;

const [result] = await db.query(`
INSERT INTO schedules
(bus_id, route_id, price, departure_time, arrival_time)
VALUES (?, ?, ?, ?, ?)
`, [bus_id, route_id, price, departure_time, arrival_time]);

res.json({ message: "Schedule berhasil dibuat", scheduleId: result.insertId });
} catch (err) {
res.status(500).json({ message: "Server error", error: err.message });
}
});

/* ================= BOOKING ================= */
app.post("/bookings", verifyToken, async (req, res) => {
try {
const { schedule_id, seat_number } = req.body;
const user_id = req.user.id;

const [seatCheck] = await db.query(`
SELECT * FROM bookings
WHERE schedule_id = ?
AND seat_number = ?
AND status IN ('PENDING','PAID')
AND (expired_at IS NULL OR expired_at > NOW())
`, [schedule_id, seat_number]);

if (seatCheck.length)
return res.status(400).json({ message: "Seat sudah dibooking" });

const expiredAt = new Date(Date.now() + 15 * 60 * 1000);

const [result] = await db.query(`
INSERT INTO bookings
(user_id, schedule_id, seat_number, status, expired_at)
VALUES (?, ?, ?, 'PENDING', ?)
`, [user_id, schedule_id, seat_number, expiredAt]);

res.json({ message: "Booking berhasil dibuat", bookingId: result.insertId });
} catch (err) {
res.status(500).json({ message: "Server error", error: err.message });
}
});

/* ================= PAYMENT ================= */
app.post("/pay/:id", verifyToken, async (req, res) => {
try {
const bookingId = req.params.id;

const [rows] = await db.query(
"SELECT * FROM bookings WHERE id = ?",
[bookingId]
);

if (!rows.length)
return res.status(404).json({ message: "Booking tidak ditemukan" });

const booking = rows[0];

if (booking.user_id !== req.user.id)
return res.status(403).json({ message: "Bukan booking milik Anda" });

if (booking.status !== "PENDING")
return res.status(400).json({ message: "Booking tidak bisa dibayar" });

await db.query(
"UPDATE bookings SET status='PAID' WHERE id = ?",
[bookingId]
);

res.json({ message: "Pembayaran berhasil ✅" });
} catch (err) {
res.status(500).json({ message: "Payment error", error: err.message });
}
});

/* ================= DOWNLOAD TICKET ================= */
app.get("/ticket/:id", verifyToken, async (req, res) => {
try {
const bookingId = req.params.id;

const [rows] = await db.query(`
SELECT
b.id as booking_id,
b.seat_number,
b.status,
b.user_id,
u.name as passenger_name,
s.departure_time,
s.arrival_time,
s.price,
r.origin,
r.destination,
bus.name as bus_name
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN schedules s ON b.schedule_id = s.id
JOIN routes r ON s.route_id = r.id
JOIN buses bus ON s.bus_id = bus.id
WHERE b.id = ?
`, [bookingId]);

if (!rows.length)
return res.status(404).json({ message: "Booking tidak ditemukan" });

const data = rows[0];

if (data.user_id !== req.user.id)
return res.status(403).json({ message: "Bukan tiket milik Anda" });

if (data.status !== "PAID")
return res.status(400).json({ message: "Tiket belum dibayar" });

res.setHeader("Content-Type", "application/pdf");
res.setHeader("Content-Disposition", `attachment; filename=ticket-${bookingId}.pdf`);

const doc = new PDFDocument({ margin: 50 });
doc.pipe(res);

doc.fontSize(22).text("BUS BOOKING E-TICKET", { align: "center" });
doc.moveDown();
doc.fontSize(14).text(`Booking ID: ${data.booking_id}`);
doc.text(`Nama Penumpang: ${data.passenger_name}`);
doc.text(`Bus: ${data.bus_name}`);
doc.text(`Rute: ${data.origin} → ${data.destination}`);
doc.text(`Seat: ${data.seat_number}`);
doc.text(`Harga: Rp ${data.price}`);
doc.text(`Departure: ${data.departure_time}`);
doc.text(`Arrival: ${data.arrival_time}`);
doc.moveDown();
doc.text("Status: PAID", { align: "right" });

doc.end();
} catch (err) {
res.status(500).json({ message: "Ticket error", error: err.message });
}
});

/* ================= AUTO EXPIRE ================= */
startExpireJob();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
console.log("Server berjalan di port", PORT);
});