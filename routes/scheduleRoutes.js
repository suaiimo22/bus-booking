const express = require("express");
const router = express.Router();
const db = require("../db");

// ================= GET ALL SCHEDULES =================
router.get("/schedules", (req, res) => {
db.query("SELECT * FROM schedules", (err, results) => {
if (err) {
return res.status(500).json({
message: "Gagal ambil data schedules"
});
}

res.json(results);
});
});

module.exports = router;