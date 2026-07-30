// js/login.js
import { supabase } from "./supabaseClient.js";

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

const form = document.getElementById("loginForm");
const message = document.getElementById("message");

// "submit" fires when the form's button is clicked OR when the user
// presses Enter inside a field — that's why we listen on the form,
// not on the button itself.
form.addEventListener("submit", async (e) => {
  // Forms reload the page by default on submit. We don't want that —
  // we want to handle the login with JS instead — so we stop it here.
  e.preventDefault();

  showMessage("Logging in...");

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  // Step 1: authenticate with Supabase Auth.
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError) {
    showMessage("Error: " + authError.message, "error");
    return;
  }

  const authUserId = authData.user.id;

  // Step 2: figure out WHICH role this person is. We didn't store the
  // role anywhere on the Auth user itself, so we ask each profile table
  // in turn: "is there a row here whose auth_user_id matches?"
  // We check staff first, then doctor, then patient — order doesn't
  // matter for correctness, just pick one and stick with it.

  const { data: staffRow } = await supabase
    .from("staff_user")
    .select("staff_id, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle(); // maybeSingle() returns null instead of throwing if no row matches

  if (staffRow) {
    showMessage("Welcome back! Redirecting...", "success");
    window.location.href = "dashboard.html";
    return;
  }

  const { data: doctorRow } = await supabase
    .from("doctor")
    .select("doctor_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (doctorRow) {
    showMessage("Welcome back! Redirecting...", "success");
    window.location.href = "dashboard.html";
    return;
  }

  const { data: patientRow } = await supabase
    .from("patient")
    .select("patient_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (patientRow) {
    showMessage(
      "Logged in, but no matching profile was found. Contact support.",
      "error",
    );
    window.location.href = "booking.html";
    return;
  }

  // If we get here, the Auth login worked but no profile row exists
  // anywhere — this is the "orphaned user" situation from your leftover
  // test signup. Tell the user clearly instead of silently redirecting.
  message.textContent =
    "Logged in, but no matching profile was found. Contact support.";
});
