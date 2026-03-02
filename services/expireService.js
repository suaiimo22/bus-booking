const db = require("../db");

function startExpireJob() {
setInterval(async () => {
const now = new Date();

const expireSql = `
UPDATE bookings
SET status = 'EXPIRED'
WHERE status = 'PENDING'
AND expired_at < ?
`;

db.query(expireSql, [now], (err, result) => {
if (err) {
console.log("Expire error:", err);
}

if (result && result.affectedRows > 0) {
console.log(result.affectedRows + " booking auto expired");
}
});

}, 60000); // cek tiap 1 menit
}

module.exports = startExpireJob;