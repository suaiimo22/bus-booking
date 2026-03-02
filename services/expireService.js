const db = require("../db");

function startExpireJob() {
setInterval(async () => {
try {
const now = new Date();

const expireSql = `
UPDATE bookings
SET status = 'EXPIRED'
WHERE status = 'PENDING'
AND expired_at < ?
`;

const [result] = await db.query(expireSql, [now]);

if (result.affectedRows > 0) {
console.log(result.affectedRows + " booking auto expired");
}

} catch (err) {
console.error("Expire error:", err);
}

}, 60000);
}

module.exports = startExpireJob;