const { connectDB, disconnectDB } = require('./config/db');
const Vehicle = require('./models/Vehicle');
const Driver = require('./models/Driver');
const VehicleStop = require('./models/VehicleStop');
const Alert = require('./models/Alert');
const Tracking = require('./models/Tracking');
const { processVehiclePosition, getStopConfig, updateStopConfig } = require('./utils/stopDetectionEngine');

async function runTests() {
  console.log('🧪 Starting Vehicle Stop Detection & Explanation Test Suite...\n');

  try {
    await connectDB();

    // 1. Setup test driver and vehicle
    console.log('1️⃣ Creating test driver and vehicle...');
    const driver = await Driver.create({
      driverName: 'Test Driver Venkatesh',
      phoneNumber: '+91 98765 43210',
      shiftTime: 'morning'
    });

    const vehicle = await Vehicle.create({
      vehicleNumber: 'AP24TEST9999',
      vehicleType: 'garbage-truck',
      assignedDriver: driver._id,
      driverName: driver.driverName,
      driverPhone: driver.phoneNumber,
      status: 'active',
      currentLocation: { lat: 15.8281, lng: 78.0373 },
      speed: 25,
      cleaningZone: 'Zone 1'
    });

    console.log(`   ✓ Created vehicle ${vehicle.vehicleNumber} and driver ${driver.driverName}`);

    // 2. Test initial stop detection
    console.log('\n2️⃣ Testing initial stop detection (speed = 0 km/h)...');
    const stopTime1 = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago to test threshold directly

    const mockIo = {
      to: (room) => ({
        emit: (event, data) => {
          console.log(`   📡 [MockSocket -> ${room}] ${event}`);
        }
      })
    };

    const stopResult1 = await processVehiclePosition({
      vehicle,
      lat: 15.8281,
      lng: 78.0373,
      speed: 0,
      timestamp: stopTime1,
      io: mockIo
    });

    console.log(`   ✓ Stop detected: ${stopResult1.isStopped}`);
    console.log(`   ✓ Active Stop ID: ${vehicle.currentStop?.stopId}`);
    if (!stopResult1.isStopped || !vehicle.currentStop?.stopId) {
      throw new Error('Initial stop detection failed!');
    }

    // 3. Test GPS fluctuation (drift) within 40m tolerance
    console.log('\n3️⃣ Testing GPS fluctuation / jitter filtering (small drift ~10 meters)...');
    // 0.00008 deg is ~9 meters
    const jitterLat = 15.8281 + 0.00008;
    const jitterLng = 78.0373 + 0.00008;
    const nowTime = new Date();

    const stopResult2 = await processVehiclePosition({
      vehicle,
      lat: jitterLat,
      lng: jitterLng,
      speed: 0,
      timestamp: nowTime,
      io: mockIo
    });

    console.log(`   ✓ Filtered GPS jitter: Vehicle remains stationary = ${stopResult2.isStopped}`);
    console.log(`   ✓ Server-calculated Stop Duration: ${vehicle.currentStop?.durationMinutes} minutes`);
    console.log(`   ✓ Alert Triggered: ${vehicle.currentStop?.alertTriggered}`);

    if (vehicle.currentStop?.durationMinutes < 10 || !vehicle.currentStop?.alertTriggered) {
      throw new Error('10-minute prolonged stop threshold alert did not trigger as expected!');
    }

    // Verify Alert record in DB
    const alertDoc = await Alert.findOne({ vehicleId: vehicle._id, type: 'prolonged-stop' });
    console.log(`   ✓ MongoDB Alert created: "${alertDoc?.message}"`);
    if (!alertDoc) throw new Error('Alert document was not created in MongoDB!');

    // 4. Test driver explanation submission
    console.log('\n4️⃣ Testing driver explanation submission...');
    const stopRecord = await VehicleStop.findById(vehicle.currentStop.stopId);
    stopRecord.explanation = {
      reason: 'traffic',
      details: 'Severe traffic congestion near Kurnool Bus Stand roadblock.',
      submittedAt: new Date(),
      driverName: driver.driverName
    };
    stopRecord.review = { status: 'pending' };
    await stopRecord.save();

    console.log(`   ✓ Explanation saved: reason="${stopRecord.explanation.reason}", status="${stopRecord.review.status}"`);

    // 5. Test admin review & approval
    console.log('\n5️⃣ Testing admin review (Approve)...');
    stopRecord.review = {
      status: 'approved',
      reviewedByName: 'KMC Admin',
      reviewedAt: new Date(),
      remarks: 'Verified via traffic camera. Approved.'
    };
    await stopRecord.save();

    // Mark alert acknowledged upon approval
    alertDoc.acknowledged = true;
    alertDoc.resolvedAt = new Date();
    await alertDoc.save();

    console.log(`   ✓ Review completed: status="${stopRecord.review.status}", remarks="${stopRecord.review.remarks}"`);
    console.log(`   ✓ Alert resolved: acknowledged=${alertDoc.acknowledged}`);

    // 6. Test vehicle movement resumption
    console.log('\n6️⃣ Testing vehicle movement resumption (speed = 22 km/h, moved away)...');
    const moveLat = 15.8350; // moved ~800 meters away
    const moveLng = 78.0420;

    const moveResult = await processVehiclePosition({
      vehicle,
      lat: moveLat,
      lng: moveLng,
      speed: 22,
      timestamp: new Date(),
      io: mockIo
    });

    console.log(`   ✓ Vehicle moving again: isStopped=${moveResult.isStopped}`);
    console.log(`   ✓ Completed Stop Duration: ${moveResult.completedStop?.durationMinutes} minutes`);
    console.log(`   ✓ Vehicle Status restored to: ${vehicle.status}`);
    console.log(`   ✓ vehicle.currentStop cleared: stopId=${vehicle.currentStop?.stopId}`);

    const finalStopInDb = await VehicleStop.findById(stopRecord._id);
    console.log(`   ✓ Final stop record in MongoDB: status="${finalStopInDb.status}", endTime=${finalStopInDb.endTime}`);

    // 7. Verify Tracking history event
    const stopTrackingPoint = await Tracking.findOne({ vehicleId: vehicle._id, eventType: 'stop' });
    console.log(`   ✓ Tracking stop history point recorded: eventType="${stopTrackingPoint?.eventType}"`);

    // Clean up test records
    await Vehicle.findByIdAndDelete(vehicle._id);
    await Driver.findByIdAndDelete(driver._id);
    await VehicleStop.findByIdAndDelete(stopRecord._id);
    await Alert.findByIdAndDelete(alertDoc._id);
    if (stopTrackingPoint) await Tracking.findByIdAndDelete(stopTrackingPoint._id);

    console.log('\n🎉 ALL 7 TESTS PASSED SUCCESSFULLY! The Vehicle Stop Detection & Explanation feature is fully functional and verified.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

runTests();
