// js/booking.js
import { supabase } from "./supabaseClient.js";

function statusBadge(status) {
  const cssClass = status.toLowerCase().replace(/\s+/g, "-"); // "No-show" -> "no-show"
  return `<span class="status status--${cssClass}">${status}</span>`;
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = type; // "error" or "success"
}

const whoami = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");

const form = document.getElementById("bookingForm");
const doctorSelect = document.getElementById("doctor");
const dateTimeInput = document.getElementById("dateTime");
const reasonInput = document.getElementById("reason");
const message = document.getElementById("message");

const myApptsList = document.getElementById("myApptsList");
const myApptsEmpty = document.getElementById("myApptsEmpty");

let currentPatientId = null; // filled in once we know who's logged in

init();

async function init() {
  // --- Auth guard, same pattern as dashboard.js ---
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "index.html";
    return;
  }

  const authUserId = sessionData.session.user.id;

  // This page is patient-only. Look up the patient's own row so we
  // have their patient_id for booking, and their name for the header.
  const { data: patientRow, error: patientError } = await supabase
    .from("patient")
    .select("patient_id, first_name, last_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (patientError || !patientRow) {
    // Not a patient (or an orphaned account) — send them to the
    // dashboard instead, which is built for doctors/staff.
    window.location.href = "dashboard.html";
    return;
  }

  currentPatientId = patientRow.patient_id;
  whoami.textContent = `${patientRow.first_name} ${patientRow.last_name}`;

  await loadDoctors();
  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  // datetime-local needs "YYYY-MM-DDTHH:mm" format, no timezone/seconds
  const toLocalInputValue = (d) => d.toISOString().slice(0, 16);
  dateTimeInput.min = toLocalInputValue(now);
  dateTimeInput.max = toLocalInputValue(twoWeeksOut);
  await loadMyAppointments();
}

async function loadDoctors() {
  const { data: doctors, error } = await supabase
    .from("doctor")
    .select("doctor_id, first_name, last_name, specialty")
    .order("last_name", { ascending: true });

  if (error) {
    doctorSelect.innerHTML = `<option value="">Error loading doctors</option>`;
    return;
  }

  doctorSelect.innerHTML = doctors
    .map(
      (doc) =>
        `<option value="${doc.doctor_id}">Dr. ${doc.first_name} ${doc.last_name} — ${doc.specialty}</option>`,
    )
    .join("");
}

async function loadMyAppointments() {
  const { data: appointments, error } = await supabase
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
    .eq("patient_id", currentPatientId)
    .gte("date_time", new Date().toISOString()) // only future ones
    .order("date_time", { ascending: true });

  if (error || !appointments || appointments.length === 0) {
    myApptsEmpty.style.display = "block";
    return;
  }

  myApptsList.innerHTML = appointments
    .map((appt) => {
      const when = new Date(appt.date_time).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
      return `<li>${when} — Dr. ${appt.doctor?.first_name ?? ""} ${appt.doctor?.last_name ?? ""} (${statusBadge(appt.status)})</li>`;
    })
    .join("");
}
async function loadReminders() {
  const reminderList = document.getElementById("reminderList");
  const reminderEmpty = document.getElementById("reminderEmpty");

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: appointments, error } = await supabase
    .from("appointment")
    .select(
      `
      appointment_id,
      date_time,
      status,
      doctor:doctor_id ( first_name, last_name )
    `,
    )
    .eq("patient_id", currentPatientId)
    .eq("status", "Booked") // no point reminding about a cancelled visit
    .gte("date_time", now.toISOString())
    .lte("date_time", in24Hours.toISOString())
    .order("date_time", { ascending: true });

  if (error || !appointments || appointments.length === 0) {
    reminderEmpty.style.display = "block";
    return;
  }

  reminderList.innerHTML = appointments
    .map((appt) => {
      const when = new Date(appt.date_time).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
      // MOCK: this simulates what an SMS/email reminder would say.
      // No real message is sent — this is a UI stand-in for that
      // future integration (see notes for how a real send would work).
      return `<li>🔔 Reminder: appointment with Dr. ${appt.doctor?.first_name ?? ""} ${appt.doctor?.last_name ?? ""} on ${when}</li>`;
    })
    .join("");
}
await loadMyAppointments();
await loadReminders();
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "Checking availability...";

  const doctorId = doctorSelect.value;
  const dateTimeValue = dateTimeInput.value; // e.g. "2026-08-03T14:30"
  const reason = reasonInput.value;

  if (!doctorId || !dateTimeValue) {
    message.textContent = "Please pick a doctor and a date/time.";
    return;
  }

  const chosenDate = new Date(dateTimeValue);
  const now = new Date();
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  if (chosenDate <= now) {
    showMessage("You can't book an appointment in the past.", "error");
    return;
  }
  if (chosenDate > twoWeeksFromNow) {
    showMessage(
      "Appointments can only be booked up to 2 weeks in advance.",
      "error",
    );
    return;
  }
  // datetime-local gives us local time with no timezone info — convert
  // to a real Date so we send an unambiguous ISO string to Supabase.
  const chosenDateTime = new Date(dateTimeValue);
  const isoDateTime = chosenDateTime.toISOString();

  // --- Pre-check (nice error message, not the real safety net) ---
  // We look for any existing appointment for this doctor at this exact
  // time. This is just so the user gets a friendly warning quickly;
  // it does NOT fully prevent a race between two people booking the
  // same slot at once — that's what the DB's unique constraint is for.
  const { data: clash } = await supabase
    .from("appointment")
    .select("appointment_id")
    .eq("doctor_id", doctorId)
    .eq("date_time", isoDateTime)
    .maybeSingle();

  if (clash) {
    showMessage(
      "That slot is already booked for this doctor. Please choose another time.",
      "error",
    );
    return;
  }

  // --- Actual insert ---
  const { error: insertError } = await supabase.from("appointment").insert({
    patient_id: currentPatientId,
    doctor_id: doctorId,
    date_time: isoDateTime,
    status: "Booked",
    reason,
  });

  if (insertError) {
    // Error code 23505 = unique constraint violation. This is the real
    // guard against double-booking: if two people submitted for the
    // same doctor/time within milliseconds of each other, our pre-check
    // above might have missed it, but the database won't.
    if (insertError.code === "23505") {
      message.textContent =
        "That slot was just booked by someone else. Please choose another time.";
    } else {
      message.textContent = "Error booking appointment: " + insertError.message;
    }
    return;
  }

  showMessage("Appointment booked!", "success");
  form.reset();
  await loadMyAppointments();

  message.textContent = "Appointment booked!";
  form.reset();
  await loadMyAppointments();
  await loadReminders();
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});
