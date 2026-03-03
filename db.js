const mysql = require("mysql2");

// Debug kecil supaya kita tahu env kebaca atau tidak
console.log("MYSQLHOST:", process.env.MYSQLHOST);
console.log("MYSQLDATABASE:", process.env.MYSQLDATABASE);

const db = mysql.createPool({
host: process.env.MYSQLHOST,
user: process.env.MYSQLUSER,
password: process.env.MYSQLPASSWORD,
database: process.env.MYSQLDATABASE, // WAJIB dari Railway
port: process.env.MYSQLPORT,
waitForConnections: true,
connectionLimit: 10,
queueLimit: 0,
});

// Test koneksi saat server start
db.getConnection((err, connection) => {
if (err) {
console.error("❌ Gagal koneksi ke database:", err.message);
} else {
console.log("✅ Berhasil konek ke database:", process.env.MYSQLDATABASE);
connection.release();
}
});

module.exports = db.promise();