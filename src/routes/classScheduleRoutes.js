const express = require('express')

const verifyToken = require(
  '../middleware/authMiddleware'
)

const allowRoles = require(
  '../middleware/roleMiddleware'
)

const {
  getClassSchedules,
  getClassScheduleById,
  createClassSchedule,
  updateClassSchedule,
  deleteClassSchedule,
} = require(
  '../controllers/classScheduleController'
)

const router = express.Router()

router.get(
  '/',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getClassSchedules
)

router.get(
  '/:id',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getClassScheduleById
)

router.post(
  '/',
  verifyToken,
  allowRoles('admin'),
  createClassSchedule
)

router.put(
  '/:id',
  verifyToken,
  allowRoles('admin'),
  updateClassSchedule
)

router.delete(
  '/:id',
  verifyToken,
  allowRoles('admin'),
  deleteClassSchedule
)

module.exports = router