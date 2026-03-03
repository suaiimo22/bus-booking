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

const hashed = await bcrypt.hash(user_password, 10);

await db.query(
"INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
[name, email, hashed]
);

res.json({ message: "Register berhasil" });
} catch {
res.status(500).json({ message: "Email sudah terdaftar" });
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
} catch {
res.status(500).json({ message: "Server error" });
}
});

/* ================= FORCE ADMIN ================= */
app.get("/make-admin", async (req, res) => {
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
} catch {
res.status(500).json({ message: "Server error" });
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
} catch {
res.status(500).json({ message: "Server error" });
}
});

/* ================= ADMIN DASHBOARD ANALYTICS ================= */
app.get("/admin/dashboard", verifyToken, async (req, res) => {
try {
if (req.user.role !== "admin")
return res.status(403).json({ message: "Akses admin saja" });

const [[revenue]] = await db.query(`
SELECT SUM(s.price) as total_revenue
FROM bookings b
JOIN schedules s ON b.schedule_id = s.id
WHERE b.status = 'PAID'
`);

const [[paid]] = await db.query(`SELECT COUNT(*) as total_paid FROM bookings WHERE status='PAID'`);
const [[pending]] = await db.query(`SELECT COUNT(*) as total_pending FROM bookings WHERE status='PENDING'`);
const [[expired]] = await db.query(`SELECT COUNT(*) as total_expired FROM bookings WHERE status='EXPIRED'`);

const [occupancy] = await db.query(`
SELECT
s.id as schedule_id,
b.name as bus_name,
b.total_seats,
COUNT(book.id) as seats_sold,
ROUND((COUNT(book.id)/b.total_seats)*100,2) as occupancy_percent
FROM schedules s
JOIN buses b ON s.bus_id = b.id
LEFT JOIN bookings book
ON book.schedule_id = s.id AND book.status='PAID'
GROUP BY s.id
`);

res.json({
revenue: revenue.total_revenue || 0,
total_paid: paid.total_paid,
total_pending: pending.total_pending,
total_expired: expired.total_expired,
occupancy
});

} catch (err) {
res.status(500).json({ message: "Dashboard error", error: err.message });
}
});

/* ================= AUTO EXPIRE ================= */
startExpireJob();

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
console.log("Server berjalan di port", PORT);
});