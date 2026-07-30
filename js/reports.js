// js/reports.js
import { supabase } from "./supabaseClient.js";

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

const whoami = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");

const rangeForm = document.getElementById("rangeForm");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const message = document.getElementById("message");

const attendanceBody = document.getElementById("attendanceBody");
const utilizationBody = document.getElementById("utilizationBody");

init();

async function init() {
  // --- Auth guard ---
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "index.html";
    return;
  }

  const authUserId = sessionData.session.user.id;

  // Reports are for the Clinic Manager specifically (per the spec's
  // user story), not every staff role — so we check the role field,
  // not just "is this a staff row at all".
  const { data: staffRow, error } = await supabase
    .from("staff_user")
    .select("name, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !staffRow || staffRow.role !== "Manager") {
    window.location.href = "dashboard.html";
    return;
  }

  whoami.textContent = `${staffRow.name} (${staffRow.role})`;

  // Default range: last 30 days, so the page shows something useful
  // on first load instead of empty tables.
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  startDateInput.value = thirtyDaysAgo.toISOString().slice(0, 10);
  endDateInput.value = today.toISOString().slice(0, 10);

  await runReport();
}

rangeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await runReport();
});

async function runReport() {
  showMessage("Loading...");
  attendanceBody.innerHTML = "";
  utilizationBody.innerHTML = "";

  const startDate = startDateInput.value;
  const endDate = endDateInput.value;

  // endDate's date-only value means midnight — add one day so
  // appointments ON that day are included in the range.
  const endExclusive = new Date(endDate);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const { data: appointments, error } = await supabase
    .from("appointment")
    .select(
      `
      appointment_id,
      status,
      doctor:doctor_id ( doctor_id, first_name, last_name )
    `,
    )
    .gte("date_time", new Date(startDate).toISOString())
    .lt("date_time", endExclusive.toISOString());

  if (error) {
    showMessage("Error loading report: " + error.message, "error");
    return;
  }

  if (!appointments || appointments.length === 0) {
    showMessage("No appointments in this date range.", "error");
    return;
  }

  showMessage(`${appointments.length} appointment(s) in range.`, "success");

  renderAttendance(appointments);
  renderUtilization(appointments);
}

function renderAttendance(appointments) {
  // Count how many appointments fall into each status. A plain object
  // used as a tally: { "Booked": 5, "Completed": 12, ... }
  const counts = {};
  appointments.forEach((appt) => {
    counts[appt.status] = (counts[appt.status] || 0) + 1;
  });

  attendanceBody.innerHTML = Object.entries(counts)
    .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td></tr>`)
    .join("");
}

function renderUtilization(appointments) {
  // Group appointments by doctor, tallying status counts per doctor.
  const byDoctor = {}; // doctor_id -> { name, total, Completed, No-show, Cancelled }

  appointments.forEach((appt) => {
    const doc = appt.doctor;
    if (!doc) return; // shouldn't happen, but guard against bad data

    if (!byDoctor[doc.doctor_id]) {
      byDoctor[doc.doctor_id] = {
        name: `Dr. ${doc.first_name} ${doc.last_name}`,
        total: 0,
        Completed: 0,
        "No-show": 0,
        Cancelled: 0,
      };
    }

    const entry = byDoctor[doc.doctor_id];
    entry.total++;
    if (appt.status in entry) {
      entry[appt.status]++;
    }
  });

  utilizationBody.innerHTML = Object.values(byDoctor)
    .map((entry) => {
      // "Completion rate" here means: of all appointments booked with
      // this doctor in the range, what share were actually completed.
      // This is our working definition of "utilization" for the MVP.
      const rate =
        entry.total > 0 ? Math.round((entry.Completed / entry.total) * 100) : 0;

      return `
        <tr>
          <td>${entry.name}</td>
          <td>${entry.total}</td>
          <td>${entry.Completed}</td>
          <td>${entry["No-show"]}</td>
          <td>${entry.Cancelled}</td>
          <td>${rate}%</td>
        </tr>
      `;
    })
    .join("");
}

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});
