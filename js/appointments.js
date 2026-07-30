// js/appointments.js
import { supabase } from "./supabaseClient.js";
function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}
const whoami = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");

const filterForm = document.getElementById("filterForm");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const doctorFilter = document.getElementById("doctorFilter");
const statusFilter = document.getElementById("statusFilter");
const message = document.getElementById("message");
const apptTableBody = document.getElementById("apptTableBody");

init();

async function init() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "index.html";
    return;
  }

  const authUserId = sessionData.session.user.id;

  // Staff-only page — same gate pattern as patients.html
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

  await loadDoctorOptions();
  await runFilter(); // load everything on first visit, no filters applied
}

async function loadDoctorOptions() {
  const { data: doctors } = await supabase
    .from("doctor")
    .select("doctor_id, first_name, last_name")
    .order("last_name", { ascending: true });

  if (doctors) {
    doctorFilter.innerHTML =
      `<option value="">All doctors</option>` +
      doctors
        .map(
          (d) =>
            `<option value="${d.doctor_id}">Dr. ${d.first_name} ${d.last_name}</option>`,
        )
        .join("");
  }
}

filterForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await runFilter();
});

async function runFilter() {
  showMessage("Loading...");
  apptTableBody.innerHTML = "";

  let query = supabase
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
    .order("date_time", { ascending: false });

  // Each filter is optional — only applied if the field has a value
  if (startDateInput.value) {
    query = query.gte(
      "date_time",
      new Date(startDateInput.value).toISOString(),
    );
  }
  if (endDateInput.value) {
    const endExclusive = new Date(endDateInput.value);
    endExclusive.setDate(endExclusive.getDate() + 1);
    query = query.lt("date_time", endExclusive.toISOString());
  }
  if (doctorFilter.value) {
    query = query.eq("doctor_id", doctorFilter.value);
  }
  if (statusFilter.value) {
    query = query.eq("status", statusFilter.value);
  }

  const { data: appointments, error } = await query;

  if (error) {
    showMessage("Error loading appointments: " + error.message, "error");
    return;
  }

  if (!appointments || appointments.length === 0) {
    showMessage("No appointments match these filters.", "error");
    return;
  }

  showMessage(`${appointments.length} appointment(s).`, "success");

  apptTableBody.innerHTML = appointments
    .map((appt) => {
      const when = new Date(appt.date_time).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const patientName = `${appt.patient?.first_name ?? ""} ${appt.patient?.last_name ?? ""}`;
      const doctorName = `Dr. ${appt.doctor?.first_name ?? ""} ${appt.doctor?.last_name ?? ""}`;

      return `
        <tr>
          <td>${when}</td>
          <td>${patientName}</td>
          <td>${doctorName}</td>
          <td>${statusBadge(appt.status)}</td>
          <td>${appt.reason ?? ""}</td>
          <td>
            <select class="statusChange" data-id="${appt.appointment_id}">
              <option value="">Change status...</option>
              <option value="Booked">Booked</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No-show">No-show</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join("");

  // Dropdowns are created dynamically, so listeners attach after render
  document.querySelectorAll(".statusChange").forEach((select) => {
    select.addEventListener("change", async () => {
      const appointmentId = select.dataset.id;
      const newStatus = select.value;
      if (!newStatus) return;

      const { error } = await supabase
        .from("appointment")
        .update({ status: newStatus })
        .eq("appointment_id", appointmentId);

      if (error) {
        showMessage("Error updating status: " + error.message, "error");
      } else {
        await runFilter(); // refresh the table to show the new badge
      }
    });
  });
}

function statusBadge(status) {
  const cssClass = status.toLowerCase().replace(/\s+/g, "-");
  return `<span class="status status--${cssClass}">${status}</span>`;
}

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});
