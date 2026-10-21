const Vehicle = require('../models/Vehicle');
const VehicleStop = require('../models/VehicleStop');
const Alert = require('../models/Alert');
const Tracking = require('../models/Tracking');
const { haversineDistance } = require('./geoUtils');

// Configurable threshold settings (backed by env and runtime state)
const config = {
  thresholdMinutes: parseFloat(process.env.STOP_THRESHOLD_MINUTES || '15'),
  speedThresholdKmh: parseFloat(process.env.STOP_SPEED_THRESHOLD || '3.0'),
  driftThresholdMeters: parseFloat(process.env.STOP_DRIFT_METERS || '40.0'),
  disconnectTimeoutMinutes: parseFloat(process.env.DISCONNECT_TIMEOUT_MINUTES || '5')
};

const getStopConfig = () => ({ ...config });

const updateStopConfig = (newConfig = {}) => {
  if (newConfig.thresholdMinutes !== undefined && !isNaN(Number(newConfig.thresholdMinutes))) {
    config.thresholdMinutes = Math.max(0.5, Number(newConfig.thresholdMinutes));
  }
  if (newConfig.speedThresholdKmh !== undefined && !isNaN(Number(newConfig.speedThresholdKmh))) {
    config.speedThresholdKmh = Math.max(0.5, Number(newConfig.speedThresholdKmh));
  }
  if (newConfig.driftThresholdMeters !== undefined && !isNaN(Number(newConfig.driftThresholdMeters))) {
    config.driftThresholdMeters = Math.max(5, Number(newConfig.driftThresholdMeters));
  }
  if (newConfig.disconnectTimeoutMinutes !== undefined && !isNaN(Number(newConfig.disconnectTimeoutMinutes))) {
    config.disconnectTimeoutMinutes = Math.max(1, Number(newConfig.disconnectTimeoutMinutes));
  }
  return { ...config };
};

/**
 * Process a GPS position update for a vehicle and detect stop/start state.
 * Handles GPS drift fluctuations, server-side duration calculation,
 * 10-minute stop threshold alerts, and real-time socket events.
 */
