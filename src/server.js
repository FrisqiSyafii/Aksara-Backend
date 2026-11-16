const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const studentRoutes = require("./routes/studentRoutes");
const classRoutes = require("./routes/classRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const subjectAttendanceRoutes = require("./routes/subjectAttendanceRoutes");
const teacherSubjectRoutes = require("./routes/teacherSubjectRoutes");
const classScheduleRoutes = require("./routes/classScheduleRoutes");
const subjectRoutes = require("./routes/subjectRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const recapRoutes = require("./routes/recapRoutes");
const reportRoutes = require("./routes/reportRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const faceRoutes = require("./routes/faceRoutes");
const documentRoutes = require("./routes/documentRoutes");
const publicDocumentRoutes = require("./routes/publicDocumentRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "API Sistem Informasi Absensi Siswa aktif",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/subject-attendance", subjectAttendanceRoutes);
app.use("/api/teacher-subjects", teacherSubjectRoutes);
app.use("/api/class-schedules", classScheduleRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/recap", recapRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/face", faceRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/public-documents", publicDocumentRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
