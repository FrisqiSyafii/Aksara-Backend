const express = require('express')
const verifyToken = require('../middleware/authMiddleware')
const allowRoles = require('../middleware/roleMiddleware')

const {
  getTeacherSubjects,
  getTeacherSubjectById,
  createTeacherSubject,
  updateTeacherSubject,
  deleteTeacherSubject,
} = require('../controllers/teacherSubjectController')

const router = express.Router()

router.get(
  '/',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getTeacherSubjects
)

router.get(
  '/:id',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getTeacherSubjectById
)

router.post(
  '/',
  verifyToken,
  allowRoles('admin'),
  createTeacherSubject
)

router.put(
  '/:id',
  verifyToken,
  allowRoles('admin'),
  updateTeacherSubject
)

router.delete(
  '/:id',
  verifyToken,
  allowRoles('admin'),
  deleteTeacherSubject
)

module.exports = router