const processVehiclePosition = async ({ vehicle, lat, lng, speed, timestamp = new Date(), io }) => {
  try {
    const currentSpeed = Number(speed) || 0;
    const now = new Date(timestamp);
    const vId = vehicle._id;

    // Check if vehicle has an active stop registered in vehicle.currentStop
    const hasActiveStop = Boolean(vehicle.currentStop && vehicle.currentStop.stopId);

    if (hasActiveStop) {
      const stopOriginLat = vehicle.currentStop.lat || vehicle.currentLocation.lat;
      const stopOriginLng = vehicle.currentStop.lng || vehicle.currentLocation.lng;
      const driftMeters = haversineDistance(stopOriginLat, stopOriginLng, lat, lng) * 1000;

      // Stationary condition: speed below threshold OR within GPS drift radius
      const isStillStationary = currentSpeed <= config.speedThresholdKmh || driftMeters <= config.driftThresholdMeters;

      if (isStillStationary) {
        // Vehicle is still stationary at approximately the same GPS location
        // Check if the registered stop record has already had its timer stopped (e.g. reviewed by admin)
        let stopRecord = await VehicleStop.findById(vehicle.currentStop.stopId);

        if (stopRecord && (stopRecord.timerStopped || stopRecord.review?.status === 'approved' || stopRecord.review?.status === 'rejected')) {
          // Incident timer is already stopped/decided! Do not re-increment or reopen this incident timer.
          vehicle.currentStop.stopId = null;
          vehicle.currentStop.durationMinutes = 0;
          vehicle.currentStop.alertTriggered = false;
          vehicle.currentStop.explanationRequired = false;
          vehicle.currentStop.explanationStatus = 'not_required';
          vehicle.currentStop.stoppedAt = stopRecord.timerStoppedAt || now;
          await vehicle.save();
          return { isStopped: true, stop: stopRecord, vehicle };
        }

        const stoppedAt = new Date(vehicle.currentStop.stoppedAt || now);
        const elapsedMinutes = (now.getTime() - stoppedAt.getTime()) / (1000 * 60);
        const roundedDuration = Math.round(elapsedMinutes * 10) / 10;

        if (!stopRecord) {
          // Re-create if somehow missing
          stopRecord = await VehicleStop.create({
            vehicleId: vehicle._id,
            vehicleNumber: vehicle.vehicleNumber,
            driverId: vehicle.assignedDriver,
            driverName: vehicle.driverName,
            driverPhone: vehicle.driverPhone,
            location: { lat: stopOriginLat, lng: stopOriginLng },
            cleaningZone: vehicle.cleaningZone,
            wardNumber: vehicle.wardNumber,
            startTime: stoppedAt,
            durationMinutes: roundedDuration,
            status: 'active'
          });
          vehicle.currentStop.stopId = stopRecord._id;
        } else {
          stopRecord.durationMinutes = roundedDuration;
          await stopRecord.save();
        }

        vehicle.currentStop.durationMinutes = roundedDuration;
        vehicle.lastGpsUpdate = now;

        // Check if stop exceeds threshold (default 10 minutes) and alert has not been triggered yet
        if (elapsedMinutes >= config.thresholdMinutes && !vehicle.currentStop.alertTriggered) {
          console.log(`🚨 [Prolonged Stop Alert] ${vehicle.vehicleNumber} stopped for ${roundedDuration} mins (threshold: ${config.thresholdMinutes} mins)`);

          // Create Alert document
          const alert = await Alert.create({
            vehicleId: vehicle._id,
            stopId: stopRecord._id,
            type: 'prolonged-stop',
            severity: 'high',
            message: `Vehicle ${vehicle.vehicleNumber} (Driver: ${vehicle.driverName}) has been stopped at ${vehicle.cleaningZone} for ${Math.round(elapsedMinutes)} minutes. Explanation required from driver.`,
            location: { lat: stopOriginLat, lng: stopOriginLng },
            cleaningZone: vehicle.cleaningZone,
            acknowledged: false
          });

          // Mark stop and vehicle as alerted
          stopRecord.alertTriggered = true;
          stopRecord.alertId = alert._id;
          await stopRecord.save();

          vehicle.currentStop.alertTriggered = true;
          vehicle.currentStop.explanationRequired = true;
          if (vehicle.currentStop.explanationStatus === 'not_required') {
            vehicle.currentStop.explanationStatus = 'pending_submission';
          }

          // Emit real-time alerts
          if (io) {
            io.to('dashboard').emit('alert:new', alert);
            io.to('dashboard').emit('vehicle:stop_alert', {
              stopId: stopRecord._id,
              alertId: alert._id,
              vehicleId: vehicle._id,
              vehicleNumber: vehicle.vehicleNumber,
              driverName: vehicle.driverName,
              driverPhone: vehicle.driverPhone,
              stopDuration: roundedDuration,
              location: { lat: stopOriginLat, lng: stopOriginLng },
              cleaningZone: vehicle.cleaningZone,
              thresholdMinutes: config.thresholdMinutes,
              stoppedAt
            });

            // Target assigned driver's socket room
            if (vehicle.assignedDriver) {
              io.to(`driver:${vehicle.assignedDriver}`).emit('driver:stop_explanation_required', {
                stopId: stopRecord._id,
                vehicleNumber: vehicle.vehicleNumber,
                stopDuration: roundedDuration,
                location: { lat: stopOriginLat, lng: stopOriginLng },
                cleaningZone: vehicle.cleaningZone,
                stoppedAt
              });
            }
          }
        }

        // Emit live stop timer update periodically or on each tick
        if (io) {
          io.to('dashboard').emit('vehicle:stop_update', {
            vehicleId: vehicle._id,
            stopId: stopRecord._id,
            durationMinutes: roundedDuration,
            alertTriggered: vehicle.currentStop.alertTriggered,
            explanationStatus: vehicle.currentStop.explanationStatus,
            stoppedAt
          });
        }

        return { isStopped: true, stop: stopRecord, vehicle };
      } else {
        // Vehicle was stopped but has now moved beyond the drift threshold and has speed > threshold!
        console.log(`🚗 [Vehicle Resumed Movement] ${vehicle.vehicleNumber} moving at ${currentSpeed} km/h (moved ${Math.round(driftMeters)}m)`);
        const stoppedAt = new Date(vehicle.currentStop.stoppedAt || now);
        const totalDuration = Math.round(((now.getTime() - stoppedAt.getTime()) / (1000 * 60)) * 10) / 10;

        // Finalize stop record in MongoDB
        let completedStop = null;
        if (vehicle.currentStop.stopId) {
          completedStop = await VehicleStop.findById(vehicle.currentStop.stopId);
          if (completedStop) {
            completedStop.endTime = now;
            if (!completedStop.timerStopped) {
              completedStop.durationMinutes = totalDuration;
              completedStop.finalDurationMinutes = totalDuration;
              completedStop.timerStopped = true;
              completedStop.timerStoppedAt = now;
            }
            completedStop.status = 'completed';
            // CRITICAL: Preserve pending explanation & review status for admin dashboard
            await completedStop.save();
          }
        }

        // Record stop event in tracking history
        await Tracking.create({
          vehicleId: vehicle._id,
          latitude: lat,
          longitude: lng,
          speed: currentSpeed,
          heading: vehicle.heading || 0,
          fuelLevel: vehicle.fuelLevel || 100,
          wasteWeight: vehicle.currentLoadWeight || 0,
          cleaningZone: vehicle.cleaningZone,
          eventType: 'stop',
          timestamp: now
        });

        const prevStopId = vehicle.currentStop.stopId;
        vehicle.currentStop = {
          stopId: null,
          stoppedAt: null,
          lat: null,
          lng: null,
          durationMinutes: 0,
          alertTriggered: false,
          explanationRequired: false,
          explanationStatus: 'not_required',
          timerStopped: false,
          timerStoppedAt: null
        };
        vehicle.status = 'active';
        vehicle.lastGpsUpdate = now;

        // Real-time notification of stop completion & timer stopped
        if (io) {
          io.to('dashboard').emit('vehicle:stop_ended', {
            vehicleId: vehicle._id,
            vehicleNumber: vehicle.vehicleNumber,
            stopId: prevStopId,
            durationMinutes: completedStop?.durationMinutes || totalDuration,
            endTime: now,
            completedStop
          });
          io.to('dashboard').emit('stop:timer_stopped', {
            stopId: prevStopId,
            vehicleId: vehicle._id,
            vehicleNumber: vehicle.vehicleNumber,
            durationMinutes: completedStop?.durationMinutes || totalDuration,
            timerStoppedAt: now,
            reason: 'vehicle_resumed_movement'
          });
        }

        return { isStopped: false, completedStop, vehicle };
      }
    } else {
      // Vehicle currently does NOT have an active stop
      // If speed is at or below speed threshold (<= 3 km/h), vehicle has just stopped!
      if (currentSpeed <= config.speedThresholdKmh) {
        console.log(`🛑 [New Vehicle Stop Detected] ${vehicle.vehicleNumber} stopped at lat: ${lat}, lng: ${lng}`);

        const newStop = await VehicleStop.create({
          vehicleId: vehicle._id,
          vehicleNumber: vehicle.vehicleNumber,
          driverId: vehicle.assignedDriver,
          driverName: vehicle.driverName,
          driverPhone: vehicle.driverPhone,
          location: { lat, lng },
          cleaningZone: vehicle.cleaningZone,
          wardNumber: vehicle.wardNumber,
          startTime: now,
          durationMinutes: 0,
          status: 'active',
          alertTriggered: false
        });

        vehicle.currentStop = {
          stopId: newStop._id,
          stoppedAt: now,
          lat,
          lng,
          durationMinutes: 0,
          alertTriggered: false,
          explanationRequired: false,
          explanationStatus: 'not_required'
        };
        vehicle.status = 'idle';
        vehicle.lastGpsUpdate = now;

        if (io) {
          io.to('dashboard').emit('vehicle:stop_started', {
            vehicleId: vehicle._id,
            vehicleNumber: vehicle.vehicleNumber,
            driverName: vehicle.driverName,
            stopId: newStop._id,
            startTime: now,
            location: { lat, lng },
            cleaningZone: vehicle.cleaningZone
          });
        }

        return { isStopped: true, stop: newStop, vehicle };
      } else {
        // Vehicle is moving normally
        vehicle.lastGpsUpdate = now;
        return { isStopped: false, vehicle };
      }
    }
  } catch (error) {
    console.error('Error in processVehiclePosition:', error);
    return { error: error.message };
  }
};

