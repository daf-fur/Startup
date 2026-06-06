// ── DOM refs ──────────────────────────────────────────────────────────────────

const chatForm = document.getElementById("chat-form");
const workoutForm = document.getElementById("workout-form");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const refreshButton = document.getElementById("refresh-button");
const workoutStatus = document.getElementById("workout-status");
const clearWorkout = document.getElementById("clear-workout");
const clearChat = document.getElementById("clear-chat");
const profileForm = document.getElementById("profile-form");
const profileStatus = document.getElementById("profile-status");
const chartExerciseSelect = document.getElementById("chart-exercise");

// ── State ─────────────────────────────────────────────────────────────────────

let currentUser = null;
let conversationHistory = [];
let allWorkouts = [];
let chartInstance = null;
let bodyChartInstance = null;
let authMode = "login";

const FREE_LIMIT = 5;

// ── Auth overlay ──────────────────────────────────────────────────────────────

function showApp() {
  document.getElementById("auth-overlay").hidden = true;
  document.getElementById("main-app").hidden = false;

  userInput.disabled = currentUser.is_subscribed ? false : (currentUser.message_count || 0) >= FREE_LIMIT;
  sendButton.disabled = userInput.disabled;

  updateMessageCounter(currentUser.message_count || 0);
  updateStreakDisplay(currentUser.current_streak || 0);
  document.getElementById("manage-billing").hidden = !currentUser.is_subscribed;
  initProfile();
  loadWorkouts();
  loadBodyWeights();

  const params = new URLSearchParams(window.location.search);
  const checkoutResult = params.get("checkout");
  const resetToken = params.get("reset");

  if (checkoutResult) {
    window.history.replaceState({}, "", "/");
    if (checkoutResult === "success") {
      const banner = document.getElementById("checkout-banner");
      document.getElementById("checkout-banner-text").textContent = "You're now on Pro — unlimited coaching unlocked!";
      banner.hidden = false;
      setTimeout(() => { banner.hidden = true; }, 6000);
    }
  }

  if (resetToken) {
    window.history.replaceState({}, "", "/");
  }
}

function showAuth(mode = "login") {
  document.getElementById("auth-overlay").hidden = false;
  document.getElementById("main-app").hidden = true;
  conversationHistory = [];
  allWorkouts = [];
  chatBox.innerHTML = "";
  setAuthMode(mode);
}

async function checkAuth() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("reset");

  if (resetToken) {
    window.history.replaceState({}, "", "/");
    showResetForm(resetToken);
    return;
  }

  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      currentUser = (await res.json()).user;
      showApp();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

// ── Auth modes ────────────────────────────────────────────────────────────────

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById("auth-tabs").hidden = false;
  document.getElementById("auth-form").hidden = false;
  document.getElementById("forgot-form").hidden = true;
  document.getElementById("reset-form").hidden = true;
  document.getElementById("tab-login").classList.toggle("active", mode === "login");
  document.getElementById("tab-signup").classList.toggle("active", mode === "signup");
  document.getElementById("auth-submit").textContent = mode === "login" ? "Log in" : "Create account";
  document.getElementById("auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
  document.getElementById("auth-error").hidden = true;
  document.getElementById("auth-title").textContent = "Track your progress.";
  document.getElementById("auth-sub").textContent = "Guided by AI, built around you.";
}

function showForgotForm() {
  document.getElementById("auth-tabs").hidden = true;
  document.getElementById("auth-form").hidden = true;
  document.getElementById("forgot-form").hidden = false;
  document.getElementById("reset-form").hidden = true;
  document.getElementById("forgot-error").hidden = true;
  document.getElementById("forgot-success").hidden = true;
  document.getElementById("auth-title").textContent = "Reset your password.";
  document.getElementById("auth-sub").textContent = "We'll email you a reset link.";
}

function showResetForm(token) {
  document.getElementById("auth-overlay").hidden = false;
  document.getElementById("main-app").hidden = true;
  document.getElementById("auth-tabs").hidden = true;
  document.getElementById("auth-form").hidden = true;
  document.getElementById("forgot-form").hidden = true;
  document.getElementById("reset-form").hidden = false;
  document.getElementById("reset-form").dataset.token = token;
  document.getElementById("reset-error").hidden = true;
  document.getElementById("auth-title").textContent = "Choose a new password.";
  document.getElementById("auth-sub").textContent = "";
}

