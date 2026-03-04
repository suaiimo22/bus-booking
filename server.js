require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const db = require("./db");
const verifyToken = require("./middleware/verifyToken");
const startExpireJob = require("./services/expireService");

const adminRoutes = require("./routes/adminRoutes");

/* ================= MIDDLEWARE ================= */

app.use(
helmet({
contentSecurityPolicy: false
})
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= ROOT ================= */

app.get("/", (req, res) => {
res.json({
status: "ok",
message: "Bus Booking API running 🚀"
});
});

/* ================= REGISTER ================= */

app.post("/register", async (req, res) => {
try {
const { name, email, user_password } = req.body;

if (!name || !email || !user_password) {
return res.status(400).json({
message: "Semua field wajib diisi"
});
}

const [existing] = await db.query(
`SELECT id FROM users WHERE email=?`,
[email]
);

if (existing.length) {
return res.status(400).json({
message: "Email sudah terdaftar"
});
}

const hashed = await bcrypt.hash(user_password, 10);

await db.query(
`INSERT INTO users (name,email,password,role) VALUES (?,?,?,'user')`,
[name, email, hashed]
);

res.json({ message: "Register berhasil" });

} catch (err) {
res.status(500).json({
message: "Server error",
error: err.message
});
}
});

/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
try {

const { email, password } = req.body;

const [rows] = await db.query(
`SELECT * FROM users WHERE email=?`,
[email]
);

if (!rows.length) {
return res.status(400).json({
message: "User tidak ditemukan"
});
}

const user = rows[0];

const match = await bcrypt.compare(password, user.password);

if (!match) {
return res.status(400).json({
message: "Password salah"
});
}

const token = jwt.sign(
{
id: user.id,
role: user.role
},
process.env.SECRET_KEY,
{
expiresIn: "1h"
}
);

res.json({
message: "Login berhasil",
token
});

} catch (err) {

res.status(500).json({
message: "Server error",
error: err.message
});

}
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
LEFT JOIN buses b ON s.bus_id=b.id
LEFT JOIN routes r ON s.route_id=r.id
ORDER BY s.id DESC
`);

res.json(results);

} catch (err) {

res.status(500).json({
message: "Query schedules gagal",
error: err.message
});

}
});

/* ================= CREATE BOOKING ================= */

app.post("/bookings", verifyToken, async (req, res) => {

try {

const { schedule_id, seat_number } = req.body;
const user_id = req.user.id;

const [seatCheck] = await db.query(`
SELECT * FROM bookings
WHERE schedule_id=?
AND seat_number=?
AND status IN ('PENDING','PAID')
AND (expired_at IS NULL OR expired_at>NOW())
`, [schedule_id, seat_number]);

if (seatCheck.length) {
return res.status(400).json({
message: "Seat sudah dibooking"
});
}

const expiredAt = new Date(Date.now() + 15 * 60 * 1000);

const [result] = await db.query(`
INSERT INTO bookings
(user_id,schedule_id,seat_number,status,expired_at)
VALUES (?,?,?,'PENDING',?)
`, [user_id, schedule_id, seat_number, expiredAt]);

res.json({
message: "Booking berhasil dibuat",
bookingId: result.insertId
});

} catch (err) {

res.status(500).json({
message: "Server error",
error: err.message
});

}

});

/* ================= MY BOOKINGS ================= */

app.get("/my-bookings", verifyToken, async (req, res) => {

try {

const user_id = req.user.id;

const [rows] = await db.query(`
SELECT
b.id,
b.seat_number,
b.status,
b.expired_at,
s.price,
r.origin,
r.destination,
bus.name as bus_name
FROM bookings b
JOIN schedules s ON b.schedule_id=s.id
JOIN routes r ON s.route_id=r.id
JOIN buses bus ON s.bus_id=bus.id
WHERE b.user_id=?
ORDER BY b.id DESC
`, [user_id]);

res.json(rows);

} catch (err) {

res.status(500).json({
message: "Error ambil booking",
error: err.message
});

}

});

/* ================= PAYMENT ================= */

app.post("/pay/:id", verifyToken, async (req, res) => {

try {

const bookingId = req.params.id;

const [rows] = await db.query(
`SELECT * FROM bookings WHERE id=?`,
[bookingId]
);

if (!rows.length) {
return res.status(404).json({
message: "Booking tidak ditemukan"
});
}

const booking = rows[0];

if (booking.user_id !== req.user.id) {
return res.status(403).json({
message: "Bukan booking milik Anda"
});
}

if (booking.status !== "PENDING") {
return res.status(400).json({
message: "Booking tidak bisa dibayar"
});
}

await db.query(
`UPDATE bookings SET status='PAID' WHERE id=?`,
[bookingId]
);

res.json({
message: "Pembayaran berhasil ✅"
});

} catch (err) {

res.status(500).json({
message: "Payment error",
error: err.message
});

}

});

/* ================= GET BOOKED SEATS ================= */

app.get("/bookings/seats/:scheduleId", async (req, res) => {

try {

const scheduleId = req.params.scheduleId;

const [rows] = await db.query(
`SELECT seat_number FROM bookings
WHERE schedule_id=?
AND status IN ('PENDING','PAID')`,
[scheduleId]
);

const seats = rows.map(r => r.seat_number);

res.json(seats);

} catch (err) {

res.status(500).json({
message: "Error ambil seat",
error: err.message
});

}

});

/* ================= DOWNLOAD TICKET PDF ================= */

app.get("/ticket/:id", verifyToken, async (req, res) => {

try {

const bookingId = req.params.id;

const [rows] = await db.query(`
SELECT
b.id,
b.seat_number,
s.price,
r.origin,
r.destination,
bus.name as bus_name
FROM bookings b
JOIN schedules s ON b.schedule_id=s.id
JOIN routes r ON s.route_id=r.id
JOIN buses bus ON s.bus_id=bus.id
WHERE b.id=?
`, [bookingId]);

if (!rows.length) {
return res.status(404).json({
message: "Ticket tidak ditemukan"
});
}

const ticket = rows[0];

const doc = new PDFDocument({
size: "A4",
margin: 50
});

res.setHeader("Content-Type", "application/pdf");
res.setHeader("Content-Disposition", "attachment; filename=ticket.pdf");

doc.pipe(res);

/* HEADER */

doc.rect(0, 0, 600, 90).fill("#315B4F");

doc.fillColor("white")
.fontSize(24)
.text("SAWAH JAYA BUS", 50, 35);

/* BODY */

doc.moveDown(4);

doc.fillColor("black");

doc.fontSize(20).text(
`${ticket.origin} → ${ticket.destination}`,
{ align: "center" }
);

doc.moveDown(2);

doc.fontSize(14);

doc.text(`Bus : ${ticket.bus_name}`);
doc.text(`Seat : ${ticket.seat_number}`);
doc.text(`Price : Rp ${ticket.price}`);

doc.moveDown();

/* QR CODE */

const qrData = `TICKET-${ticket.id}-SEAT-${ticket.seat_number}`;

const qrImage = await QRCode.toDataURL(qrData);

doc.image(qrImage, {
fit: [150, 150],
align: "center"
});

doc.moveDown();

doc.fontSize(12)
.fillColor("#315B4F")
.text("Scan QR ini saat boarding", {
align: "center"
});

doc.end();

} catch (err) {

res.status(500).json({
message: "Error generate ticket",
error: err.message
});

}

});

/* ================= ADMIN ROUTES ================= */

app.use(adminRoutes);

/* ================= AUTO EXPIRE ================= */

startExpireJob();

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
console.log("Server berjalan di port", PORT);
});