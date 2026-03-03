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

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
res.json({ status: "ok", message: "Bus Booking API running" });
});

// ================= GET SCHEDULES =================
app.get("/schedules", async (req, res) => {
try {
const [results] = await db.query(`
SELECT
schedules.id,
buses.name AS bus_name,
buses.total_seats,
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

// ================= GET SEAT INFO =================
app.get("/seats/:scheduleId", async (req, res) => {
try {
const scheduleId = req.params.scheduleId;

const [scheduleData] = await db.query(`
SELECT buses.total_seats
FROM schedules
JOIN buses ON schedules.bus_id = buses.id
WHERE schedules.id = ?
`, [scheduleId]);

if (scheduleData.length === 0)
return res.status(404).json({ message: "Schedule tidak ditemukan" });

const totalSeats = scheduleData[0].total_seats;

const [bookedSeats] = await db.query(`
SELECT seat_number, status
FROM bookings
WHERE schedule_id = ?
AND status IN ('PENDING','PAID')
AND (expired_at IS NULL OR expired_at > NOW())
`, [scheduleId]);

res.json({
total_seats: totalSeats,
booked: bookedSeats
});

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

// ================= ADMIN ANALYTICS =================

// Total Revenue
app.get("/admin/revenue", verifyToken, verifyAdmin, async (req, res) => {
try {
const [result] = await db.query(`
SELECT SUM(s.price) AS total_revenue
FROM bookings b
JOIN schedules s ON b.schedule_id = s.id
WHERE b.status = 'PAID'
`);

res.json(result[0]);

} catch {
res.status(500).json({ message: "Server error" });
}
});

// Occupancy Rate per Schedule
app.get("/admin/occupancy", verifyToken, verifyAdmin, async (req, res) => {
try {
const [result] = await db.query(`
SELECT
schedules.id,
buses.name AS bus_name,
routes.origin,
routes.destination,
buses.total_seats,
COUNT(b.id) AS sold_seats,
(COUNT(b.id) / buses.total_seats) * 100 AS occupancy_percent
FROM schedules
JOIN buses ON schedules.bus_id = buses.id
JOIN routes ON schedules.route_id = routes.id
LEFT JOIN bookings b
ON b.schedule_id = schedules.id
AND b.status = 'PAID'
GROUP BY schedules.id
`);

res.json(result);

} catch {
res.status(500).json({ message: "Server error" });
}
});

// ================= AUTO EXPIRE =================
startExpireJob();

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
console.log("Server berjalan di port", PORT);
});