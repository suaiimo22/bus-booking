const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");

/* ================= ADMIN DASHBOARD ================= */
router.get("/admin/dashboard", verifyToken, verifyAdmin, async (req, res) => {
try {
const [result] = await db.query(`
SELECT
COUNT(*) AS totalBookings,
SUM(CASE WHEN b.status = 'PENDING' THEN 1 ELSE 0 END) AS totalPending,
SUM(CASE WHEN b.status = 'PAID' THEN 1 ELSE 0 END) AS totalPaid,
SUM(CASE WHEN b.status = 'PAID' THEN s.price ELSE 0 END) AS totalRevenue
FROM bookings b
LEFT JOIN schedules s ON b.schedule_id = s.id
`);

res.json({
totalBookings: result[0].totalBookings || 0,
totalPending: result[0].totalPending || 0,
totalPaid: result[0].totalPaid || 0,
totalRevenue: result[0].totalRevenue || 0
});

} catch (err) {
res.status(500).json({ message: "Dashboard error", error: err.message });
}
});

/* ================= GET ALL SCHEDULES ================= */
router.get("/admin/schedules", verifyToken, verifyAdmin, async (req, res) => {
try {
const [rows] = await db.query(`
SELECT
s.id,
s.price,
r.origin,
r.destination,
b.name AS bus_name
FROM schedules s
LEFT JOIN routes r ON s.route_id = r.id
LEFT JOIN buses b ON s.bus_id = b.id
ORDER BY s.id DESC
`);

res.json(rows);

} catch (err) {
res.status(500).json({ message: "Error ambil schedules", error: err.message });
}
});

/* ================= UPDATE SCHEDULE ================= */
router.put("/admin/schedules/:id", verifyToken, verifyAdmin, async (req, res) => {
try {
const id = req.params.id;
const { origin, destination, bus_name, price } = req.body;

// update route
await db.query(`
UPDATE routes r
JOIN schedules s ON s.route_id = r.id
SET r.origin = ?, r.destination = ?
WHERE s.id = ?
`, [origin, destination, id]);

// update bus
await db.query(`
UPDATE buses b
JOIN schedules s ON s.bus_id = b.id
SET b.name = ?
WHERE s.id = ?
`, [bus_name, id]);

// update price
await db.query(`
UPDATE schedules
SET price = ?
WHERE id = ?
`, [price, id]);

res.json({ message: "Schedule berhasil diupdate ✅" });

} catch (err) {
res.status(500).json({ message: "Update error", error: err.message });
}
});

/* ================= ADD SCHEDULE ================= */
router.post("/admin/schedules", verifyToken, verifyAdmin, async (req, res) => {
try {
const { origin, destination, bus_name, price } = req.body;

// insert route
const [routeResult] = await db.query(
"INSERT INTO routes (origin, destination) VALUES (?, ?)",
[origin, destination]
);

// insert bus
const [busResult] = await db.query(
"INSERT INTO buses (name, total_seats) VALUES (?, 20)",
[bus_name]
);

// insert schedule
await db.query(
"INSERT INTO schedules (route_id, bus_id, price) VALUES (?, ?, ?)",
[routeResult.insertId, busResult.insertId, price]
);

res.json({ message: "Schedule berhasil ditambahkan ✅" });

} catch (err) {
res.status(500).json({ message: "Insert error", error: err.message });
}
});

// ================= DELETE SCHEDULE =================
router.delete("/admin/schedules/:id", verifyToken, verifyAdmin, async (req, res) => {

try {

const id = req.params.id;

await db.query("DELETE FROM schedules WHERE id = ?", [id]);

res.json({ message: "Schedule berhasil dihapus 🗑️" });

} catch (err) {

res.status(500).json({
message: "Delete error",
error: err.message
});

}

});

module.exports = router;