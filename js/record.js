// js/record.js
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

const apptInfoText = document.getElementById("apptInfoText");
const recordForm = document.getElementById("recordForm");
const diagnosisInput = document.getElementById("diagnosis");
const notesInput = document.getElementById("notes");
const saveBtn = document.getElementById("saveBtn");
const message = document.getElementById("message");

// Read ?appointment_id=... from the URL. This is how the dashboard
// tells this page which appointment we're working on.
const appointmentId = new URLSearchParams(window.location.search).get(
  "appointment_id",
);

let isDoctor = false;
let existingRecordId = null; // null until we know a record already exists
let patientIdForThisAppt = null;

init();

async function init() {
  if (!appointmentId) {
    apptInfoText.textContent = "No appointment specified.";
    recordForm.style.display = "none";
    return;
  }

  // --- Auth guard ---
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "index.html";
    return;
  }

  await showWhoAmI(sessionData.session.user.id);
  await loadAppointment();
  await loadExistingRecord();

  // Only doctors can add/edit — everyone else gets a read-only view.
  if (!isDoctor) {
    recordForm.style.display = "none";
  }
}

async function showWhoAmI(authUserId) {
  const { data: staffRow } = await supabase
    .from("staff_user")
    .select("name, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (staffRow) {
    whoami.textContent = `${staffRow.name} (${staffRow.role})`;
    return;
  }

  const { data: doctorRow } = await supabase
    .from("doctor")
    .select("first_name, last_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (doctorRow) {
    whoami.textContent = `Dr. ${doctorRow.first_name} ${doctorRow.last_name}`;
    isDoctor = true;
    return;
  }

  whoami.textContent = "Unknown user";
}

async function loadAppointment() {
  // RLS does the access control here: a doctor only gets this row back
  // if it's their own appointment; a patient only if it's theirs;
  // staff can see any. If none of those apply, data comes back empty.
  const { data: appt, error } = await supabase
    .from("appointment")
    .select(
      `
      appointment_id,
      patient_id,
      date_time,
      status,
      reason,
      patient:patient_id ( first_name, last_name ),
      doctor:doctor_id ( first_name, last_name )
    `,
    )
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (error || !appt) {
    apptInfoText.textContent =
      "Appointment not found, or you don't have access to it.";
    recordForm.style.display = "none";
    return;
  }

  patientIdForThisAppt = appt.patient_id;

  const when = new Date(appt.date_time).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

  apptInfoText.innerHTML = `
    <strong>${appt.patient?.first_name ?? ""} ${appt.patient?.last_name ?? ""}</strong>
    with Dr. ${appt.doctor?.first_name ?? ""} ${appt.doctor?.last_name ?? ""}
    — ${when} (${statusBadge(appt.status)})<br>
    Reason: ${appt.reason ?? "—"}
  `;
}

async function loadExistingRecord() {
  const { data: record } = await supabase
    .from("medical_record")
    .select("record_id, diagnosis, notes")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (record) {
    existingRecordId = record.record_id;
    diagnosisInput.value = record.diagnosis ?? "";
    notesInput.value = record.notes ?? "";
    saveBtn.textContent = "Update Record";

    if (!isDoctor) {
      // Read-only view for non-doctors: show the record as plain text
      // instead of leaving disabled form fields around.
      apptInfoText.innerHTML += `<hr>
        <strong>Diagnosis:</strong> ${record.diagnosis ?? "—"}<br>
        <strong>Notes:</strong> ${record.notes ?? "—"}`;
    }
  } else if (!isDoctor) {
    apptInfoText.innerHTML += `<hr><em>No medical record has been added yet.</em>`;
  }
}

recordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("Saving...");

  const diagnosis = diagnosisInput.value;
  const notes = notesInput.value;
  const recordDate = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  let error;

  if (existingRecordId) {
    // A record already exists for this appointment — update it rather
    // than creating a duplicate.
    const result = await supabase
      .from("medical_record")
      .update({ diagnosis, notes })
      .eq("record_id", existingRecordId);
    error = result.error;
  } else {
    const result = await supabase.from("medical_record").insert({
      patient_id: patientIdForThisAppt,
      appointment_id: appointmentId,
      diagnosis,
      notes,
      record_date: recordDate,
    });
    error = result.error;

    if (!error) {
      // Re-fetch so existingRecordId is set — otherwise a second save
      // in the same visit would try to insert again instead of update.
      await loadExistingRecord();
    }
  }

  if (error) {
    showMessage("Error saving record: " + error.message, "error");
    return;
  }

  showMessage("Record saved.", "success");
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});