document.getElementById("tab-login").addEventListener("click", () => setAuthMode("login"));
document.getElementById("tab-signup").addEventListener("click", () => setAuthMode("signup"));
document.getElementById("forgot-link").addEventListener("click", showForgotForm);
document.getElementById("back-to-login").addEventListener("click", () => setAuthMode("login"));

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errorEl = document.getElementById("auth-error");
  const submitBtn = document.getElementById("auth-submit");
  errorEl.hidden = true;
  setButtonState(submitBtn, true);
  try {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || "Something went wrong."; errorEl.hidden = false; return; }
    currentUser = data.user;
    showApp();
  } catch {
    errorEl.textContent = "Connection error. Please try again.";
    errorEl.hidden = false;
  } finally {
    setButtonState(submitBtn, false);
  }
});

document.getElementById("forgot-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("forgot-email").value.trim();
  const errorEl = document.getElementById("forgot-error");
  const successEl = document.getElementById("forgot-success");
  const submitBtn = document.getElementById("forgot-submit");
  errorEl.hidden = true;
  successEl.hidden = true;
  setButtonState(submitBtn, true);
  try {
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    successEl.textContent = "If that email exists, a reset link is on its way.";
    successEl.hidden = false;
  } catch {
    errorEl.textContent = "Connection error. Please try again.";
    errorEl.hidden = false;
  } finally {
    setButtonState(submitBtn, false);
  }
});

document.getElementById("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = e.target.dataset.token;
  const password = document.getElementById("reset-password").value;
  const errorEl = document.getElementById("reset-error");
  const submitBtn = document.getElementById("reset-submit");
  errorEl.hidden = true;
  setButtonState(submitBtn, true);
  try {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error; errorEl.hidden = false; return; }
    currentUser = data.user;
    showApp();
  } catch {
    errorEl.textContent = "Connection error. Please try again.";
    errorEl.hidden = false;
  } finally {
    setButtonState(submitBtn, false);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser = null;
  showAuth();
});

document.getElementById("manage-billing").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  } catch { alert("Could not open billing portal. Please try again."); }
});

document.getElementById("checkout-banner-close").addEventListener("click", () => {
  document.getElementById("checkout-banner").hidden = true;
});

async function handleUpgrade() {
  const btn = document.getElementById("upgrade-btn");
  if (btn) setButtonState(btn, true);
  try {
    const res = await fetch("/api/billing/checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; }
    else { alert(data.error || "Could not start checkout."); if (btn) setButtonState(btn, false); }
  } catch { alert("Connection error. Please try again."); if (btn) setButtonState(btn, false); }
}

// ── Profile ───────────────────────────────────────────────────────────────────

function initProfile() {
  if (!currentUser) return;
  document.getElementById("profile-name").value = currentUser.name || "";
  document.getElementById("profile-age").value = currentUser.age || "";
  document.getElementById("profile-height").value = currentUser.height || "";
  document.getElementById("profile-goal").value = currentUser.goal || "";
  document.getElementById("profile-level").value = currentUser.level || "";
}

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const updates = {
    name: document.getElementById("profile-name").value.trim(),
    age: document.getElementById("profile-age").value.trim(),
    height: document.getElementById("profile-height").value.trim(),
    goal: document.getElementById("profile-goal").value,
    level: document.getElementById("profile-level").value,
  };
  try {
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      currentUser = (await res.json()).user;
      profileStatus.textContent = "Saved — the coach will now personalise advice for you.";
      profileStatus.style.color = "#a8d98a";
      setTimeout(() => { profileStatus.textContent = ""; }, 3000);
    }
  } catch {
    profileStatus.textContent = "Could not save profile.";
    profileStatus.style.color = "#e07b4a";
  }
});

// ── Counters ──────────────────────────────────────────────────────────────────

function updateStreakDisplay(streak) {
  const el = document.getElementById("streak-display");
  if (!streak || streak < 1) { el.hidden = true; return; }
  el.hidden = false;
  document.getElementById("streak-count").textContent = streak;
}

