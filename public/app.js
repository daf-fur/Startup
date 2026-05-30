const chatForm = document.getElementById("chat-form");
const workoutForm = document.getElementById("workout-form");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const refreshButton = document.getElementById("refresh-button");
const workoutStatus = document.getElementById("workout-status");
const clearWorkout = document.getElementById("clear-workout");

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleChat();
});

workoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleWorkout();
});

refreshButton.addEventListener("click", loadWorkouts);
clearWorkout.addEventListener("click", () => workoutForm.reset());

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
}

function showWorkoutStatus(message, status = "info") {
  workoutStatus.textContent = message;
  workoutStatus.style.color =
    status === "warn"
      ? "#f4a261"
      : status === "success"
        ? "#d7f1b1"
        : "#c7c7d0";
}

async function handleChat() {
  const message = userInput.value.trim();
  if (!message) {
    userInput.focus();
    return;
  }

  appendMessage(`<strong>You</strong><em>${message}</em>`, "user");
  userInput.value = "";
  setButtonState(sendButton, true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await response.json();
    appendMessage(`<strong>Trainer</strong><em>${data.reply}</em>`, "trainer");
  } catch (error) {
    appendMessage(
      "<strong>Trainer</strong><em>Sorry, the coach is offline. Try again in a moment.</em>",
      "trainer",
    );
  } finally {
    setButtonState(sendButton, false);
  }
}

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
  } catch (error) {
    showWorkoutStatus("Could not save workout. Check your connection.", "warn");
  } finally {
    setButtonState(workoutForm.querySelector(".primary-button"), false);
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function loadWorkouts() {
  try {
    const response = await fetch("/api/workouts");
    const workouts = await response.json();
    const list = document.getElementById("workout-list");

    if (!Array.isArray(workouts) || workouts.length === 0) {
      list.innerHTML =
        '<div class="history-entry"><strong>No history yet.</strong><time>Log a workout to see your session archive.</time></div>';
      return;
    }

    list.innerHTML = workouts
      .slice()
      .reverse()
      .map((workout) => {
        return `
        <div class="history-entry">
          <strong>${workout.exercise}</strong>
          <span>${workout.sets} sets · ${workout.reps} reps${workout.weight ? ` · ${workout.weight}kg` : ""}</span>
          <time>${formatDate(workout.date)}</time>
        </div>`;
      })
      .join("");
  } catch (error) {
    const list = document.getElementById("workout-list");
    list.innerHTML =
      '<div class="history-entry"><strong>Unable to load history.</strong><time>Retry with the refresh button.</time></div>';
  }
}

loadWorkouts();
