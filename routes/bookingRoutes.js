const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/verifyToken");


// ================= CREATE BOOKING =================
router.post("/bookings", verifyToken, (req, res) => {
const { schedule_id, seat_number } = req.body;
const user_id = req.user.id;

if (!schedule_id || !seat_number) {
return res.status(400).json({
message: "schedule_id dan seat_number wajib diisi"
});
}

const checkSeatSql = `
SELECT * FROM bookings
WHERE schedule_id = ?
AND seat_number = ?
AND status IN ('PENDING','PAID')
`;

db.query(checkSeatSql, [schedule_id, seat_number], (err, results) => {
if (err) return res.status(500).json({ message: "Database error" });

if (results.length > 0) {
return res.status(400).json({ message: "Seat sudah dibooking" });
}

const expiredAt = new Date(Date.now() + 15 * 60 * 1000);

const sql = `
INSERT INTO bookings
(user_id, schedule_id, seat_number, status, expired_at)
VALUES (?, ?, ?, 'PENDING', ?)
`;

db.query(sql, [user_id, schedule_id, seat_number, expiredAt], (err, result) => {
if (err) return res.status(500).json({ message: "Insert error" });

res.json({
message: "Booking berhasil dibuat",
bookingId: result.insertId,
expired_at: expiredAt
});
});
});
});


// ================= MY BOOKINGS =================
router.get("/bookings/my", verifyToken, (req, res) => {
const user_id = req.user.id;

const sql = `
SELECT
bookings.id,
schedules.origin,
schedules.destination,
schedules.price,
bookings.seat_number,
bookings.status,
bookings.created_at
FROM bookings
JOIN schedules ON bookings.schedule_id = schedules.id
WHERE bookings.user_id = ?
ORDER BY bookings.created_at DESC
`;

db.query(sql, [user_id], (err, results) => {
if (err) {
return res.status(500).json({ message: "Database error" });
}

res.json(results);
});
});

// ================= CANCEL BOOKING =================
router.put("/bookings/cancel/:id", verifyToken, (req, res) => {
const bookingId = req.params.id;
const user_id = req.user.id;

const sql = `
UPDATE bookings
SET status = 'CANCELLED'
WHERE id = ? AND user_id = ?
`;

db.query(sql, [bookingId, user_id], (err, result) => {
if (err) {
return res.status(500).json({
message: "Database error"
});
}

if (result.affectedRows === 0) {
return res.status(400).json({
message: "Booking tidak ditemukan"
});
}

res.json({
message: "Booking berhasil dibatalkan"
});
});
});

// ================= PAYMENT =================
router.post("/bookings/:id/pay", verifyToken, (req, res) => {
const bookingId = req.params.id;

db.query("SELECT * FROM bookings WHERE id = ?", [bookingId], (err, results) => {
if (err) return res.status(500).json({ message: "Database error" });

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

db.query(
"UPDATE bookings SET status = 'PAID' WHERE id = ?",
[bookingId],
(err) => {
if (err) return res.status(500).json({ message: "Update error" });

res.json({ message: "Pembayaran berhasil (simulasi)" });
}
);
});
});

// ================= GET BOOKED SEATS =================
router.get("/bookings/seats/:scheduleId", verifyToken, (req, res) => {
const scheduleId = req.params.scheduleId;

const sql = `
SELECT seat_number
FROM bookings
WHERE schedule_id = ?
AND status IN ('PENDING','PAID')
`;

db.query(sql, [scheduleId], (err, results) => {
if (err) {
return res.status(500).json({ message: "Database error" });
}

const bookedSeats = results.map(row => row.seat_number);
res.json(bookedSeats);
});
});

module.exports = router;