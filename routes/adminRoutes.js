const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");

// ================= ADMIN - GET ALL BOOKINGS =================
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

// ================= ADMIN DASHBOARD (BASIC TEST) =================
// ================= ADMIN DASHBOARD (STEP 1) =================
// ================= ADMIN DASHBOARD (STEP 2 FINAL FIX) =================
router.get("/admin/dashboard", verifyToken, verifyAdmin, (req, res) => {

const sql = `
SELECT
COUNT(*) AS totalBookings,
SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS totalPending
FROM bookings
`;

db.query(sql, (err, result) => {
if (err) {
console.log(err);
return res.status(500).json({ message: "Database error" });
}

res.json({
totalBookings: result[0].totalBookings,
totalPending: result[0].totalPending || 0
});
});

});

// ================= ADMIN DASHBOARD (STEP 3) =================
// ================= ADMIN DASHBOARD (STEP 4 - REVENUE) =================
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

module.exports = router;