function verifyAdmin(req, res, next) {
if (req.user.role !== "admin") {
return res.status(403).json({
message: "Akses ditolak. Admin only."
});
}
next();
}

module.exports = verifyAdmin;