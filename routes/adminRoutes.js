const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/verifyToken");

/* ================= ADMIN DASHBOARD ================= */

router.get("/admin/dashboard", verifyToken, async (req, res) => {

if (req.user.role !== "admin")
return res.status(403).json({ message: "Akses admin saja" });

try {

const [[totalBookings]] = await db.query(
"SELECT COUNT(*) as total FROM bookings"
);

const [[totalPending]] = await db.query(
"SELECT COUNT(*) as total FROM bookings WHERE status='PENDING'"
);

const [[totalPaid]] = await db.query(
"SELECT COUNT(*) as total FROM bookings WHERE status='PAID'"
);

const [[totalRevenue]] = await db.query(`
SELECT COALESCE(SUM(s.price),0) as revenue
FROM bookings b
JOIN schedules s ON b.schedule_id = s.id
WHERE b.status='PAID'
`);

res.json({
totalBookings: totalBookings.total,
totalPending: totalPending.total,
totalPaid: totalPaid.total,
totalRevenue: totalRevenue.revenue
});

} catch (err) {

res.status(500).json({
message: "Error dashboard",
error: err.message
});

}

});

/* ================= REVENUE CHART ================= */

router.get("/admin/revenue", verifyToken, async (req, res) => {

if (req.user.role !== "admin")
return res.status(403).json({ message: "Akses admin saja" });

try {

const [rows] = await db.query(`
SELECT
DATE(b.created_at) as date,
SUM(s.price) as revenue
FROM bookings b
JOIN schedules s ON b.schedule_id = s.id
WHERE b.status='PAID'
GROUP BY DATE(b.created_at)
ORDER BY DATE(b.created_at)
`);

res.json(rows);

} catch (err) {

res.status(500).json({
message: "Error ambil revenue",
error: err.message
});

}

});

/* ================= ADMIN SEE ALL BOOKINGS ================= */

router.get("/admin/bookings", verifyToken, async (req, res) => {

if (req.user.role !== "admin")
return res.status(403).json({ message: "Akses admin saja" });

try {

const [rows] = await db.query(`
SELECT
b.id,
u.name as user_name,
r.origin,
r.destination,
bus.name as bus_name,
b.seat_number,
b.status,
s.price,
b.created_at
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN schedules s ON b.schedule_id = s.id
JOIN routes r ON s.route_id = r.id
JOIN buses bus ON s.bus_id = bus.id
ORDER BY b.id DESC
`);

res.json(rows);

} catch (err) {

res.status(500).json({
message: "Error ambil bookings",
error: err.message
});

}

});

/* ================= ADMIN SCHEDULE CRUD ================= */

router.get("/admin/schedules", verifyToken, async (req, res) => {

const [rows] = await db.query(`
SELECT
s.id,
r.origin,
r.destination,
b.name as bus_name,
s.price
FROM schedules s
JOIN routes r ON s.route_id = r.id
JOIN buses b ON s.bus_id = b.id
ORDER BY s.id DESC
`);

res.json(rows);

});

router.post("/admin/schedules", verifyToken, async (req, res) => {

const { origin, destination, bus_name, price } = req.body;

const [[route]] = await db.query(
"SELECT id FROM routes WHERE origin=? AND destination=?",
[origin, destination]
);

const [[bus]] = await db.query(
"SELECT id FROM buses WHERE name=?",
[bus_name]
);

await db.query(
"INSERT INTO schedules (route_id,bus_id,price) VALUES (?,?,?)",
[route.id, bus.id, price]
);

res.json({ message: "Schedule berhasil ditambahkan" });

});

router.put("/admin/schedules/:id", verifyToken, async (req, res) => {

const { origin, destination, bus_name, price } = req.body;

const [[route]] = await db.query(
"SELECT id FROM routes WHERE origin=? AND destination=?",
[origin, destination]
);

const [[bus]] = await db.query(
"SELECT id FROM buses WHERE name=?",
[bus_name]
);

await db.query(
"UPDATE schedules SET route_id=?,bus_id=?,price=? WHERE id=?",
[route.id, bus.id, price, req.params.id]
);

res.json({ message: "Schedule berhasil diupdate" });

});

router.delete("/admin/schedules/:id", verifyToken, async (req, res) => {

await db.query(
"DELETE FROM schedules WHERE id=?",
[req.params.id]
);

res.json({ message: "Schedule berhasil dihapus" });

});

module.exports = router;