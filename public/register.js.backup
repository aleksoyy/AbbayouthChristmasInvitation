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
// The database is the source of truth: returning browsers see their original ticket.
fetch("/api/public/my-registration", { cache: "no-store" })
  .then(async response => {
    if (response.ok) {
      window.location.replace("/success");
      return;
    }
    if (response.status !== 404) throw new Error("Status registrasi tidak tersedia.");
    const statusResponse = await fetch("/api/public/status", { cache: "no-store" });
    if (!statusResponse.ok) throw new Error("Status registrasi tidak tersedia.");
    const status = await statusResponse.json();
    if (status.alreadyRegistered) {
      window.location.replace("/success");
      return;
    }
    quota.textContent = status.full ? "Mohon maaf, kuota registrasi telah penuh." : "";
    quota.classList.toggle("hidden", !status.full);
    if (status.full) { submitBtn.disabled = true; quota.className = "alert error"; }
  })
  .catch(() => {
    quota.textContent = "Tidak dapat memeriksa status registrasi. Silakan muat ulang halaman.";
    quota.className = "alert error";
    submitBtn.disabled = true;
  });

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
    if (!response.ok) {
      if (response.status === 409 && /browser|perangkat|duplikat/i.test(result.error || "")) {
        window.location.replace("/success");
        return;
      }
      throw new Error(result.error || "Registrasi gagal.");
    }
    sessionStorage.setItem("abbayouthRegistration", JSON.stringify(result.guest));
    window.location.href = "/success";
  } catch (error) {
    message.textContent = error.message;
    message.className = "alert error";
    submitBtn.disabled = false; submitBtn.textContent = "DAFTAR SEKARANG";
  }
});
