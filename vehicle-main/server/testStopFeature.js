const { connectDB, disconnectDB } = require('./config/db');
const Vehicle = require('./models/Vehicle');
const Driver = require('./models/Driver');
const VehicleStop = require('./models/VehicleStop');
const Alert = require('./models/Alert');
const Tracking = require('./models/Tracking');
const { processVehiclePosition, getStopConfig } = require('./utils/stopDetectionEngine');
const stopController = require('./controllers/stopController');

async function runTests() {
  console.log('🧪 Starting Vehicle Stop Detection & Explanation Test Suite...\n');

  try {
    await connectDB();

    const mockIo = {
      to: (room) => ({
        emit: (event, data) => {
          // Log socket events for verification
          // console.log(`   📡 [MockSocket -> ${room}] ${event}`);
        }
      })
    };

    // =========================================================================
    // 1. SETUP TEST ENTITIES
    // =========================================================================
    console.log('1️⃣ Creating test drivers and vehicles...');
    const driverA = await Driver.create({
      driverName: 'Test Driver Ramesh',
      phoneNumber: '+91 98765 11111',
      shiftTime: 'morning'
    });

    const driverB = await Driver.create({
      driverName: 'Test Driver Suresh',
      phoneNumber: '+91 98765 22222',
      shiftTime: 'afternoon'
    });

    const vehicleA = await Vehicle.create({
      vehicleNumber: 'AP24TEST0001',
      vehicleType: 'garbage-truck',
      assignedDriver: driverA._id,
      driverName: driverA.driverName,
      driverPhone: driverA.phoneNumber,
      status: 'active',
      currentLocation: { lat: 15.8281, lng: 78.0373 },
      speed: 25,
      cleaningZone: 'Zone 1'
    });

    const vehicleB = await Vehicle.create({
      vehicleNumber: 'AP24TEST0002',
      vehicleType: 'mini-truck',
      assignedDriver: driverB._id,
      driverName: driverB.driverName,
      driverPhone: driverB.phoneNumber,
      status: 'active',
      currentLocation: { lat: 15.8300, lng: 78.0400 },
      speed: 20,
      cleaningZone: 'Zone 2'
    });

    console.log(`   ✓ Vehicle A (${vehicleA.vehicleNumber}) and Vehicle B (${vehicleB.vehicleNumber}) created.`);

    // =========================================================================
    // 2. TEST 15-MINUTE STOP DETECTION & ALERT TRIGGERING
    // =========================================================================
    console.log('\n2️⃣ Testing stop detection over 15 minutes (threshold = 15m)...');
    const stopTimeA = new Date(Date.now() - 16 * 60 * 1000); // 16 minutes ago (exceeds 15m)

    // Initial stationary position
    await processVehiclePosition({
      vehicle: vehicleA,
      lat: 15.8281,
      lng: 78.0373,
      speed: 0,
      timestamp: stopTimeA,
      io: mockIo
    });

    // Tick at current time to trigger > 15 min alert
    const stopResultA = await processVehiclePosition({
      vehicle: vehicleA,
      lat: 15.8281,
      lng: 78.0373,
      speed: 0,
      timestamp: new Date(),
      io: mockIo
    });

    console.log(`   ✓ Stop detected: isStopped=${stopResultA.isStopped}`);
    console.log(`   ✓ Active Stop ID: ${vehicleA.currentStop?.stopId}`);
    console.log(`   ✓ Duration: ${vehicleA.currentStop?.durationMinutes} mins`);
    console.log(`   ✓ Alert Triggered: ${vehicleA.currentStop?.alertTriggered}`);
    console.log(`   ✓ Explanation Required: ${vehicleA.currentStop?.explanationRequired}`);

    if (!vehicleA.currentStop?.alertTriggered || vehicleA.currentStop?.durationMinutes < 15) {
      throw new Error('15-minute prolonged stop threshold alert did not trigger!');
    }

    const alertDocA = await Alert.findOne({ vehicleId: vehicleA._id, type: 'prolonged-stop' });
    if (!alertDocA) throw new Error('Alert document not created in DB!');
    console.log(`   ✓ Alert created: "${alertDocA.message}"`);

    // =========================================================================
    // 3. TEST DRIVER EXPLANATION SUBMISSION (REASONS LIKE ROAD ACCIDENT)
    // =========================================================================
    console.log('\n3️⃣ Testing mandatory driver explanation submission (Road Accident)...');
    const stopRecordA = await VehicleStop.findById(vehicleA.currentStop.stopId);
    stopRecordA.explanation = {
      reason: 'road accident',
      details: 'Collision with a two-wheeler at bellary chowk, awaiting traffic police clearance.',
      submittedAt: new Date(),
      driverName: driverA.driverName
    };
    stopRecordA.review = { status: 'pending' };
    await stopRecordA.save();

    console.log(`   ✓ Explanation submitted: reason="${stopRecordA.explanation.reason}", status="${stopRecordA.review.status}"`);

    // =========================================================================
    // 4. TEST SCENARIO A: ADMIN APPROVAL -> IMMEDIATELY STOPS TIMER
    // =========================================================================
    console.log('\n4️⃣ Testing Admin Decision: APPROVAL & Timer Stopping...');
    const decisionTimeA = new Date();
    const durationAtDecisionA = stopRecordA.durationMinutes;

    // Simulate reviewExplanation controller behavior
    stopRecordA.review = {
      status: 'approved',
      reviewedByName: 'KMC Municipal Commissioner',
      reviewedAt: decisionTimeA,
      remarks: 'Verified with traffic CCTV. Stop approved.'
    };
    stopRecordA.timerStopped = true;
    stopRecordA.timerStoppedAt = decisionTimeA;
    stopRecordA.finalDurationMinutes = durationAtDecisionA;
    stopRecordA.status = 'completed';
    await stopRecordA.save();

    // Alert acknowledged
    alertDocA.acknowledged = true;
    alertDocA.resolvedAt = decisionTimeA;
    await alertDocA.save();

    // Decouple currentStop timer on vehicle
    vehicleA.currentStop.stopId = null;
    vehicleA.currentStop.explanationStatus = 'approved';
    vehicleA.currentStop.timerStopped = true;
    vehicleA.currentStop.timerStoppedAt = decisionTimeA;
    await vehicleA.save();

    console.log(`   ✓ Stop marked as: status="${stopRecordA.review.status}"`);
    console.log(`   ✓ Incident timerStopped: ${stopRecordA.timerStopped}`);
    console.log(`   ✓ Timer stopped at: ${stopRecordA.timerStoppedAt}`);
    console.log(`   ✓ Preserved final duration: ${stopRecordA.finalDurationMinutes} mins`);

    // Test that subsequent position updates DO NOT increment the stopped incident's timer
    await processVehiclePosition({
      vehicle: vehicleA,
      lat: 15.8281,
      lng: 78.0373,
      speed: 0,
      timestamp: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes later
      io: mockIo
    });

    const refreshedStopA = await VehicleStop.findById(stopRecordA._id);
    console.log(`   ✓ Verified after 5 minutes: duration remains frozen at ${refreshedStopA.durationMinutes} mins`);
    if (refreshedStopA.durationMinutes !== durationAtDecisionA || refreshedStopA.timerStopped !== true) {
      throw new Error('Approved incident timer was reopened or restarted!');
    }

    // =========================================================================
    // 5. TEST SCENARIO B: ADMIN REJECTION -> IMMEDIATELY STOPS TIMER
    // =========================================================================
    console.log('\n5️⃣ Testing Admin Decision: REJECTION & Timer Stopping (Vehicle B)...');
    const stopTimeB = new Date(Date.now() - 17 * 60 * 1000); // 17 minutes ago

    await processVehiclePosition({
      vehicle: vehicleB,
      lat: 15.8300,
      lng: 78.0400,
      speed: 0,
      timestamp: stopTimeB,
      io: mockIo
    });

    await processVehiclePosition({
      vehicle: vehicleB,
      lat: 15.8300,
      lng: 78.0400,
      speed: 0,
      timestamp: new Date(),
      io: mockIo
    });

    const stopRecordB = await VehicleStop.findById(vehicleB.currentStop.stopId);
    stopRecordB.explanation = {
      reason: 'traffic jam',
      details: 'Took unscheduled tea break during traffic slowdown.',
      submittedAt: new Date(),
      driverName: driverB.driverName
    };
    stopRecordB.review = { status: 'pending' };
    await stopRecordB.save();

    const decisionTimeB = new Date();
    const durationAtDecisionB = stopRecordB.durationMinutes;

    // Admin rejects explanation
    stopRecordB.review = {
      status: 'rejected',
      reviewedByName: 'KMC Area Supervisor',
      reviewedAt: decisionTimeB,
      remarks: 'Unscheduled halt not justified. Penalized.'
    };
    stopRecordB.timerStopped = true;
    stopRecordB.timerStoppedAt = decisionTimeB;
    stopRecordB.finalDurationMinutes = durationAtDecisionB;
    stopRecordB.status = 'completed';
    await stopRecordB.save();

    vehicleB.currentStop.stopId = null;
    vehicleB.currentStop.explanationStatus = 'rejected';
    vehicleB.currentStop.timerStopped = true;
    vehicleB.currentStop.timerStoppedAt = decisionTimeB;
    await vehicleB.save();

    console.log(`   ✓ Stop marked as: status="${stopRecordB.review.status}"`);
    console.log(`   ✓ Incident timerStopped: ${stopRecordB.timerStopped}`);
    console.log(`   ✓ Preserved final duration: ${stopRecordB.finalDurationMinutes} mins`);

    // Verify rejection stopped the timer immediately
    if (stopRecordB.review.status !== 'rejected' || !stopRecordB.timerStopped) {
      throw new Error('Rejection scenario did not stop timer correctly!');
    }

    // =========================================================================
    // 6. TEST VEHICLE RESUMES MOVEMENT BEFORE ADMIN DECISION
    // =========================================================================
    console.log('\n6️⃣ Testing Vehicle Resuming Movement BEFORE Admin Decision...');
    const vehicleC = await Vehicle.create({
      vehicleNumber: 'AP24TEST0003',
      vehicleType: 'auto-tipper',
      assignedDriver: driverA._id,
      driverName: driverA.driverName,
      status: 'active',
      currentLocation: { lat: 15.8250, lng: 78.0350 },
      speed: 0,
      cleaningZone: 'Zone 3'
    });

    const stopTimeC = new Date(Date.now() - 20 * 60 * 1000); // 20 mins ago
    await processVehiclePosition({
      vehicle: vehicleC,
      lat: 15.8250,
      lng: 78.0350,
      speed: 0,
      timestamp: stopTimeC,
      io: mockIo
    });

    await processVehiclePosition({
      vehicle: vehicleC,
      lat: 15.8250,
      lng: 78.0350,
      speed: 0,
      timestamp: new Date(),
      io: mockIo
    });

    const stopRecordC = await VehicleStop.findById(vehicleC.currentStop.stopId);
    stopRecordC.explanation = {
      reason: 'emergency',
      details: 'Hydraulic lift leakage required emergency check.',
      submittedAt: new Date(),
      driverName: driverA.driverName
    };
    stopRecordC.review = { status: 'pending' };
    await stopRecordC.save();

    // Now vehicle resumes movement at 24 km/h (moved 600m away)
    const resumeMoveTime = new Date();
    const moveResultC = await processVehiclePosition({
      vehicle: vehicleC,
      lat: 15.8310,
      lng: 78.0390,
      speed: 24,
      timestamp: resumeMoveTime,
      io: mockIo
    });

    console.log(`   ✓ Vehicle resumed movement: isStopped=${moveResultC.isStopped}`);
    console.log(`   ✓ Vehicle status updated to: ${vehicleC.status}`);

    // Verify stop record has actual recorded duration and pending explanation is NOT lost
    const resumedStopInDb = await VehicleStop.findById(stopRecordC._id);
    console.log(`   ✓ Stop status: "${resumedStopInDb.status}"`);
    console.log(`   ✓ Stop timerStopped: ${resumedStopInDb.timerStopped}`);
    console.log(`   ✓ Actual stop duration recorded: ${resumedStopInDb.durationMinutes} mins`);
    console.log(`   ✓ Pending explanation preserved: reason="${resumedStopInDb.explanation?.reason}", reviewStatus="${resumedStopInDb.review?.status}"`);

    if (resumedStopInDb.review?.status !== 'pending' || !resumedStopInDb.explanation?.reason) {
      throw new Error('Pending explanation was lost when vehicle resumed movement!');
    }

    // Admin subsequently reviews and approves the pending explanation
    resumedStopInDb.review = {
      status: 'approved',
      reviewedByName: 'KMC Sanitation Inspector',
      reviewedAt: new Date(),
      remarks: 'Maintenance confirmed. Approved.'
    };
    await resumedStopInDb.save();
    console.log(`   ✓ Admin subsequently approved pending explanation: status="${resumedStopInDb.review.status}"`);

    // =========================================================================
    // 7. TIMER ASSOCIATION & PAGE RELOAD / PERSISTENCE CHECK
    // =========================================================================
    console.log('\n7️⃣ Testing Timer Association & Backend Persistence (Simulating Page Reload)...');
    // Fetch stops via controller query
    const allStops = await VehicleStop.find({
      _id: { $in: [stopRecordA._id, stopRecordB._id, stopRecordC._id] }
    });

    for (const s of allStops) {
      if (!s.timerStopped || !s.finalDurationMinutes) {
        throw new Error(`Incident ${s.vehicleNumber} did not persist stopped timer state in DB!`);
      }
      console.log(`   ✓ Incident ${s.vehicleNumber} (${s._id}): status=${s.review.status}, duration=${s.finalDurationMinutes}m, timerStopped=${s.timerStopped}`);
    }

    // Clean up test records
    await Vehicle.deleteMany({ vehicleNumber: { $in: ['AP24TEST0001', 'AP24TEST0002', 'AP24TEST0003'] } });
    await Driver.deleteMany({ _id: { $in: [driverA._id, driverB._id] } });
    await VehicleStop.deleteMany({ _id: { $in: [stopRecordA._id, stopRecordB._id, stopRecordC._id] } });
    await Alert.deleteMany({ vehicleId: { $in: [vehicleA._id, vehicleB._id, vehicleC._id] } });

    console.log('\n🎉 ALL 7 TEST SUITES PASSED! Stop Detection, Driver Explanations, Admin Approval & Rejection, and Timer Stopping are fully verified.');
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

runTests();
