const token = localStorage.getItem("token");

if (!token) {
window.location.href = "login.html";
}

fetch("/admin/dashboard", {
headers: {
Authorization: "Bearer " + token
}
})
.then(res => {
if (!res.ok) {
throw new Error("Unauthorized");
}
return res.json();
})
.then(data => {

document.getElementById("totalRevenue").innerText =
"Rp " + data.totalRevenue.toLocaleString("id-ID");

document.getElementById("totalBookings").innerText =
data.totalBookings;

document.getElementById("activeBookings").innerText =
data.activeBookings;

document.getElementById("occupancy").innerText =
data.occupancy + "%";

const table = document.getElementById("bookingTable");
table.innerHTML = "";

data.recentBookings.forEach(b => {
table.innerHTML += `
<tr>
<td>${b.name}</td>
<td>${b.origin} - ${b.destination}</td>
<td>${b.seat_number}</td>
<td>${b.status}</td>
<td>${new Date(b.created_at).toLocaleString()}</td>
</tr>
`;
});

})
.catch(err => {
alert("Unauthorized or session expired");
localStorage.removeItem("token");
window.location.href = "login.html";
});

function logout() {
localStorage.removeItem("token");
window.location.href = "login.html";
}