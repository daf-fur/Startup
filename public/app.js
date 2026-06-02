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
let authMode = "login";

// ── Auth ──────────────────────────────────────────────────────────────────────

const FREE_LIMIT = 20;

function updateMessageCounter(used) {
  const counter = document.getElementById("message-counter");
  const remaining = FREE_LIMIT - used;
  if (remaining <= 0) {
    counter.textContent = "Free limit reached";
    counter.classList.add("near-limit");
  } else {
    counter.textContent = `${remaining} free message${remaining === 1 ? "" : "s"} left`;
    counter.classList.toggle("near-limit", remaining <= 5);
  }
}

function showApp() {
  document.getElementById("auth-overlay").hidden = true;
  document.getElementById("main-app").hidden = false;
  updateMessageCounter(currentUser.message_count || 0);
  initProfile();
  loadWorkouts();
}

function showAuth() {
  document.getElementById("auth-overlay").hidden = false;
  document.getElementById("main-app").hidden = true;
  conversationHistory = [];
  allWorkouts = [];
  chatBox.innerHTML = "";
}

async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      showApp();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById("tab-login").classList.toggle("active", mode === "login");
  document.getElementById("tab-signup").classList.toggle("active", mode === "signup");
  document.getElementById("auth-submit").textContent = mode === "login" ? "Log in" : "Create account";
  document.getElementById("auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
  document.getElementById("auth-error").hidden = true;
}

document.getElementById("tab-login").addEventListener("click", () => setAuthMode("login"));
document.getElementById("tab-signup").addEventListener("click", () => setAuthMode("signup"));

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

    if (!res.ok) {
      errorEl.textContent = data.error || "Something went wrong.";
      errorEl.hidden = false;
      return;
    }

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

// ── Profile ───────────────────────────────────────────────────────────────────

function initProfile() {
  if (!currentUser) return;
  document.getElementById("profile-name").value = currentUser.name || "";
  document.getElementById("profile-age").value = currentUser.age || "";
  document.getElementById("profile-goal").value = currentUser.goal || "";
  document.getElementById("profile-level").value = currentUser.level || "";
}

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const updates = {
    name: document.getElementById("profile-name").value.trim(),
    age: document.getElementById("profile-age").value.trim(),
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
      const data = await res.json();
      currentUser = data.user;
      profileStatus.textContent = "Saved — the coach will now personalise advice for you.";
      profileStatus.style.color = "#a8d98a";
      setTimeout(() => { profileStatus.textContent = ""; }, 3000);
    }
  } catch {
    profileStatus.textContent = "Could not save profile.";
    profileStatus.style.color = "#e07b4a";
  }
});

// ── Chart ─────────────────────────────────────────────────────────────────────

function populateExerciseSelect(workouts) {
  const exercises = [...new Set(workouts.map((w) => w.exercise))];
  const prev = chartExerciseSelect.value;
  chartExerciseSelect.innerHTML = '<option value="">View progress for an exercise…</option>';
  exercises.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === prev) opt.selected = true;
    chartExerciseSelect.appendChild(opt);
  });
}

function renderChart(exerciseName) {
  const chartWrap = document.getElementById("chart-wrap");
  const chartEmpty = document.getElementById("chart-empty-state");
  const data = allWorkouts
    .filter((w) => w.exercise === exerciseName && w.weight)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (data.length === 0) {
    chartWrap.hidden = true;
    if (chartEmpty) chartEmpty.hidden = false;
    return;
  }

  chartWrap.hidden = false;
  if (chartEmpty) chartEmpty.hidden = true;

  const labels = data.map((w) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(w.date))
  );

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  chartInstance = new Chart(document.getElementById("progress-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: data.map((w) => w.weight),
        borderColor: "rgba(234, 224, 213, 0.85)",
        backgroundColor: "rgba(234, 224, 213, 0.07)",
        borderWidth: 2,
        pointRadius: 5,
        pointBackgroundColor: "rgba(234, 224, 213, 0.9)",
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1f1b18",
          titleColor: "rgba(234,224,213,0.9)",
          bodyColor: "rgba(234,224,213,0.65)",
          callbacks: {
            title: (items) => labels[items[0].dataIndex],
            label: (item) => {
              const w = data[item.dataIndex];
              return `${w.weight} lbs · ${w.sets} sets × ${w.reps} reps`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(234,224,213,0.06)" },
          ticks: { color: "rgba(234,224,213,0.45)", font: { size: 11 } },
        },
        y: {
          grid: { color: "rgba(234,224,213,0.06)" },
          ticks: { color: "rgba(234,224,213,0.45)", font: { size: 11 } },
          title: { display: true, text: "lbs", color: "rgba(234,224,213,0.4)", font: { size: 11 } },
        },
      },
    },
  });
}

