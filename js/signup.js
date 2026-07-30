// js/signup.js
import { supabase } from "./supabaseClient.js";

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

const roleSelect = document.getElementById("role");
const doctorFields = document.getElementById("doctorFields");
const form = document.getElementById("signupForm");
const message = document.getElementById("message");

roleSelect.addEventListener("change", () => {
  doctorFields.style.display = roleSelect.value === "doctor" ? "block" : "none";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "Creating account...";

  const role = roleSelect.value;
  const firstName = document.getElementById("firstName").value;
  const lastName = document.getElementById("lastName").value;
  const dob = document.getElementById("dob").value;
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
  if (role === "patient") {
    const { error } = await supabase.from("patient").insert({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      dob,
      auth_user_id: authUserId,
    });
    profileError = error;
  } else {
    const specialty = document.getElementById("specialty").value;
    const { error } = await supabase.from("doctor").insert({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      specialty,
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

  showMessage(
    "Account created! Check your email to confirm, then log in.",
    "success",
  );
});
