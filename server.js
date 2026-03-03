require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const db = require("./db");
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
s.id,
s.price,
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
console.error("SCHEDULE ERROR:", err);
res.status(500).json({
message: "Query schedules gagal",
error: err.message
});
}
});


// ================= LINK SCHEDULE TO BUS & ROUTE =================
app.get("/link-schedule", async (req, res) => {
try {

await db.query(`
UPDATE schedules
SET bus_id = 1,
route_id = 1
WHERE id = 1
`);

res.send("Schedule linked successfully ✅");

} catch (err) {
res.status(500).json(err);
}
});


// ================= GET SEATS =================
app.get("/seats/:scheduleId", async (req, res) => {
try {
const scheduleId = req.params.scheduleId;

const [scheduleData] = await db.query(`
SELECT b.total_seats
FROM schedules s
LEFT JOIN buses b ON s.bus_id = b.id
WHERE s.id = ?
`, [scheduleId]);

if (!scheduleData.length)
return res.status(404).json({ message: "Schedule tidak ditemukan" });

const totalSeats = scheduleData[0].total_seats || 40;

const [bookedSeats] = await db.query(`
SELECT seat_number
FROM bookings
WHERE schedule_id = ?
AND status IN ('PENDING','PAID')
AND (expired_at IS NULL OR expired_at > NOW())
`, [scheduleId]);

res.json({
total_seats: totalSeats,
booked: bookedSeats
});

} catch (err) {
console.error("SEAT ERROR:", err);
res.status(500).json({ message: "Server error" });
}
});


// ================= BOOKING =================
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

res.json({
message: "Booking berhasil dibuat",
bookingId: result.insertId
});

} catch (err) {
console.error("BOOKING ERROR:", err);
res.status(500).json({ message: "Server error" });
}
});


// ================= AUTO EXPIRE =================
startExpireJob();

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
console.log("Server berjalan di port", PORT);
});