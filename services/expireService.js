const db = require("../db");

function startExpireJob() {
setInterval(async () => {
try {

const expireSql = `
UPDATE bookings
SET status = 'EXPIRED'
WHERE status = 'PENDING'
AND expired_at IS NOT NULL
AND expired_at < NOW()
`;

const [result] = await db.query(expireSql);

if (result.affectedRows > 0) {
console.log(result.affectedRows + " booking auto expired");
}

} catch (err) {
console.error("Expire error:", err);
}
}, 60000); // jalan tiap 1 menit
}

module.exports = startExpireJob;