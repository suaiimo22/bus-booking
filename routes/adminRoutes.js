const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");

/* ======================================================
ADMIN - DASHBOARD SUMMARY
====================================================== */
router.get("/admin/dashboard", verifyToken, verifyAdmin, (req, res) => {

const sql = `
SELECT
COUNT(*) AS totalBookings,
SUM(CASE WHEN b.status = 'PENDING' THEN 1 ELSE 0 END) AS totalPending,
SUM(CASE WHEN b.status = 'PAID' THEN 1 ELSE 0 END) AS totalPaid,
SUM(CASE WHEN b.status = 'PAID' THEN s.price ELSE 0 END) AS totalRevenue
FROM bookings b
JOIN schedules s ON b.schedule_id = s.id
`;

db.query(sql, (err, result) => {
if (err) {
console.log(err);
return res.status(500).json({ message: "Database error" });
}

res.json({
totalBookings: result[0].totalBookings || 0,
totalPending: result[0].totalPending || 0,
totalPaid: result[0].totalPaid || 0,
totalRevenue: result[0].totalRevenue || 0
});
});
});


/* ======================================================
ADMIN - GET ALL BOOKINGS
====================================================== */
router.get("/admin/bookings", verifyToken, verifyAdmin, (req, res) => {

const sql = `
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
`;

db.query(sql, (err, results) => {
if (err) {
return res.status(500).json({
message: "Gagal ambil data booking"
});
}

res.json(results);
});
});


/* ======================================================
ADMIN - GET ALL SCHEDULES (FOR MANAGE ROUTES)
====================================================== */
router.get("/admin/schedules", verifyToken, verifyAdmin, (req, res) => {

db.query("SELECT * FROM schedules ORDER BY id DESC", (err, results) => {
if (err) {
return res.status(500).json({ message: "Database error" });
}

res.json(results);
});
});


/* ======================================================
ADMIN - UPDATE SCHEDULE (EDIT ROUTE & PRICE)
====================================================== */
router.put("/admin/schedules/:id", verifyToken, verifyAdmin, (req, res) => {

const scheduleId = req.params.id;
const { origin, destination, bus_name, price } = req.body;

const sql = `
UPDATE schedules
SET origin = ?, destination = ?, bus_name = ?, price = ?
WHERE id = ?
`;

db.query(sql, [origin, destination, bus_name, price, scheduleId], (err) => {
if (err) {
return res.status(500).json({ message: "Update error" });
}

res.json({ message: "Schedule berhasil diupdate" });
});
});

/* ======================================================
ADMIN - ADD NEW SCHEDULE
====================================================== */
router.post("/admin/schedules", verifyToken, verifyAdmin, (req, res) => {

const { origin, destination, bus_name, price } = req.body;

if (!origin || !destination || !bus_name || !price) {
return res.status(400).json({ message: "Semua field wajib diisi" });
}

const sql = `
INSERT INTO schedules (origin, destination, bus_name, price)
VALUES (?, ?, ?, ?)
`;

db.query(sql, [origin, destination, bus_name, price], (err) => {
if (err) {
return res.status(500).json({ message: "Gagal tambah schedule" });
}

res.json({ message: "Schedule berhasil ditambahkan" });
});
});

module.exports = router;