function updateMessageCounter(used) {
  const counter = document.getElementById("message-counter");
  if (currentUser?.is_subscribed) { counter.textContent = "Pro"; counter.classList.remove("near-limit"); return; }
  const remaining = FREE_LIMIT - used;
  if (remaining <= 0) { counter.textContent = "Free limit reached"; counter.classList.add("near-limit"); }
  else { counter.textContent = `${remaining} free message${remaining === 1 ? "" : "s"} left`; counter.classList.toggle("near-limit", remaining <= 2); }
}

// ── Chart (workouts) ──────────────────────────────────────────────────────────

function getPRIds(workouts) {
  const best = {};
  workouts.forEach((w) => {
    if (w.weight && parseFloat(w.weight) > 0) {
      if (!best[w.exercise] || parseFloat(w.weight) > parseFloat(best[w.exercise].weight)) best[w.exercise] = w;
    }
  });
  return new Set(Object.values(best).map((w) => w.id));
}

function populateExerciseSelect(workouts) {
  const exercises = [...new Set(workouts.map((w) => w.exercise))];
  const prev = chartExerciseSelect.value;
  chartExerciseSelect.innerHTML = '<option value="">View progress for an exercise…</option>';
  exercises.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    if (name === prev) opt.selected = true;
    chartExerciseSelect.appendChild(opt);
  });
}

function renderChart(exerciseName) {
  const chartWrap = document.getElementById("chart-wrap");
  const chartEmpty = document.getElementById("chart-empty-state");
  const data = allWorkouts.filter((w) => w.exercise === exerciseName && w.weight).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (data.length === 0) { chartWrap.hidden = true; if (chartEmpty) chartEmpty.hidden = false; return; }
  chartWrap.hidden = false;
  if (chartEmpty) chartEmpty.hidden = true;
  const labels = data.map((w) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(w.date)));
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  chartInstance = new Chart(document.getElementById("progress-chart"), {
    type: "line",
    data: { labels, datasets: [{ data: data.map((w) => w.weight), borderColor: "rgba(234,224,213,0.85)", backgroundColor: "rgba(234,224,213,0.07)", borderWidth: 2, pointRadius: 5, pointBackgroundColor: "rgba(234,224,213,0.9)", tension: 0.35, fill: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1f1b18", titleColor: "rgba(234,224,213,0.9)", bodyColor: "rgba(234,224,213,0.65)", callbacks: { title: (items) => labels[items[0].dataIndex], label: (item) => { const w = data[item.dataIndex]; return `${w.weight} lbs · ${w.sets} sets × ${w.reps} reps`; } } } },
      scales: { x: { grid: { color: "rgba(234,224,213,0.06)" }, ticks: { color: "rgba(234,224,213,0.45)", font: { size: 11 } } }, y: { grid: { color: "rgba(234,224,213,0.06)" }, ticks: { color: "rgba(234,224,213,0.45)", font: { size: 11 } }, title: { display: true, text: "lbs", color: "rgba(234,224,213,0.4)", font: { size: 11 } } } },
    },
  });
}

chartExerciseSelect.addEventListener("change", () => {
  const chartWrap = document.getElementById("chart-wrap");
  const chartEmpty = document.getElementById("chart-empty-state");
  if (chartExerciseSelect.value) { renderChart(chartExerciseSelect.value); }
  else { chartWrap.hidden = true; if (chartEmpty) chartEmpty.hidden = false; if (chartInstance) { chartInstance.destroy(); chartInstance = null; } }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
}

function formatReply(text) { return escapeHtml(text).replace(/\n/g, "<br>"); }

function setButtonState(button, isDisabled) {
  button.disabled = isDisabled;
  button.style.opacity = isDisabled ? "0.65" : "1";
}

function appendMessage(content, role) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.innerHTML = content;
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
  return bubble;
}

function showStatus(el, message, status = "info") {
  el.textContent = message;
  el.style.color = status === "warn" ? "#e07b4a" : status === "success" ? "#a8d98a" : "var(--muted)";
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(dateString));
}

function formatDateShort(dateString) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(dateString));
}

