// js/signup.js
import { supabase } from "./supabaseClient.js";

const form = document.getElementById("signupForm");
const message = document.getElementById("message");

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("Creating account...");

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

  const { error: profileError } = await supabase.from("patient").insert({
    first_name: firstName,
    last_name: lastName,
    phone,
    email,
    dob,
    auth_user_id: authUserId,
  });

  if (profileError) {
    showMessage(
      "Account created, but profile failed: " + profileError.message,
      "error",
    );
    return;
  }

  showMessage("Account created! You can log in now.", "success");
});
