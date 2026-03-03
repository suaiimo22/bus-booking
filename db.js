const mysql = require("mysql2");

const db = mysql.createPool({
host: process.env.MYSQLHOST || process.env.MYSQL_HOST,
user: process.env.MYSQLUSER || process.env.MYSQL_USER,
password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD,
database:
process.env.MYSQLDATABASE ||
process.env.MYSQL_DATABASE ||
"railway",
port: process.env.MYSQLPORT || process.env.MYSQL_PORT,
ssl: {
rejectUnauthorized: false
},
waitForConnections: true,
connectionLimit: 5,
queueLimit: 0
});

console.log("DB NAME:", process.env.MYSQLDATABASE);
console.log("DB NAME ALT:", process.env.MYSQL_DATABASE);

module.exports = db.promise();