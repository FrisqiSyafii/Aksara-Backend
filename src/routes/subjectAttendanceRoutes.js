// routes/subjectAttendanceRoutes.js

const express = require('express')

const verifyToken = require(
  '../middleware/authMiddleware'
)

const allowRoles = require(
  '../middleware/roleMiddleware'
)

const {
  getSchedules,
  getSubjectAttendance,
  saveSubjectAttendance,
} = require(
  '../controllers/subjectAttendanceController'
)

const router = express.Router()

// Ambil daftar jadwal mengajar

router.get(
  '/schedules',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getSchedules
)

// Ambil siswa dan absensi berdasarkan jadwal

router.get(
  '/schedule/:scheduleId',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getSubjectAttendance
)

// Simpan hasil pemeriksaan guru

router.post(
  '/',
  verifyToken,
  allowRoles('admin', 'guru'),
  saveSubjectAttendance
)

module.exports = router