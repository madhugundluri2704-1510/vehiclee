const VehicleStop = require('../models/VehicleStop');
const Vehicle = require('../models/Vehicle');
const Alert = require('../models/Alert');
const { getStopConfig, updateStopConfig, simulateTestStop } = require('../utils/stopDetectionEngine');

// 1. Get all active & pending stops (plus recently reviewed stops for visible audit)
exports.getActiveStops = async (req, res) => {
  try {
    const stops = await VehicleStop.find({
      $or: [
        { status: 'active' },
        { alertTriggered: true, 'review.status': 'pending' },
        { 'review.status': { $in: ['approved', 'rejected'] }, updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    })
      .populate('vehicleId', 'vehicleNumber vehicleType driverName status currentLocation cleaningZone')
      .populate('driverId', 'driverName phoneNumber shiftTime')
      .sort({ startTime: -1 });

    const now = Date.now();
    const config = getStopConfig();

    // Recalculate up-to-date elapsed durations dynamically or preserve frozen duration if timer stopped
    const enrichedStops = stops.map(stop => {
      const doc = stop.toObject();
      const isTimerStopped = Boolean(doc.timerStopped || doc.review?.status === 'approved' || doc.review?.status === 'rejected' || doc.endTime);

      if (isTimerStopped) {
        // Incident timer has stopped - preserve recorded duration exactly!
        doc.isTimerRunning = false;
        doc.durationMinutes = doc.finalDurationMinutes != null ? doc.finalDurationMinutes : (doc.durationMinutes || 0);
      } else {
        // Incident timer is actively running - compute from startTime
        const elapsedMinutes = (now - new Date(stop.startTime).getTime()) / (1000 * 60);
        doc.isTimerRunning = true;
        doc.durationMinutes = Math.round(elapsedMinutes * 10) / 10;
      }

      doc.thresholdMinutes = config.thresholdMinutes;
      doc.isOverThreshold = doc.durationMinutes >= config.thresholdMinutes || doc.alertTriggered;
      return doc;
    });

    res.json(enrichedStops);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Get stop history with filters
exports.getStopHistory = async (req, res) => {
  try {
    const { vehicleId, driverId, status, alertTriggered, reviewStatus, reason, from, to, limit = 50, page = 1 } = req.query;

    const query = {};
    if (vehicleId) query.vehicleId = vehicleId;
    if (driverId) query.driverId = driverId;
    if (status) query.status = status;
    if (alertTriggered !== undefined) query.alertTriggered = alertTriggered === 'true';
    if (reviewStatus) query['review.status'] = reviewStatus;
    if (reason) query['explanation.reason'] = reason;

    if (from || to) {
      query.startTime = {};
      if (from) query.startTime.$gte = new Date(from);
      if (to) query.startTime.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [stops, total] = await Promise.all([
      VehicleStop.find(query)
        .populate('vehicleId', 'vehicleNumber vehicleType driverName')
        .populate('driverId', 'driverName phoneNumber')
        .populate('alertId')
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      VehicleStop.countDocuments(query)
    ]);

    res.json({
      stops,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Get single stop by ID
exports.getStopById = async (req, res) => {
  try {
    const stop = await VehicleStop.findById(req.params.id)
      .populate('vehicleId')
      .populate('driverId')
      .populate('alertId')
      .populate('explanation.submittedBy', 'username email role')
      .populate('review.reviewedBy', 'username email role');

    if (!stop) {
      return res.status(404).json({ message: 'Vehicle stop record not found' });
    }

    res.json(stop);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 4. Get stops for a specific vehicle
exports.getVehicleStops = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { limit = 30 } = req.query;

    const stops = await VehicleStop.find({ vehicleId })
      .populate('alertId')
      .sort({ startTime: -1 })
      .limit(parseInt(limit));

    res.json(stops);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 5. Get pending stops requiring explanation for a driver
exports.getDriverPendingStops = async (req, res) => {
  try {
    const user = req.user;
    let driverId = user.employeeId;

    const query = {
      alertTriggered: true,
      $or: [
        { 'explanation.reason': null },
        { 'explanation.reason': { $exists: false } },
        { 'review.status': 'rejected' }
      ]
    };

    if (driverId) {
      query.$and = [
        { $or: [{ driverId: driverId }, { 'explanation.submittedBy': user._id }] }
      ];
    }

    const stops = await VehicleStop.find(query)
      .populate('vehicleId', 'vehicleNumber vehicleType cleaningZone')
      .sort({ startTime: -1 });

    res.json(stops);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 6. Driver submits explanation for a stop
exports.submitExplanation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, details } = req.body;

    const validReasons = [
      'road accident',
      'traffic jam',
      'vehicle breakdown',
      'emergency',
      'garbage collection',
      'traffic',
      'fuel refill',
      'maintenance',
      'other'
    ];

    if (!reason || !validReasons.includes(reason.toLowerCase())) {
      return res.status(400).json({
        message: `Invalid reason. Must be one of: ${validReasons.join(', ')}`
      });
    }

    const stop = await VehicleStop.findById(id);
    if (!stop) {
      return res.status(404).json({ message: 'Stop record not found' });
    }

    // Update stop explanation
    stop.explanation = {
      reason: reason.toLowerCase(),
      details: details || '',
      submittedAt: new Date(),
      submittedBy: req.user._id,
      driverName: req.user.username || stop.driverName
    };
    stop.review = {
      status: 'pending',
      reviewedBy: null,
      reviewedByName: '',
      reviewedAt: null,
      remarks: ''
    };
    await stop.save();

    // If vehicle has active stop matching this, update vehicle state
    const vehicle = await Vehicle.findById(stop.vehicleId);
    if (vehicle && vehicle.currentStop?.stopId?.toString() === stop._id.toString()) {
      vehicle.currentStop.explanationStatus = 'submitted';
      await vehicle.save();
    }

    // Broadcast explanation submission via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to('dashboard').emit('stop:explanation_submitted', {
        stopId: stop._id,
        vehicleId: stop.vehicleId,
        vehicleNumber: stop.vehicleNumber,
        driverName: stop.explanation.driverName,
        explanation: stop.explanation,
        location: stop.location,
        durationMinutes: stop.durationMinutes,
        timestamp: new Date(),
        stop
      });
    }

    res.json({
      message: 'Explanation submitted successfully and sent for admin review',
      stop
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 7. Admin reviews explanation (Approve or Reject) - Immediately stops the incident timer
exports.reviewExplanation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks = '' } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
    }

    const stop = await VehicleStop.findById(id);
    if (!stop) {
      return res.status(404).json({ message: 'Stop record not found' });
    }

    if (!stop.explanation?.reason) {
      return res.status(400).json({ message: 'No explanation has been submitted for this stop yet' });
    }

    const decisionTime = new Date();

    // Calculate final duration:
    // If vehicle had already resumed movement, stop.endTime was when it moved.
    // Otherwise, the stop incident timer stops right now at decisionTime.
    const effectiveEndTime = stop.endTime || decisionTime;
    const totalDuration = Math.max(0, Math.round(((effectiveEndTime.getTime() - new Date(stop.startTime).getTime()) / (1000 * 60)) * 10) / 10);

    // Stop timer immediately and persist review decision
    stop.review = {
      status, // 'approved' or 'rejected'
      reviewedBy: req.user._id,
      reviewedByName: req.user.username || 'Admin',
      reviewedAt: decisionTime,
      remarks: remarks.trim()
    };
    stop.timerStopped = true;
    stop.timerStoppedAt = decisionTime;
    stop.durationMinutes = totalDuration;
    stop.finalDurationMinutes = totalDuration;
    stop.status = 'completed'; // Incident is now closed/completed
    if (!stop.endTime) {
      stop.endTime = decisionTime;
    }
    await stop.save();

    // If has alert, acknowledge/resolve it
    if (stop.alertId) {
      await Alert.findByIdAndUpdate(stop.alertId, {
        acknowledged: true,
        acknowledgedBy: req.user._id,
        resolvedAt: decisionTime
      });
    }

    // Update vehicle: stop the incident timer on the vehicle and decouple the stopId
    const vehicle = await Vehicle.findById(stop.vehicleId);
    if (vehicle) {
      if (vehicle.currentStop?.stopId?.toString() === stop._id.toString()) {
        vehicle.currentStop.explanationStatus = status;
        vehicle.currentStop.durationMinutes = totalDuration;
        vehicle.currentStop.timerStopped = true;
        vehicle.currentStop.timerStoppedAt = decisionTime;
        // Decouple incident stopId from vehicle.currentStop so subsequent ticks do not increment this incident's timer
        vehicle.currentStop.stopId = null;
        vehicle.currentStop.alertTriggered = false;
        vehicle.currentStop.explanationRequired = false;
        // Reset stoppedAt so if the vehicle stays stationary, a brand-new 15-minute timer starts from now
        vehicle.currentStop.stoppedAt = decisionTime;
      }
      await vehicle.save();
    }

    const io = req.app.get('io');
    if (io) {
      io.to('dashboard').emit('stop:timer_stopped', {
        stopId: stop._id,
        vehicleId: stop.vehicleId,
        vehicleNumber: stop.vehicleNumber,
        status,
        durationMinutes: totalDuration,
        timerStoppedAt: decisionTime,
        review: stop.review,
        explanation: stop.explanation
      });

      io.to('dashboard').emit('stop:explanation_reviewed', {
        stopId: stop._id,
        vehicleId: stop.vehicleId,
        vehicleNumber: stop.vehicleNumber,
        status,
        remarks,
        durationMinutes: totalDuration,
        timerStoppedAt: decisionTime,
        reviewedBy: req.user.username || 'Admin',
        timestamp: decisionTime,
        stop
      });

      if (stop.driverId) {
        io.to(`driver:${stop.driverId}`).emit('driver:explanation_reviewed', {
          stopId: stop._id,
          vehicleNumber: stop.vehicleNumber,
          status,
          remarks,
          durationMinutes: totalDuration,
          decisionTime
        });
      }
    }

    res.json({
      message: `Stop explanation ${status} successfully and timer stopped`,
      stop
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 8. Get current configurable thresholds
exports.getConfig = async (req, res) => {
  try {
    res.json(getStopConfig());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 9. Update configurable thresholds (Admin only)
exports.updateConfig = async (req, res) => {
  try {
    const updated = updateStopConfig(req.body);
    const io = req.app.get('io');
    if (io) {
      io.to('dashboard').emit('stop:config_updated', updated);
    }
    res.json({ message: 'Stop detection configuration updated', config: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 10. Simulate test stop (Admin / testing endpoint)
exports.simulateStop = async (req, res) => {
  try {
    const { vehicleId, durationMinutes = 16 } = req.body;
    let targetVehicleId = vehicleId;

    if (!targetVehicleId) {
      const v = await Vehicle.findOne({ status: 'active' }) || await Vehicle.findOne();
      if (!v) return res.status(404).json({ message: 'No vehicle found to simulate stop' });
      targetVehicleId = v._id;
    }

    const result = await simulateTestStop({
      vehicleId: targetVehicleId,
      durationMinutes: parseFloat(durationMinutes),
      io: req.app.get('io')
    });

    res.json({
      message: `Simulated stop of ${durationMinutes} minutes triggered successfully`,
      result
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
