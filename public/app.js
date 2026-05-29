async function sendMessage() {
  const input = document.getElementById('user-input');
  const chatBox = document.getElementById('chat-box');
  const message = input.value.trim();
  if (!message) return;

  chatBox.innerHTML += `<div class="message user">You: ${message}</div>`;
  input.value = '';

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });

  const data = await res.json();
  chatBox.innerHTML += `<div class="message trainer">Trainer: ${data.reply}</div>`;
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function logWorkout() {
  const exercise = document.getElementById('exercise').value;
  const sets = document.getElementById('sets').value;
  const reps = document.getElementById('reps').value;
  const weight = document.getElementById('weight').value;

  if (!exercise) return alert('Enter an exercise name!');

  await fetch('/api/workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise, sets, reps, weight })
  });

  alert('Workout logged!');
  loadWorkouts();
}

async function loadWorkouts() {
  const res = await fetch('/api/workouts');
  const workouts = await res.json();
  const list = document.getElementById('workout-list');

  list.innerHTML = workouts.map(w => `
    <div class="workout-entry">
      <strong>${w.exercise}</strong> — ${w.sets} sets x ${w.reps} reps 
      ${w.weight ? `@ ${w.weight}kg` : ''} 
      <small>${w.date}</small>
    </div>
  `).join('');
}

// Load workouts on page load
loadWorkouts();

// Send message on Enter key
document.getElementById('user-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});