chartExerciseSelect.addEventListener("change", () => {
  const chartWrap = document.getElementById("chart-wrap");
  const chartEmpty = document.getElementById("chart-empty-state");
  if (chartExerciseSelect.value) {
    renderChart(chartExerciseSelect.value);
  } else {
    chartWrap.hidden = true;
    if (chartEmpty) chartEmpty.hidden = false;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
}

function formatReply(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

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

function showWorkoutStatus(message, status = "info") {
  workoutStatus.textContent = message;
  workoutStatus.style.color =
    status === "warn" ? "#e07b4a" : status === "success" ? "#a8d98a" : "var(--muted)";
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(dateString));
}

// ── Event listeners ───────────────────────────────────────────────────────────

chatForm.addEventListener("submit", async (e) => { e.preventDefault(); await handleChat(); });
workoutForm.addEventListener("submit", async (e) => { e.preventDefault(); await handleWorkout(); });
refreshButton.addEventListener("click", loadWorkouts);
clearWorkout.addEventListener("click", () => workoutForm.reset());
clearChat.addEventListener("click", () => {
  chatBox.innerHTML = "";
  conversationHistory = [];
  userInput.focus();
});

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
      trainerBubble.innerHTML = `<strong>Free limit reached</strong><em>You've used all ${FREE_LIMIT} free messages. Paid plans are coming soon — check back shortly.</em>`;
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
    userInput.disabled = false;
    userInput.focus();
  }
}

// ── Workout log ───────────────────────────────────────────────────────────────

async function handleWorkout() {
  const exercise = document.getElementById("exercise").value.trim();
  const sets = document.getElementById("sets").value.trim();
  const reps = document.getElementById("reps").value.trim();
  const weight = document.getElementById("weight").value.trim();

  if (!exercise) { showWorkoutStatus("Name the movement before logging it.", "warn"); return; }

  showWorkoutStatus("Saving your set…");
  setButtonState(workoutForm.querySelector(".primary-button"), true);

  try {
    await fetch("/api/workout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise, sets, reps, weight }),
    });
    showWorkoutStatus("Workout logged. Keep the momentum going.", "success");
    workoutForm.reset();
    await loadWorkouts();
  } catch {
    showWorkoutStatus("Could not save workout. Check your connection.", "warn");
  } finally {
    setButtonState(workoutForm.querySelector(".primary-button"), false);
  }
}

async function deleteWorkout(id) {
  try {
    await fetch(`/api/workout/${id}`, { method: "DELETE" });
    await loadWorkouts();
  } catch {
    // silently ignore
  }
}

// ── History ───────────────────────────────────────────────────────────────────

async function loadWorkouts() {
  const list = document.getElementById("workout-list");
  const chartSection = document.getElementById("chart-section");

  try {
    const res = await fetch("/api/workouts");
    const workouts = await res.json();

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

    list.innerHTML = workouts
      .slice()
      .reverse()
      .map((w) => `
        <div class="history-entry">
          <strong>${escapeHtml(w.exercise)}</strong>
          <span>${w.sets} sets · ${w.reps} reps${w.weight ? ` · ${w.weight} lbs` : ""}</span>
          <time>${formatDate(w.date)}</time>
          <button class="delete-btn" data-id="${w.id}" aria-label="Delete entry">×</button>
        </div>
      `)
      .join("");

    list.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteWorkout(btn.dataset.id));
    });
  } catch {
    list.innerHTML = '<div class="history-entry"><strong>Unable to load history.</strong><time>Retry with the refresh button.</time></div>';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

checkAuth();
