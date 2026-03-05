const seatContainer = document.getElementById("seatContainer");

const rows = ["A","B","C","D","E","F","G","H"];
const cols = [1,2,3,4];

let selectedSeat = null;

function generateSeats(bookedSeats = []){

seatContainer.innerHTML = "";

rows.forEach(row => {

let rowDiv = document.createElement("div");
rowDiv.className = "seat-row";

cols.forEach(col => {

let seat = row + col;

let seatBtn = document.createElement("button");

seatBtn.innerText = seat;
seatBtn.className = "seat";

if(bookedSeats.includes(seat)){
seatBtn.classList.add("booked");
seatBtn.disabled = true;
}

seatBtn.onclick = () => {

if(selectedSeat){
document.querySelectorAll(".seat").forEach(s=>{
s.classList.remove("selected")
})
}

seatBtn.classList.add("selected");
selectedSeat = seat;

document.getElementById("selectedSeat").innerText = seat;

}

rowDiv.appendChild(seatBtn);

if(col == 2){
let aisle = document.createElement("div");
aisle.className="aisle";
rowDiv.appendChild(aisle);
}

})

seatContainer.appendChild(rowDiv);

})

}

generateSeats();