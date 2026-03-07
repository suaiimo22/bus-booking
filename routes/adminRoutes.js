const express=require("express");
const router=express.Router();
const db=require("../db");

/* ================= DASHBOARD STATS ================= */

router.get("/admin/stats",async(req,res)=>{

try{

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

}catch(err){

res.status(500).json({error:err.message});

}

});


/* ================= REVENUE CHART ================= */

router.get("/admin/revenue-chart",async(req,res)=>{

try{

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

res.json({labels,values});

}catch(err){

res.status(500).json({error:err.message});

}

});


/* ================= ROUTES CRUD ================= */

router.get("/admin/routes",async(req,res)=>{

const [rows]=await db.query(`
SELECT * FROM routes ORDER BY id DESC
`);

res.json(rows);

});


router.post("/admin/routes",async(req,res)=>{

const {origin,destination}=req.body;

await db.query(`
INSERT INTO routes(origin,destination)
VALUES(?,?)
`,[origin,destination]);

res.json({message:"Route berhasil dibuat"});

});


router.put("/admin/routes/:id",async(req,res)=>{

const id=req.params.id;
const {origin,destination}=req.body;

await db.query(`
UPDATE routes
SET origin=?,destination=?
WHERE id=?
`,[origin,destination,id]);

res.json({message:"Route berhasil diupdate"});

});


router.delete("/admin/routes/:id",async(req,res)=>{

const id=req.params.id;

await db.query(`
DELETE FROM routes WHERE id=?
`,[id]);

res.json({message:"Route berhasil dihapus"});

});


/* ================= BUSES CRUD ================= */

router.get("/admin/buses",async(req,res)=>{

const [rows]=await db.query(`
SELECT * FROM buses ORDER BY id DESC
`);

res.json(rows);

});


router.post("/admin/buses",async(req,res)=>{

const {name,total_seats}=req.body;

await db.query(`
INSERT INTO buses(name,total_seats)
VALUES(?,?)
`,[name,total_seats]);

res.json({message:"Bus berhasil dibuat"});

});


router.put("/admin/buses/:id",async(req,res)=>{

const id=req.params.id;
const {name,total_seats}=req.body;

await db.query(`
UPDATE buses
SET name=?,total_seats=?
WHERE id=?
`,[name,total_seats,id]);

res.json({message:"Bus berhasil diupdate"});

});


router.delete("/admin/buses/:id",async(req,res)=>{

const id=req.params.id;

await db.query(`
DELETE FROM buses WHERE id=?
`,[id]);

res.json({message:"Bus berhasil dihapus"});

});


/* ================= SCHEDULES CRUD ================= */

router.get("/admin/schedules",async(req,res)=>{

const [rows]=await db.query(`
SELECT
s.id,
s.price,
s.departure_time,
s.arrival_time,
r.origin,
r.destination,
b.name as bus_name
FROM schedules s
JOIN routes r ON s.route_id=r.id
JOIN buses b ON s.bus_id=b.id
ORDER BY s.id DESC
`);

res.json(rows);

});


router.post("/admin/schedules",async(req,res)=>{

const {route_id,bus_id,departure_time,arrival_time,price}=req.body;

await db.query(`
INSERT INTO schedules(route_id,bus_id,departure_time,arrival_time,price)
VALUES(?,?,?,?,?)
`,[route_id,bus_id,departure_time,arrival_time,price]);

res.json({message:"Schedule berhasil dibuat"});

});


router.put("/admin/schedules/:id",async(req,res)=>{

const id=req.params.id;
const {route_id,bus_id,departure_time,arrival_time,price}=req.body;

await db.query(`
UPDATE schedules
SET route_id=?,bus_id=?,departure_time=?,arrival_time=?,price=?
WHERE id=?
`,[route_id,bus_id,departure_time,arrival_time,price,id]);

res.json({message:"Schedule berhasil diupdate"});

});


router.delete("/admin/schedules/:id",async(req,res)=>{

const id=req.params.id;

await db.query(`
DELETE FROM schedules WHERE id=?
`,[id]);

res.json({message:"Schedule berhasil dihapus"});

});


/* ================= ADMIN VIEW BOOKINGS ================= */

router.get("/admin/bookings",async(req,res)=>{

const [rows]=await db.query(`
SELECT
b.id,
u.name as user,
b.seat_number,
b.status,
r.origin,
r.destination,
s.price
FROM bookings b
JOIN users u ON b.user_id=u.id
JOIN schedules s ON b.schedule_id=s.id
JOIN routes r ON s.route_id=r.id
ORDER BY b.id DESC
`);

res.json(rows);

});

/* ROUTE AUTOCOMPLETE SEARCH */

router.get("/routes/search", async (req,res)=>{

try{

const keyword = req.query.keyword || "";

const [rows] = await db.query(`
SELECT DISTINCT origin
FROM routes
WHERE origin LIKE ?
LIMIT 10
`, [`%${keyword}%`]);

res.json(rows);

}catch(err){

res.status(500).json({error:err.message});

}

});

router.post("/tours/:id/packages", async (req,res)=>{

try{

const tourId = req.params.id;

const {name,price} = req.body;

await db.query(
`INSERT INTO tour_packages (tour_id,name,price)
VALUES (?,?,?)`,
[tourId,name,price]
);

res.json({
message:"Package berhasil ditambahkan"
});

}catch(err){

res.status(500).json({
message:"Error tambah package",
error:err.message
});

}

});

router.get("/tours/:id/packages", async (req,res)=>{

try{

const tourId=req.params.id;

const [rows]=await db.query(
`SELECT * FROM tour_packages WHERE tour_id=?`,
[tourId]
);

res.json(rows);

}catch(err){

res.status(500).json({
error:err.message
});

}

});

router.get("/tours/:id/packages", async (req,res)=>{

try{

const tourId = req.params.id;

const [rows] = await db.query(
`SELECT * FROM tour_packages WHERE tour_id=?`,
[tourId]
);

res.json(rows);

}catch(err){

res.status(500).json({
error:err.message
});

}

});

module.exports=router;