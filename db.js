const mysql = require("mysql2");

// Debug supaya kita tahu env kebaca
console.log("MYSQLHOST:", process.env.MYSQLHOST);
console.log("MYSQL_DATABASE:", process.env.MYSQL_DATABASE);

const db = mysql.createPool({
host: process.env.MYSQLHOST,
user: process.env.MYSQLUSER,
password: process.env.MYSQLPASSWORD,
database: process.env.MYSQL_DATABASE, // ✅ BENAR (pakai underscore)
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
console.log("✅ Berhasil konek ke database:", process.env.MYSQL_DATABASE);
connection.release();
}
});

module.exports = db.promise();