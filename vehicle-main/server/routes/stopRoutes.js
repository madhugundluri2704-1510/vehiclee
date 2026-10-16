const express = require('express');
const router = express.Router();
const {
  getActiveStops,
  getStopHistory,
  getStopById,
  getVehicleStops,
  getDriverPendingStops,
  submitExplanation,
  reviewExplanation,
  getConfig,
  updateConfig,
  simulateStop
} = require('../controllers/stopController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

// Configuration
router.get('/config', protect, getConfig);
router.put('/config', protect, roleCheck('admin'), updateConfig);

// Active stops and driver pending
router.get('/active', protect, getActiveStops);
router.get('/driver/pending', protect, getDriverPendingStops);
router.get('/history', protect, getStopHistory);
router.get('/vehicle/:vehicleId', protect, getVehicleStops);
router.get('/:id', protect, getStopById);

// Driver explanation submission
router.post('/:id/explanation', protect, submitExplanation);

// Admin review (Approve / Reject)
router.put('/:id/review', protect, roleCheck('admin', 'supervisor'), reviewExplanation);

// Testing / Simulation helper
router.post('/simulate', protect, roleCheck('admin', 'supervisor'), simulateStop);

module.exports = router;