/**
 * Periodically check for disconnected/offline vehicles.
 * Avoids phantom continuous stops if a vehicle stops sending GPS data.
 */
const checkDisconnectedVehicles = async (io) => {
  try {
    const timeoutThreshold = new Date(Date.now() - config.disconnectTimeoutMinutes * 60 * 1000);
    const disconnectedVehicles = await Vehicle.find({
      status: { $ne: 'offline' },
      lastGpsUpdate: { $lt: timeoutThreshold }
    });

    for (const vehicle of disconnectedVehicles) {
      console.log(`⚠️ Vehicle ${vehicle.vehicleNumber} disconnected (no GPS for > ${config.disconnectTimeoutMinutes}m)`);
      vehicle.status = 'offline';

      // If it had an active stop, finalize it up to the last known GPS update
      if (vehicle.currentStop?.stopId) {
        const lastSeen = vehicle.lastGpsUpdate || new Date();
        const stoppedAt = new Date(vehicle.currentStop.stoppedAt || lastSeen);
        const duration = Math.round(((lastSeen.getTime() - stoppedAt.getTime()) / (1000 * 60)) * 10) / 10;

        await VehicleStop.findByIdAndUpdate(vehicle.currentStop.stopId, {
          endTime: lastSeen,
          durationMinutes: duration,
          status: 'completed'
        });

        vehicle.currentStop.stopId = null;
      }

      await vehicle.save();

      if (io) {
        io.to('dashboard').emit('vehicle:update', {
          _id: vehicle._id,
          vehicleNumber: vehicle.vehicleNumber,
          status: 'offline',
          currentLocation: vehicle.currentLocation
        });
      }
    }
  } catch (err) {
    console.error('Error in checkDisconnectedVehicles:', err.message);
  }
};

