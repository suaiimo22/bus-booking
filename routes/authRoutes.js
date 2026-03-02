const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

// ================= REGISTER =================
router.post("/register", async (req, res) => {
try {
const { name, email, user_password } = req.body;

if (!name || !email || !user_password) {
return res.status(400).json({
message: "Semua field wajib diisi"
});
}

const hashedPassword = await bcrypt.hash(user_password, 10);

const sql = `
INSERT INTO users (name, email, user_password)
VALUES (?, ?, ?)
`;

db.query(sql, [name, email, hashedPassword], (err) => {
if (err) {
return res.status(500).json({
message: "Email sudah terdaftar atau error"
});
}

res.json({ message: "Register berhasil" });
});

} catch (error) {
res.status(500).json({
message: "Server error",
error: error.message
});
}
});


// ================= LOGIN =================
router.post("/login", (req, res) => {
const { email, password } = req.body;

const sql = "SELECT * FROM users WHERE email = ?";

db.query(sql, [email], async (err, results) => {
if (err) return res.status(500).json({ message: "Error server" });

if (results.length === 0) {
return res.status(400).json({ message: "User tidak ditemukan" });
}

const user = results[0];
const isMatch = await bcrypt.compare(password, user.user_password);

if (!isMatch) {
return res.status(400).json({ message: "Password salah" });
}

const token = jwt.sign(
{ id: user.id, email: user.email, role: user.role },
process.env.SECRET_KEY,
{ expiresIn: "1h" }
);

res.json({
message: "Login berhasil",
token
});
});
});

module.exports = router;