// ── Event listeners ───────────────────────────────────────────────────────────

chatForm.addEventListener("submit", async (e) => { e.preventDefault(); await handleChat(); });
workoutForm.addEventListener("submit", async (e) => { e.preventDefault(); await handleWorkout(); });
refreshButton.addEventListener("click", loadWorkouts);
clearWorkout.addEventListener("click", () => workoutForm.reset());
clearChat.addEventListener("click", () => { chatBox.innerHTML = ""; conversationHistory = []; userInput.focus(); });

// ── Chat ──────────────────────────────────────────────────────────────────────

async function handleChat() {
  const message = userInput.value.trim();
  if (!message) { userInput.focus(); return; }
  appendMessage(`<strong>You</strong><em>${escapeHtml(message)}</em>`, "user");
  userInput.value = "";
  setButtonState(sendButton, true);
  userInput.disabled = true;
  const trainerBubble = appendMessage(`<strong>Trainer</strong><em>Thinking…</em>`, "trainer");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: conversationHistory }),
    });
    if (res.status === 402) {
      trainerBubble.className = "message limit-reached";
      trainerBubble.innerHTML = `<strong>Free limit reached</strong><em>You've used all ${FREE_LIMIT} free messages. Upgrade to keep chatting with your AI coach.</em><button class="primary-button compact upgrade-btn" id="upgrade-btn">Upgrade to Pro</button>`;
      document.getElementById("upgrade-btn").addEventListener("click", handleUpgrade);
      updateMessageCounter(FREE_LIMIT);
      userInput.disabled = true;
      sendButton.disabled = true;
      return;
    }
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const reply = data.reply || "Sorry, I couldn't generate a response right now.";
    conversationHistory.push({ role: "user", content: message });
    conversationHistory.push({ role: "assistant", content: reply });
    trainerBubble.innerHTML = `<strong>Trainer</strong><em>${formatReply(reply)}</em>`;
    updateMessageCounter(data.messagesUsed || 0);
  } catch {
    trainerBubble.innerHTML = `<strong>Trainer</strong><em>Sorry, the coach is offline. Try again in a moment.</em>`;
  } finally {
    setButtonState(sendButton, false);
    userInput.disabled = !!currentUser?.is_subscribed ? false : (currentUser?.message_count || 0) >= FREE_LIMIT;
    userInput.focus();
  }
}

// ── Workout log ───────────────────────────────────────────────────────────────

async function handleWorkout() {
  const exercise = document.getElementById("exercise").value.trim();
  const sets = document.getElementById("sets").value.trim();
  const reps = document.getElementById("reps").value.trim();
  const weight = document.getElementById("weight").value.trim();
  const notes = document.getElementById("notes").value.trim();
  if (!exercise) { showStatus(workoutStatus, "Name the movement before logging it.", "warn"); return; }
  showStatus(workoutStatus, "Saving your set…");
  setButtonState(workoutForm.querySelector(".primary-button"), true);
  try {
    const response = await fetch("/api/workout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise, sets, reps, weight, notes }),
    });
    const data = await response.json();
    const msg = data.isPR ? `New personal record on ${exercise}!` : "Workout logged. Keep the momentum going.";
    showStatus(workoutStatus, msg, "success");
    if (data.streak) updateStreakDisplay(data.streak.current);
    workoutForm.reset();
    await loadWorkouts();
  } catch {
    showStatus(workoutStatus, "Could not save workout. Check your connection.", "warn");
  } finally {
    setButtonState(workoutForm.querySelector(".primary-button"), false);
  }
}

async function deleteWorkout(id) {
  try { await fetch(`/api/workout/${id}`, { method: "DELETE" }); await loadWorkouts(); } catch {}
}

