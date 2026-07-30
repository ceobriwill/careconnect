// js/dashboard.js
import { supabase } from "./supabaseClient.js";

function statusBadge(status) {
  const cssClass = status.toLowerCase().replace(/\s+/g, "-"); // "No-show" -> "no-show"
  return `<span class="status status--${cssClass}">${status}</span>`;
}

const whoami = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");

const urgentList = document.getElementById("urgentList");
const urgentEmpty = document.getElementById("urgentEmpty");

const todayTableBody = document.getElementById("todayTableBody");
const todayEmpty = document.getElementById("todayEmpty");

init();

async function init() {
  // --- Auth guard ---
  // Anyone who lands on this page without a logged-in session gets
  // bounced back to login. We check this BEFORE running any queries.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "index.html";
    return; // stop here — nothing below this line should run
  }

  const authUserId = sessionData.session.user.id;
  await showWhoAmI(authUserId);
  await loadTodaysAppointments();
}

// Module-level flag — set once we know the role, read later when we
// render each appointment row so only doctors see the record link.
let isDoctor = false;

async function showWhoAmI(authUserId) {
  // Same "check staff, then doctor" pattern as login.js, just to get a
  // name/role to display in the header. If neither matches, this is a
  // patient who somehow ended up here, or an orphaned account.
  const { data: staffRow } = await supabase
    .from("staff_user")
    .select("name, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (staffRow) {
    whoami.textContent = `${staffRow.name} (${staffRow.role})`;
    document.getElementById("staffNav").style.display = "flex";

    // Reports is Manager-only — hide the link for Nurse/Admin so they
    // never see an option that would just redirect them away.
    if (staffRow.role !== "Manager") {
      document.getElementById("reportsLink").style.display = "none";
    }
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

async function loadTodaysAppointments() {
  // Build the start/end of "today" in ISO form so we can filter with
  // date_time >= startOfToday AND date_time < startOfTomorrow.
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  // Nested select: Supabase follows the foreign keys on patient_id and
  // doctor_id automatically since each appointment row has exactly one
  // of each. RLS still applies here — a doctor only gets back rows
  // where they're the doctor; staff get everything.
  const { data: appointments, error } = await supabase
    .from("appointment")
    .select(
      `
      appointment_id,
      date_time,
      status,
      reason,
      patient:patient_id ( first_name, last_name ),
      doctor:doctor_id ( first_name, last_name )
    `,
    )
    .gte("date_time", startOfToday.toISOString())
    .lt("date_time", startOfTomorrow.toISOString())
    .order("date_time", { ascending: true });

  if (error) {
    todayEmpty.textContent = "Error loading appointments: " + error.message;
    todayEmpty.style.display = "block";
    return;
  }

  if (!appointments || appointments.length === 0) {
    todayEmpty.style.display = "block";
    urgentEmpty.style.display = "block";
    return;
  }

  const THIRTY_MIN_MS = 30 * 60 * 1000;
  let urgentCount = 0;

  appointments.forEach((appt) => {
    const apptTime = new Date(appt.date_time);
    const patientName = `${appt.patient?.first_name ?? "Unknown"} ${appt.patient?.last_name ?? ""}`;
    const doctorName = `Dr. ${appt.doctor?.first_name ?? "Unknown"} ${appt.doctor?.last_name ?? ""}`;

    // --- Row in the main "today" table ---
    const actionCell = isDoctor
      ? `<a href="record.html?appointment_id=${appt.appointment_id}">Add/View Record</a>`
      : "";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${apptTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
      <td>${patientName}</td>
      <td>${doctorName}</td>
     <td>${statusBadge(appt.status)}</td>
      <td>${appt.reason ?? ""}</td>
      <td>${actionCell}</td>
    `;
    todayTableBody.appendChild(row);

    // --- "Starting soon" list ---
    // Only flag appointments that are still upcoming (not in the past)
    // and still Booked (not already Completed/Cancelled/No-show).
    const msUntil = apptTime - now;
    if (msUntil >= 0 && msUntil <= THIRTY_MIN_MS && appt.status === "Booked") {
      urgentCount++;
      const item = document.createElement("li");
      item.textContent = `${apptTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${patientName} with ${doctorName}`;
      urgentList.appendChild(item);
    }
  });

  if (urgentCount === 0) {
    urgentEmpty.style.display = "block";
  }
}

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});