/**
 * Helper to simulate/test a vehicle stop with custom duration.
 * Allows testing the 15-minute threshold without waiting real-time.
 */
const simulateTestStop = async ({ vehicleId, durationMinutes = 16, io }) => {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw new Error('Vehicle not found');

  const dur = parseFloat(durationMinutes);
  const now = new Date();
  const simulatedStartTime = new Date(now.getTime() - dur * 60 * 1000);
  const lat = vehicle.currentLocation?.lat || 15.8281;
  const lng = vehicle.currentLocation?.lng || 78.0373;

  // Create or update stop
  let stop;
  if (vehicle.currentStop?.stopId) {
    stop = await VehicleStop.findById(vehicle.currentStop.stopId);
  }

  const alertTriggered = dur >= config.thresholdMinutes;

  if (stop) {
    stop.startTime = simulatedStartTime;
    stop.durationMinutes = dur;
    stop.finalDurationMinutes = null;
    stop.timerStopped = false;
    stop.timerStoppedAt = null;
    stop.alertTriggered = alertTriggered;
    stop.status = 'active';
    stop.review = { status: 'pending', reviewedBy: null, reviewedByName: '', reviewedAt: null, remarks: '' };
    stop.explanation = { reason: null, details: '', submittedAt: null, submittedBy: null, driverName: '' };
    await stop.save();
  } else {
    stop = await VehicleStop.create({
      vehicleId: vehicle._id,
      vehicleNumber: vehicle.vehicleNumber,
      driverId: vehicle.assignedDriver,
      driverName: vehicle.driverName,
      driverPhone: vehicle.driverPhone,
      location: { lat, lng },
      cleaningZone: vehicle.cleaningZone,
      wardNumber: vehicle.wardNumber,
      startTime: simulatedStartTime,
      durationMinutes: dur,
      finalDurationMinutes: null,
      timerStopped: false,
      timerStoppedAt: null,
      status: 'active',
      alertTriggered,
      review: { status: 'pending' }
    });
  }

  let alertDoc = null;
  if (alertTriggered) {
    alertDoc = await Alert.create({
      vehicleId: vehicle._id,
      stopId: stop._id,
      type: 'prolonged-stop',
      severity: 'high',
      message: `Vehicle ${vehicle.vehicleNumber} (Driver: ${vehicle.driverName}) has been stopped at ${vehicle.cleaningZone} for ${Math.round(dur)} minutes. Explanation required from driver.`,
      location: { lat, lng },
      cleaningZone: vehicle.cleaningZone,
      acknowledged: false
    });
    stop.alertId = alertDoc._id;
    await stop.save();
  }

  vehicle.status = 'idle';
  vehicle.speed = 0;
  vehicle.currentStop = {
    stopId: stop._id,
    stoppedAt: simulatedStartTime,
    lat,
    lng,
    durationMinutes: dur,
    alertTriggered,
    explanationRequired: alertTriggered,
    explanationStatus: alertTriggered ? 'pending_submission' : 'not_required'
  };
  vehicle.lastGpsUpdate = now;
  await vehicle.save();

  if (io) {
    if (alertDoc) {
      io.to('dashboard').emit('alert:new', alertDoc);
      io.to('dashboard').emit('vehicle:stop_alert', {
        stopId: stop._id,
        alertId: alertDoc._id,
        vehicleId: vehicle._id,
        vehicleNumber: vehicle.vehicleNumber,
        driverName: vehicle.driverName,
        stopDuration: dur,
        location: { lat, lng },
        cleaningZone: vehicle.cleaningZone,
        thresholdMinutes: config.thresholdMinutes,
        stoppedAt: simulatedStartTime
      });
      if (vehicle.assignedDriver) {
        io.to(`driver:${vehicle.assignedDriver}`).emit('driver:stop_explanation_required', {
          stopId: stop._id,
          vehicleNumber: vehicle.vehicleNumber,
          stopDuration: dur,
          location: { lat, lng },
          cleaningZone: vehicle.cleaningZone,
          stoppedAt: simulatedStartTime
        });
      }
    }
    io.to('dashboard').emit('vehicle:stop_update', {
      vehicleId: vehicle._id,
      stopId: stop._id,
      durationMinutes: dur,
      alertTriggered,
      explanationStatus: vehicle.currentStop.explanationStatus,
      stoppedAt: simulatedStartTime
    });
    io.to('dashboard').emit('vehicle:update', {
      _id: vehicle._id,
      vehicleNumber: vehicle.vehicleNumber,
      currentLocation: { lat, lng },
      speed: 0,
      fuelLevel: vehicle.fuelLevel,
      heading: vehicle.heading,
      status: 'idle',
      currentLoadWeight: vehicle.currentLoadWeight,
      cleaningZone: vehicle.cleaningZone,
      currentStop: vehicle.currentStop
    });
  }

  return { stop, alert: alertDoc, vehicle };
};

module.exports = {
  getStopConfig,
  updateStopConfig,
  processVehiclePosition,
  checkDisconnectedVehicles,
  simulateTestStop
};