async function loadWorkouts() {
  const list = document.getElementById("workout-list");
  const chartSection = document.getElementById("chart-section");
  try {
    const workouts = await fetch("/api/workouts").then((r) => r.json());
    if (!Array.isArray(workouts) || workouts.length === 0) {
      allWorkouts = [];
      list.innerHTML = '<div class="history-entry"><strong>No history yet.</strong><time>Log a workout to see your session archive.</time></div>';
      chartSection.hidden = true;
      return;
    }
    allWorkouts = workouts;
    chartSection.hidden = false;
    populateExerciseSelect(workouts);
    if (chartExerciseSelect.value) renderChart(chartExerciseSelect.value);
    const prIds = getPRIds(workouts);
    list.innerHTML = workouts.slice().reverse().map((w) => `
      <div class="history-entry">
        <strong>${escapeHtml(w.exercise)}${prIds.has(w.id) && w.weight ? '<span class="pr-badge">PR</span>' : ""}</strong>
        <span>${w.sets} sets · ${w.reps} reps${w.weight ? ` · ${w.weight} lbs` : ""}</span>
        ${w.notes ? `<span class="entry-notes">${escapeHtml(w.notes)}</span>` : ""}
        <time>${formatDate(w.date)}</time>
        <button class="delete-btn" data-id="${w.id}" aria-label="Delete entry">×</button>
      </div>`).join("");
    list.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", () => deleteWorkout(btn.dataset.id)));
  } catch {
    list.innerHTML = '<div class="history-entry"><strong>Unable to load history.</strong><time>Retry with the refresh button.</time></div>';
  }
}

// ── Body weight log ───────────────────────────────────────────────────────────

document.getElementById("body-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const weight = document.getElementById("body-weight").value.trim();
  const bodyStatus = document.getElementById("body-status");
  if (!weight) { showStatus(bodyStatus, "Enter a weight to log.", "warn"); return; }
  const btn = e.target.querySelector(".primary-button");
  setButtonState(btn, true);
  try {
    await fetch("/api/body-weight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weight }) });
    showStatus(bodyStatus, "Weight logged.", "success");
    setTimeout(() => { bodyStatus.textContent = ""; }, 2500);
    document.getElementById("body-weight").value = "";
    await loadBodyWeights();
  } catch {
    showStatus(bodyStatus, "Could not save. Try again.", "warn");
  } finally {
    setButtonState(btn, false);
  }
});

async function deleteBodyWeight(id) {
  try { await fetch(`/api/body-weight/${id}`, { method: "DELETE" }); await loadBodyWeights(); } catch {}
}

async function loadBodyWeights() {
  const list = document.getElementById("body-list");
  const chartWrap = document.getElementById("body-chart-wrap");
  const emptyState = document.getElementById("body-empty-state");
  try {
    const entries = await fetch("/api/body-weights").then((r) => r.json());
    if (!Array.isArray(entries) || entries.length === 0) {
      list.innerHTML = "";
      chartWrap.hidden = true;
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    chartWrap.hidden = false;

    const sorted = entries.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map((e) => formatDateShort(e.date));
    const weights = sorted.map((e) => e.weight);

    if (bodyChartInstance) { bodyChartInstance.destroy(); bodyChartInstance = null; }
    bodyChartInstance = new Chart(document.getElementById("body-chart"), {
      type: "line",
      data: { labels, datasets: [{ data: weights, borderColor: "rgba(234,224,213,0.85)", backgroundColor: "rgba(234,224,213,0.07)", borderWidth: 2, pointRadius: 5, pointBackgroundColor: "rgba(234,224,213,0.9)", tension: 0.35, fill: true }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1f1b18", titleColor: "rgba(234,224,213,0.9)", bodyColor: "rgba(234,224,213,0.65)", callbacks: { label: (item) => `${item.parsed.y} lbs` } } },
        scales: { x: { grid: { color: "rgba(234,224,213,0.06)" }, ticks: { color: "rgba(234,224,213,0.45)", font: { size: 11 } } }, y: { grid: { color: "rgba(234,224,213,0.06)" }, ticks: { color: "rgba(234,224,213,0.45)", font: { size: 11 } }, title: { display: true, text: "lbs", color: "rgba(234,224,213,0.4)", font: { size: 11 } } } },
      },
    });

    list.innerHTML = entries.slice(0, 10).map((e) => `
      <div class="history-entry">
        <strong>${e.weight} lbs</strong>
        <time>${formatDate(e.date)}</time>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete entry">×</button>
      </div>`).join("");
    list.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", () => deleteBodyWeight(btn.dataset.id)));
  } catch {
    list.innerHTML = "";
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

checkAuth();
