const mysql = require("mysql2");

const connection = mysql.createConnection({
host: "localhost",
user: "root",
password: "123sjtransOK!", // isi kalau kamu pakai password MySQL
database: "bus_booking"
});

connection.connect((err) => {
if (err) {
console.error("Koneksi database gagal:", err);
} else {
console.log("MySQL Connected ✅");
}
});

module.exports = connection;