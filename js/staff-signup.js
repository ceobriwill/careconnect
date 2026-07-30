// js/staff-signup.js
import { supabase } from "./supabaseClient.js";

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

// Simple shared secret — an Admin gives this out to new hires.
// Not bulletproof security, but reasonable for a school project where
// the alternative (a real admin backend) is out of scope for now.
const STAFF_INVITE_CODE = "princewill";

const form = document.getElementById("staffSignupForm");
const message = document.getElementById("message");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const inviteCode = document.getElementById("inviteCode").value;
  if (inviteCode !== STAFF_INVITE_CODE) {
    showMessage("Invalid invite code.", "error");
    return;
  }

  showMessage("Creating account...");

  const role = document.getElementById("role").value;
  const name = document.getElementById("name").value;
  const username = document.getElementById("username").value;
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

  const { error: profileError } = await supabase.from("staff_user").insert({
    name,
    role,
    username,
    auth_user_id: authUserId,
  });

  if (profileError) {
    showMessage(
      "Account created, but profile failed: " + profileError.message,
      "error",
    );
    return;
  }

  showMessage("Staff account created! You can now log in.", "success");
});
