// js/patients.js
import { supabase } from "./supabaseClient.js";

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

function statusBadge(status) {
  const cssClass = status.toLowerCase().replace(/\s+/g, "-"); // "No-show" -> "no-show"
  return `<span class="status status--${cssClass}">${status}</span>`;
}

const whoami = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");

const searchForm = document.getElementById("searchForm");
const searchTermInput = document.getElementById("searchTerm");
const message = document.getElementById("message");
const resultsBody = document.getElementById("resultsBody");

const detailSection = document.getElementById("detailSection");
const detailName = document.getElementById("detailName");
const detailContact = document.getElementById("detailContact");
const detailAppointments = document.getElementById("detailAppointments");
const detailRecords = document.getElementById("detailRecords");

init();

async function init() {
  // --- Auth guard ---
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "index.html";
    return;
  }

  const authUserId = sessionData.session.user.id;

  // This page is for staff only (per FR9 user story — admin staff
  // searching patient files). Doctors and patients get sent elsewhere.
  const { data: staffRow, error } = await supabase
    .from("staff_user")
    .select("name, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !staffRow) {
    window.location.href = "dashboard.html";
    return;
  }

  whoami.textContent = `${staffRow.name} (${staffRow.role})`;
}

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  detailSection.style.display = "none";
  showMessage("Searching...");
  resultsBody.innerHTML = "";

  const term = searchTermInput.value.trim();
  if (!term) {
    showMessage("Enter a name or patient ID.", "error");
    return;
  }
  // Build an OR filter: match the term against first name, last name,
  // OR (if it's a plain number) the patient ID directly.
  const isNumeric = /^\d+$/.test(term);
  let filter = `first_name.ilike.%${term}%,last_name.ilike.%${term}%`;
  if (isNumeric) {
    filter += `,patient_id.eq.${term}`;
  }

  const { data: patients, error } = await supabase
    .from("patient")
    .select("patient_id, first_name, last_name, phone, email")
    .or(filter);

  if (error) {
    showMessage("Error searching: " + error.message, "error");
    return;
  }

  if (!patients || patients.length === 0) {
    showMessage("No matching patients found.", "error");
    return;
  }
  showMessage(`${patients.length} result(s):`, "success");
  resultsBody.innerHTML = patients
    .map(
      (p) => `
      <tr>
        <td>${p.patient_id}</td>
        <td>${p.first_name} ${p.last_name}</td>
        <td>${p.phone ?? ""}</td>
        <td>${p.email ?? ""}</td>
        <td><button class="viewBtn" data-id="${p.patient_id}" data-name="${p.first_name} ${p.last_name}" data-phone="${p.phone ?? ""}" data-email="${p.email ?? ""}">View</button></td>
      </tr>
    `,
    )
    .join("");

  // Buttons are created dynamically above, so we attach their click
  // listeners here rather than in HTML — the elements didn't exist yet
  // when the page first loaded.
  document.querySelectorAll(".viewBtn").forEach((btn) => {
    btn.addEventListener("click", () => showPatientDetail(btn.dataset));
  });
});

async function showPatientDetail(patientData) {
  const patientId = patientData.id;
  detailSection.style.display = "block";
  detailName.textContent = patientData.name;
  detailContact.textContent = `${patientData.phone} — ${patientData.email}`;
  detailAppointments.innerHTML = "Loading...";
  detailRecords.innerHTML = "Loading...";

  const { data: appointments } = await supabase
    .from("appointment")
    .select(
      `
      appointment_id,
      date_time,
      status,
      reason,
      doctor:doctor_id ( first_name, last_name )
    `,
    )
    .eq("patient_id", patientId)
    .order("date_time", { ascending: false });

  detailAppointments.innerHTML =
    !appointments || appointments.length === 0
      ? "<li>No appointments on file.</li>"
      : appointments
          .map((appt) => {
            const when = new Date(appt.date_time).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            });
            return `<li>${when} — Dr. ${appt.doctor?.first_name ?? ""} ${appt.doctor?.last_name ?? ""} (${statusBadge(appt.status)}) — ${appt.reason ?? ""}</li>`;
          })
          .join("");

  const { data: records } = await supabase
    .from("medical_record")
    .select("record_date, diagnosis, notes")
    .eq("patient_id", patientId)
    .order("record_date", { ascending: false });

  detailRecords.innerHTML =
    !records || records.length === 0
      ? "<li>No medical records on file.</li>"
      : records
          .map(
            (r) =>
              `<li>${r.record_date} — <strong>${r.diagnosis ?? "—"}</strong>: ${r.notes ?? ""}</li>`,
          )
          .join("");
}

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});
