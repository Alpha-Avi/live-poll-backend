const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.get("/", (req, res) => {
  res.send("Live Poll Backend Running 🚀");
});


const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ---- In-memory state ----
let currentPoll = null;
let students = {};
let pollHistory = [];
let timerInterval = null;

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // STUDENT JOIN
  socket.on("join_student", (name) => {
    students[socket.id] = { name, answered: false };
    io.emit("participants_update", students);

    // Send active poll to late student
    if (currentPoll) {
      socket.emit("poll_started", currentPoll);
    }
  });

  // TEACHER JOIN
  socket.on("join_teacher", () => {
    socket.join("teacher");
  });

  // CREATE POLL
  socket.on("create_poll", (poll) => {
    if (currentPoll) return;

    currentPoll = {
      question: poll.question,
      options: poll.options,
      answers: {},
      duration: poll.duration
    };

    Object.keys(students).forEach(id => {
      students[id].answered = false;
    });

    io.emit("poll_started", currentPoll);

    let timeLeft = poll.duration;

    timerInterval = setInterval(() => {
      timeLeft--;
      io.emit("timer_tick", timeLeft);

      if (timeLeft <= 0) endPoll();
    }, 1000);
  });

  // SUBMIT ANSWER
  socket.on("submit_answer", (option) => {
    if (!currentPoll) return;
    if (!students[socket.id]) return;
    if (students[socket.id].answered) return;

    currentPoll.answers[option] =
      (currentPoll.answers[option] || 0) + 1;

    students[socket.id].answered = true;
    io.emit("poll_results", currentPoll.answers);

    const allAnswered = Object.values(students).every(s => s.answered);
    if (allAnswered) endPoll();
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    delete students[socket.id];
    io.emit("participants_update", students);
  });

  function endPoll() {
    if (!currentPoll) return;

    clearInterval(timerInterval);
    pollHistory.push(currentPoll);
    io.emit("poll_ended", currentPoll.answers);
    currentPoll = null;
  }
  // SEND POLL HISTORY TO TEACHER
socket.on("get_poll_history", () => {
  socket.emit("poll_history", pollHistory);
});

});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});

