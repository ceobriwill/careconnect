// js/staff-signup.js
import { supabase } from "./supabaseClient.js";

// Simple shared secret — an Admin gives this out to new hires.
const STAFF_INVITE_CODE = "careconnect-staff-2026";

const form = document.getElementById("staffSignupForm");
const message = document.getElementById("message");
const roleSelect = document.getElementById("role");
const specialtyField = document.getElementById("specialtyField");

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

roleSelect.addEventListener("change", () => {
  specialtyField.style.display =
    roleSelect.value === "Doctor" ? "block" : "none";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const inviteCode = document.getElementById("inviteCode").value;
  if (inviteCode !== STAFF_INVITE_CODE) {
    showMessage("Invalid invite code.", "error");
    return;
  }

  showMessage("Creating account...");

  const role = roleSelect.value;
  const name = document.getElementById("name").value;
  const username = document.getElementById("username").value;
  const phone = document.getElementById("phone").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    showMessage("Error: " + authError.message, "error");
    return;
  }

  const authUserId = authData.user.id;
  let profileError;

  if (role === "Doctor") {
    // Doctor table wants first/last name separately, no username field.
    const [firstName, ...rest] = name.trim().split(" ");
    const lastName = rest.join(" ") || firstName;
    const specialty = document.getElementById("specialty").value;

    const { error } = await supabase.from("doctor").insert({
      first_name: firstName,
      last_name: lastName,
      specialty,
      email,
      phone,
      auth_user_id: authUserId,
    });
    profileError = error;
  } else {
    // staff_user table wants name/role/username, no phone field.
    const { error } = await supabase.from("staff_user").insert({
      name,
      role,
      username,
      auth_user_id: authUserId,
    });
    profileError = error;
  }

  if (profileError) {
    showMessage(
      "Account created, but profile failed: " + profileError.message,
      "error",
    );
    return;
  }

  showMessage("Staff account created! You can now log in.", "success");
});
