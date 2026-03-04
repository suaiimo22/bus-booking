const express=require("express");
const router=express.Router();
const db=require("../db");

/* TOTAL STATS */

router.get("/admin/stats",async(req,res)=>{

const [[revenue]]=await db.query(`
SELECT SUM(s.price) as total
FROM bookings b
JOIN schedules s ON b.schedule_id=s.id
WHERE b.status='PAID'
`);

const [[bookings]]=await db.query(`
SELECT COUNT(*) as total FROM bookings
`);

const [[users]]=await db.query(`
SELECT COUNT(*) as total FROM users
`);

res.json({
revenue:revenue.total || 0,
bookings:bookings.total,
users:users.total
});

});

/* REVENUE CHART */

router.get("/admin/revenue-chart",async(req,res)=>{

const [rows]=await db.query(`
SELECT DATE(created_at) as date,
SUM(s.price) as revenue
FROM bookings b
JOIN schedules s ON b.schedule_id=s.id
WHERE b.status='PAID'
GROUP BY DATE(created_at)
ORDER BY date
`);

const labels=rows.map(r=>r.date);
const values=rows.map(r=>r.revenue);

res.json({
labels,
values
});

});

module.exports=router;