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

let conversationHistory = [];
let allWorkouts = [];
let chartInstance = null;

// ── Profile ──────────────────────────────────────────────────────────────────

const PROFILE_KEY = "gym_profile";

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProfile(data) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
}

function initProfile() {
  const p = loadProfile();
  if (p.name) document.getElementById("profile-name").value = p.name;
  if (p.age) document.getElementById("profile-age").value = p.age;
  if (p.goal) document.getElementById("profile-goal").value = p.goal;
  if (p.level) document.getElementById("profile-level").value = p.level;
}

profileForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const profile = {
    name: document.getElementById("profile-name").value.trim(),
    age: document.getElementById("profile-age").value.trim(),
    goal: document.getElementById("profile-goal").value,
    level: document.getElementById("profile-level").value,
  };
  saveProfile(profile);
  profileStatus.textContent =
    "Saved — the coach will now personalise advice for you.";
  profileStatus.style.color = "#a8d98a";
  setTimeout(() => {
    profileStatus.textContent = "";
  }, 3000);
});

// ── Chart ─────────────────────────────────────────────────────────────────────

function populateExerciseSelect(workouts, keepSelected) {
  const exercises = [...new Set(workouts.map((w) => w.exercise))];
  const prev = keepSelected || chartExerciseSelect.value;
  chartExerciseSelect.innerHTML =
    '<option value="">View progress for an exercise…</option>';
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
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(w.date),
    ),
  );

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  chartInstance = new Chart(document.getElementById("progress-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: data.map((w) => w.weight),
          borderColor: "rgba(234, 224, 213, 0.85)",
          backgroundColor: "rgba(234, 224, 213, 0.07)",
          borderWidth: 2,
          pointRadius: 5,
          pointBackgroundColor: "rgba(234, 224, 213, 0.9)",
          tension: 0.35,
          fill: true,
        },
      ],
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
          title: {
            display: true,
            text: "lbs",
            color: "rgba(234,224,213,0.4)",
            font: { size: 11 },
          },
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
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
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
    status === "warn"
      ? "#e07b4a"
      : status === "success"
        ? "#a8d98a"
        : "var(--muted)";
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

// ── Event listeners ───────────────────────────────────────────────────────────

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await handleChat();
});
workoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await handleWorkout();
});
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
  if (!message) {
    userInput.focus();
    return;
  }

  appendMessage(`<strong>You</strong><em>${escapeHtml(message)}</em>`, "user");
  userInput.value = "";
  setButtonState(sendButton, true);
  userInput.disabled = true;

  const trainerBubble = appendMessage(
    `<strong>Trainer</strong><em>Thinking…</em>`,
    "trainer",
  );

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: conversationHistory,
        profile: loadProfile(),
      }),
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}`);

    const data = await response.json();
    const reply =
      data.reply || "Sorry, I couldn't generate a response right now.";

    conversationHistory.push({ role: "user", content: message });
    conversationHistory.push({ role: "assistant", content: reply });

    trainerBubble.innerHTML = `<strong>Trainer</strong><em>${formatReply(reply)}</em>`;
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

  if (!exercise) {
    showWorkoutStatus("Name the movement before logging it.", "warn");
    return;
  }

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
    // silently ignore — list will stay as-is
  }
}

// ── History ───────────────────────────────────────────────────────────────────

async function loadWorkouts() {
  const list = document.getElementById("workout-list");
  const chartSection = document.getElementById("chart-section");

  try {
    const response = await fetch("/api/workouts");
    const workouts = await response.json();

    if (!Array.isArray(workouts) || workouts.length === 0) {
      allWorkouts = [];
      list.innerHTML =
        '<div class="history-entry"><strong>No history yet.</strong><time>Log a workout to see your session archive.</time></div>';
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
      .map(
        (w) => `
        <div class="history-entry">
          <strong>${escapeHtml(w.exercise)}</strong>
          <span>${w.sets} sets · ${w.reps} reps${w.weight ? ` · ${w.weight} lbs` : ""}</span>
          <time>${formatDate(w.date)}</time>
          <button class="delete-btn" data-id="${w.id}" aria-label="Delete entry">×</button>
        </div>
      `,
      )
      .join("");

    list.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteWorkout(btn.dataset.id));
    });
  } catch {
    list.innerHTML =
      '<div class="history-entry"><strong>Unable to load history.</strong><time>Retry with the refresh button.</time></div>';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

initProfile();
loadWorkouts();
