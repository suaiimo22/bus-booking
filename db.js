const mysql = require("mysql2");

const db = mysql.createPool({
host: process.env.MYSQLHOST,
user: process.env.MYSQLUSER,
password: process.env.MYSQLPASSWORD,
database: process.env.MYSQLDATABASE,
port: process.env.MYSQLPORT,
waitForConnections: true,
connectionLimit: 5,
queueLimit: 0
});

// OPTIONAL: Test koneksi saat start
db.getConnection((err, connection) => {
if (err) {
console.error("Database connection failed:", err);
} else {
console.log("Database connected successfully");
connection.release();
}
});

module.exports = db.promise();