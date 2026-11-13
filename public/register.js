const form = document.getElementById("registrationForm");
const source = document.getElementById("source");
const otherWrap = document.getElementById("otherWrap");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");
const quota = document.getElementById("quota");
let submissionToken = crypto.randomUUID();

source.addEventListener("change", () => {
  otherWrap.classList.toggle("hidden", source.value !== "Lainnya");
});
fetch("/api/public/status").then(r => r.json()).then(s => {
  quota.textContent = s.full ? "Mohon maaf, kuota registrasi telah penuh." : `Tersedia ${s.available} dari ${s.capacity} nomor undian.`;
  if (s.full) { submitBtn.disabled = true; quota.className = "alert error"; }
}).catch(() => {});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.className = "alert"; message.textContent = "";
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  data.submissionToken = submissionToken;
  submitBtn.disabled = true; submitBtn.textContent = "MENYIMPAN REGISTRASI...";
  try {
    const response = await fetch("/api/register", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Registrasi gagal.");
    sessionStorage.setItem("abbayouthRegistration", JSON.stringify(result.guest));
    window.location.href = "/success";
  } catch (error) {
    message.textContent = error.message;
    message.className = "alert error";
    submitBtn.disabled = false; submitBtn.textContent = "DAFTAR SEKARANG";
  }
});
