const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Driver = require('../models/Driver');
const Route = require('../models/Route');
const WasteCollection = require('../models/WasteCollection');
const Alert = require('../models/Alert');
const { haversineDistance, generateWaypoints, estimateDuration } = require('../utils/geoUtils');
const Attendance = require('../models/Attendance');
const DriverActivity = require('../models/DriverActivity');
const DriverPerformance = require('../models/DriverPerformance');
const WorkforceAnalytics = require('../models/WorkforceAnalytics');
const VehicleStop = require('../models/VehicleStop');

// Kurnool localities with coordinates
const kurnoolLocalities = [
  { name: 'Kurnool Bus Stand', lat: 15.8312, lng: 78.0422 },
  { name: 'Market Area', lat: 15.8290, lng: 78.0390 },
  { name: 'Gandhi Nagar', lat: 15.8350, lng: 78.0300 },
  { name: 'Nehru Nagar', lat: 15.8200, lng: 78.0450 },
  { name: 'Bellary Road', lat: 15.8150, lng: 78.0500 },
  { name: 'Old Town', lat: 15.8330, lng: 78.0480 },
  { name: 'Nandyal Road', lat: 15.8400, lng: 78.0250 },
  { name: 'Srisailam Road', lat: 15.8450, lng: 78.0550 },
  { name: 'Budawara Peta', lat: 15.8280, lng: 78.0520 },
  { name: 'Kallur', lat: 15.8100, lng: 78.0600 },
  { name: 'Kothapeta', lat: 15.8370, lng: 78.0350 },
  { name: 'Venkata Ramana Colony', lat: 15.8220, lng: 78.0280 },
  { name: 'Ashok Nagar', lat: 15.8180, lng: 78.0350 },
  { name: 'Raghavendra Nagar', lat: 15.8420, lng: 78.0400 },
  { name: 'Vidya Nagar', lat: 15.8260, lng: 78.0200 },
  { name: 'Sai Nagar', lat: 15.8140, lng: 78.0420 },
  { name: 'Balaji Nagar', lat: 15.8390, lng: 78.0580 },
  { name: 'Railway Station Area', lat: 15.8310, lng: 78.0460 },
  { name: 'Govt Hospital Area', lat: 15.8240, lng: 78.0380 },
  { name: 'Handri River Side', lat: 15.8080, lng: 78.0320 },
  { name: 'R&B Guest House Area', lat: 15.8340, lng: 78.0440 },
  { name: 'Stadium Road', lat: 15.8270, lng: 78.0310 },
  { name: 'Ulchala Road', lat: 15.8160, lng: 78.0480 },
  { name: 'Mosque Road', lat: 15.8300, lng: 78.0410 },
  { name: 'Corporation Office', lat: 15.8295, lng: 78.0405 },
];

// Dumping yards
const dumpingYards = [
  { name: 'Kurnool Municipal Dumping Yard', lat: 15.8450, lng: 78.0650 },
  { name: 'Orvakal Dump Site', lat: 15.7900, lng: 78.0800 },
  { name: 'Panyam Road Yard', lat: 15.8550, lng: 78.0200 },
];

// Cleaning zones
const cleaningZones = [
  'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5',
  'Zone 6', 'Zone 7', 'Zone 8', 'Zone 9', 'Zone 10'
];

// Driver names (Telugu/Kurnool region)
const driverNames = [
  'Ramesh Reddy', 'Suresh Kumar', 'Venkatesh Naidu', 'Srinivas Rao', 'Ganesh Babu',
  'Rajendra Prasad', 'Manoj Kumar', 'Kiran Kumar', 'Ravi Shankar', 'Lakshmi Narayana',
  'Prasad Rao', 'Venkanna', 'Obulesu', 'Ramaiah', 'Nagesh',
  'Siva Prasad', 'Chandra Shekar', 'Bala Krishna', 'Madhu Babu', 'Tirupathi Rao',
  'Nagarjuna', 'Srikanth', 'Malla Reddy', 'Peda Venkaiah', 'Ankaiah',
  'Siddaiah', 'Rangaiah', 'Basavaiah', 'Lakshmaiah', 'Narasimha Reddy',
  'Hari Krishna', 'Gopal Reddy', 'Mohan Rao', 'Subrahmanyam', 'Yella Reddy',
  'Peddi Reddy', 'Siva Reddy', 'Ranga Reddy', 'Thimma Reddy', 'Chinna Obulesu',
];

const vehicleTypes = ['garbage-truck', 'mini-truck', 'auto-tipper', 'compactor', 'road-sweeper', 'water-tanker'];
const statuses = ['active', 'active', 'active', 'active', 'idle', 'idle', 'maintenance', 'offline'];
const containerTypes = ['240L-bin', '660L-bin', 'dumpster', 'open-container', 'compactor-bin'];
const wasteTypes = ['wet', 'dry', 'mixed', 'hazardous', 'construction'];
const collectionStatuses = ['pending', 'in-progress', 'in-progress', 'in-progress', 'completed', 'completed', 'completed', 'missed'];
const routeTypes = ['garbage-collection', 'garbage-collection', 'street-cleaning', 'drain-cleaning'];
const trafficConditions = ['clear', 'clear', 'moderate', 'moderate', 'heavy'];
const alertTypes = ['overspeed', 'overload', 'route-deviation', 'missed-area', 'delayed-collection', 'vehicle-breakdown', 'fuel-low', 'vehicle-offline', 'maintenance-due'];
const severities = ['low', 'medium', 'medium', 'high', 'critical'];
const shiftTimes = ['morning', 'morning', 'morning', 'afternoon', 'afternoon', 'night'];

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateVehicleNumber = (index) => {
  const num = String(randomBetween(1000, 9999));
  const series = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `AP24${series}${num}`;
};

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting Kurnool Municipal Corporation database seed...');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Vehicle.deleteMany({}),
      Driver.deleteMany({}),
      Route.deleteMany({}),
      WasteCollection.deleteMany({}),
      Alert.deleteMany({}),
      Attendance.deleteMany({}),
      DriverActivity.deleteMany({}),
      DriverPerformance.deleteMany({}),
      WorkforceAnalytics.deleteMany({}),
      VehicleStop.deleteMany({}),
    ]);

    // Create admin user
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    await User.create({
      username: 'KMC Admin',
      email: 'admin@kmc.gov.in',
      password: hashedPassword,
      role: 'admin',
      department: 'Sanitation',
      employeeId: 'KMC-001'
    });

    // Create supervisor
    const supervisorPass = await bcrypt.hash('user123', salt);
    await User.create({
      username: 'Supervisor',
      email: 'supervisor@kmc.gov.in',
      password: supervisorPass,
      role: 'supervisor',
      department: 'Sanitation',
      employeeId: 'KMC-002'
    });

    console.log('👤 Users created');

    // Create 40 drivers
    const drivers = [];
    for (let i = 0; i < 40; i++) {
      const driver = await Driver.create({
        driverName: driverNames[i],
        phoneNumber: `+91 ${randomBetween(70000, 99999)} ${randomBetween(10000, 99999)}`,
        aadharLast4: String(randomBetween(1000, 9999)),
        shiftTime: randomItem(shiftTimes),
        joiningDate: new Date(Date.now() - randomBetween(180, 1800) * 86400000),
        status: i < 35 ? 'active' : randomItem(['active', 'on-leave']),
        performanceScore: randomBetween(55, 98),
        address: `${randomItem(kurnoolLocalities).name}, Kurnool`,
        emergencyContact: `+91 ${randomBetween(70000, 99999)} ${randomBetween(10000, 99999)}`,
        totalTrips: randomBetween(100, 2000),
        totalWasteCollected: randomBetween(50000, 500000),
        attendanceCount: randomBetween(200, 350),
        absentCount: randomBetween(5, 40),
      });
      drivers.push(driver);

      const driverUserPass = await bcrypt.hash('driver123', salt);
      const email = `${driverNames[i].split(' ').join('').toLowerCase()}@kmc.gov.in`;
      await User.create({
        username: driverNames[i],
        email: email,
        password: driverUserPass,
        role: 'driver',
        department: 'Sanitation',
        employeeId: driver._id
      });
    }
    console.log('👷 40 drivers and their corresponding login accounts created');

    // Create 25 routes
    const routes = [];
    for (let i = 0; i < 25; i++) {
      const srcLocality = kurnoolLocalities[i % kurnoolLocalities.length];
      const dstYard = dumpingYards[i % dumpingYards.length];
      const dist = haversineDistance(srcLocality.lat, srcLocality.lng, dstYard.lat, dstYard.lng);
      const waypoints = generateWaypoints(srcLocality, dstYard, randomBetween(5, 10));
      const zone = cleaningZones[i % cleaningZones.length];

      const route = await Route.create({
        routeName: `${srcLocality.name} → ${dstYard.name}`,
        cleaningZone: zone,
        wardNumber: randomBetween(1, 50),
        routeType: randomItem(routeTypes),
        source: { name: srcLocality.name, lat: srcLocality.lat, lng: srcLocality.lng },
        destination: { name: dstYard.name, lat: dstYard.lat, lng: dstYard.lng },
        dumpingYard: { name: dstYard.name, lat: dstYard.lat, lng: dstYard.lng },
        checkpoints: [{
          name: `Checkpoint ${i + 1}`,
          lat: (srcLocality.lat + dstYard.lat) / 2 + (Math.random() - 0.5) * 0.01,
          lng: (srcLocality.lng + dstYard.lng) / 2 + (Math.random() - 0.5) * 0.01
        }],
        waypoints,
        distance: Math.round(dist * 1.3 * 10) / 10,
        estimatedDuration: estimateDuration(dist * 1.3),
        trafficCondition: randomItem(trafficConditions),
        status: randomItem(['active', 'active', 'completed', 'planned'])
      });
      routes.push(route);
    }
    console.log('🛣️  25 cleaning routes created');

    // Create 40 vehicles
    const vehicles = [];
    for (let i = 0; i < 40; i++) {
      const route = routes[i % routes.length];
      const driver = drivers[i];
      const status = randomItem(statuses);
      const zone = cleaningZones[i % cleaningZones.length];
      const progress = Math.random();
      const srcLat = route.source.lat;
      const srcLng = route.source.lng;
      const dstLat = route.destination.lat;
      const dstLng = route.destination.lng;

      const currentLat = srcLat + (dstLat - srcLat) * progress + (Math.random() - 0.5) * 0.008;
      const currentLng = srcLng + (dstLng - srcLng) * progress + (Math.random() - 0.5) * 0.008;
      const loadCap = randomBetween(3000, 10000);

      const vehicle = await Vehicle.create({
        vehicleNumber: generateVehicleNumber(i),
        vehicleType: randomItem(vehicleTypes),
        assignedDriver: driver._id,
        driverName: driver.driverName,
        driverPhone: driver.phoneNumber,
        status,
        cleaningZone: zone,
        wardNumber: randomBetween(1, 50),
        currentLocation: { lat: currentLat, lng: currentLng },
        fuelLevel: randomBetween(15, 100),
        speed: status === 'active' ? randomBetween(10, 40) : 0,
        loadCapacity: loadCap,
        currentLoadWeight: status === 'active' ? randomBetween(500, loadCap) : 0,
        wasteType: randomItem(wasteTypes),
        containerType: randomItem(containerTypes),
        mileage: randomBetween(5000, 120000),
        lastMaintenance: new Date(Date.now() - randomBetween(1, 60) * 86400000),
        nextMaintenanceDue: new Date(Date.now() + randomBetween(5, 60) * 86400000),
        assignedRoute: route._id,
        heading: randomBetween(0, 360),
        engineTemp: randomBetween(70, 100),
        idleTime: status === 'idle' ? randomBetween(5, 60) : 0,
        registrationYear: randomBetween(2018, 2025)
      });
      vehicles.push(vehicle);

      // Update driver with assigned vehicle
      await Driver.findByIdAndUpdate(driver._id, { assignedVehicle: vehicle._id });

      // Update route with assigned vehicle
      if (i < 25) {
        await Route.findByIdAndUpdate(route._id, { assignedVehicle: vehicle._id });
      }
    }
    console.log('🚛 40 municipality vehicles created');

    // Create 60 waste collection records
    for (let i = 0; i < 60; i++) {
      const vehicle = vehicles[i % vehicles.length];
      const route = routes[i % routes.length];
      const wType = randomItem(wasteTypes);
      const cStatus = randomItem(collectionStatuses);

      await WasteCollection.create({
        collectionId: `WC-${String(i + 1).padStart(4, '0')}`,
        vehicleId: vehicle._id,
        routeId: route._id,
        wasteType: wType,
        loadWeight: randomBetween(200, 5000),
        containerType: randomItem(containerTypes),
        collectionStatus: cStatus,
        cleaningZone: cleaningZones[i % cleaningZones.length],
        wardNumber: randomBetween(1, 50),
        households: randomBetween(50, 500),
        collectedAt: cStatus !== 'pending' ? new Date(Date.now() - randomBetween(0, 48) * 3600000) : null,
        dumpedAt: cStatus === 'completed' ? new Date(Date.now() - randomBetween(0, 24) * 3600000) : null,
        dumpingYard: dumpingYards[i % dumpingYards.length].name,
      });
    }
    console.log('♻️  60 waste collection records created');

    // Create alerts
    for (let i = 0; i < 25; i++) {
      const vehicle = vehicles[randomBetween(0, 39)];
      const type = randomItem(alertTypes);
      const messages = {
        'overspeed': `${vehicle.vehicleNumber} exceeding speed limit at ${randomBetween(45, 70)} km/h in residential area`,
        'overload': `${vehicle.vehicleNumber} waste load ${randomBetween(5000, 8000)}kg exceeds ${vehicle.loadCapacity}kg capacity`,
        'route-deviation': `${vehicle.vehicleNumber} deviated from assigned cleaning route in ${vehicle.cleaningZone}`,
        'missed-area': `${vehicle.vehicleNumber} missed scheduled cleaning area in Ward ${randomBetween(1, 50)}`,
        'delayed-collection': `${vehicle.vehicleNumber} delayed waste collection by ${randomBetween(30, 120)} minutes`,
        'vehicle-breakdown': `${vehicle.vehicleNumber} reported mechanical failure near ${randomItem(kurnoolLocalities).name}`,
        'fuel-low': `${vehicle.vehicleNumber} fuel level critically low at ${randomBetween(3, 14)}%`,
        'vehicle-offline': `${vehicle.vehicleNumber} went offline - no GPS signal for ${randomBetween(5, 30)} minutes`,
        'maintenance-due': `${vehicle.vehicleNumber} maintenance overdue by ${randomBetween(5, 20)} days`,
      };

      // Requirement 8 test case: deliberate missing GPS location for couple alerts
      const hasGps = (i !== 3 && i !== 8);
      const loc = (hasGps && vehicle.currentLocation?.lat != null) ? {
        lat: vehicle.currentLocation.lat,
        lng: vehicle.currentLocation.lng,
        address: `${vehicle.cleaningZone}, Kurnool`
      } : {
        lat: null,
        lng: null,
        address: ''
      };

      await Alert.create({
        vehicleId: vehicle._id,
        vehicleNumber: vehicle.vehicleNumber,
        driverName: vehicle.driverName,
        type,
        severity: randomItem(severities),
        message: messages[type],
        location: loc,
        address: hasGps ? `${vehicle.cleaningZone}, Kurnool` : '',
        cleaningZone: vehicle.cleaningZone,
        acknowledged: Math.random() > 0.6,
        createdAt: new Date(Date.now() - randomBetween(0, 72) * 3600000)
      });
    }
    console.log('🚨 25 alerts created');

    // Create 2 realistic stop records and prolonged stop alerts
    const stop1Start = new Date(Date.now() - 25 * 60 * 1000);
    const stop1Loc = { lat: 15.8281, lng: 78.0373, address: 'Near Market Area, Zone 1' };
    const stop1Alert = await Alert.create({
      vehicleId: vehicles[0]._id,
      vehicleNumber: vehicles[0].vehicleNumber,
      driverName: vehicles[0].driverName,
      stopDuration: 25,
      stopStartTime: stop1Start,
      address: stop1Loc.address,
      type: 'prolonged-stop',
      severity: 'high',
      message: `Vehicle ${vehicles[0].vehicleNumber} (Driver: ${vehicles[0].driverName}) stationary at Zone 1 for 25 minutes. Explanation required from driver.`,
      location: { lat: stop1Loc.lat, lng: stop1Loc.lng },
      cleaningZone: 'Zone 1',
      acknowledged: false,
      createdAt: new Date(Date.now() - 15 * 60 * 1000)
    });

    const stop1 = await VehicleStop.create({
      vehicleId: vehicles[0]._id,
      vehicleNumber: vehicles[0].vehicleNumber,
      driverId: vehicles[0].assignedDriver,
      driverName: vehicles[0].driverName,
      driverPhone: vehicles[0].driverPhone,
      location: stop1Loc,
      cleaningZone: 'Zone 1',
      wardNumber: 1,
      startTime: stop1Start,
      durationMinutes: 25,
      status: 'active',
      timerStopped: false,
      alertTriggered: true,
      alertId: stop1Alert._id
    });
    await Alert.findByIdAndUpdate(stop1Alert._id, { stopId: stop1._id });

    // Vehicle 1 has moved since alert (Requirement 5 test case!)
    const stop2Start = new Date(Date.now() - 35 * 60 * 1000);
    const stop2Loc = { lat: 15.8350, lng: 78.0300, address: 'Gandhi Nagar Main Junction' };
    const stop2Alert = await Alert.create({
      vehicleId: vehicles[1]._id,
      vehicleNumber: vehicles[1].vehicleNumber,
      driverName: vehicles[1].driverName,
      stopDuration: 22,
      stopStartTime: stop2Start,
      address: stop2Loc.address,
      type: 'prolonged-stop',
      severity: 'high',
      message: `Vehicle ${vehicles[1].vehicleNumber} (Driver: ${vehicles[1].driverName}) stopped for 22 mins near Gandhi Nagar. Explanation submitted.`,
      location: { lat: stop2Loc.lat, lng: stop2Loc.lng },
      cleaningZone: 'Zone 2',
      acknowledged: false,
      createdAt: new Date(Date.now() - 20 * 60 * 1000)
    });

    const stop2 = await VehicleStop.create({
      vehicleId: vehicles[1]._id,
      vehicleNumber: vehicles[1].vehicleNumber,
      driverId: vehicles[1].assignedDriver,
      driverName: vehicles[1].driverName,
      driverPhone: vehicles[1].driverPhone,
      location: stop2Loc,
      cleaningZone: 'Zone 2',
      wardNumber: 2,
      startTime: stop2Start,
      endTime: new Date(Date.now() - 13 * 60 * 1000),
      durationMinutes: 22,
      finalDurationMinutes: 22,
      status: 'completed',
      timerStopped: true,
      alertTriggered: true,
      alertId: stop2Alert._id,
      explanation: {
        reason: 'traffic jam',
        details: 'Heavy vehicle blockage and road construction near Kurnool Bus Stand.',
        submittedAt: new Date(Date.now() - 18 * 60 * 1000),
        driverName: vehicles[1].driverName
      },
      review: {
        status: 'pending'
      }
    });
    await Alert.findByIdAndUpdate(stop2Alert._id, { stopId: stop2._id });

    // Create 30 days of simulated attendance, performance, and timeline activity logs
    console.log('⏰ Seeding attendance, activities, and performance logs...');
    const today = new Date();
    
    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() - dayOffset);
      const dateString = currentDate.toISOString().split('T')[0];
      
      let dailyPresent = 0;
      let dailyAbsent = 0;
      let dailyActive = 0;
      let dailyBreak = 0;
      let dailyOvertime = 0;
      let dailyTotalHours = 0;

      for (let i = 0; i < drivers.length; i++) {
        const driver = drivers[i];
        const vehicle = vehicles[i % vehicles.length];
        const isPresent = Math.random() < 0.90;
        
        if (isPresent) {
          dailyPresent++;
          
          let startHour = 8;
          if (driver.shiftTime === 'afternoon') startHour = 14;
          if (driver.shiftTime === 'night') startHour = 22;
          
          const checkInDelayMinutes = Math.floor(Math.random() * 60) - 15;
          const checkInTime = new Date(currentDate);
          checkInTime.setHours(startHour, 0, 0, 0);
          checkInTime.setMinutes(checkInTime.getMinutes() + checkInDelayMinutes);
          
          const isLate = checkInDelayMinutes > 30;
          const status = isLate ? 'Late' : 'Present';
          
          const shiftDurationHours = 7.5 + Math.random() * 2;
          const checkOutTime = new Date(checkInTime);
          checkOutTime.setMinutes(checkOutTime.getMinutes() + Math.round(shiftDurationHours * 60));
          
          const totalHours = Math.round(shiftDurationHours * 100) / 100;
          const overtime = totalHours > 8 ? Math.round((totalHours - 8) * 100) / 100 : 0;
          if (overtime > 0) dailyOvertime++;
          
          const breakTime = Math.round((0.5 + Math.random() * 0.5) * 100) / 100;
          const remaining = totalHours - breakTime;
          const activeDrivingTime = Math.round(remaining * 0.7 * 100) / 100;
          const idleTime = Math.round(remaining * 0.3 * 100) / 100;
          
          dailyTotalHours += totalHours;

          const att = await Attendance.create({
            driverId: driver._id,
            date: dateString,
            checkIn: checkInTime,
            checkOut: dayOffset === 0 && Math.random() > 0.5 ? null : checkOutTime,
            checkInLocation: {
              lat: 15.8295 + (Math.random() - 0.5) * 0.02,
              lng: 78.0405 + (Math.random() - 0.5) * 0.02
            },
            checkOutLocation: {
              lat: 15.8295 + (Math.random() - 0.5) * 0.02,
              lng: 78.0405 + (Math.random() - 0.5) * 0.02
            },
            assignedVehicle: vehicle._id,
            status,
            totalHours,
            overtime,
            breakTime,
            activeDrivingTime,
            idleTime
          });

          await DriverActivity.create({
            driverId: driver._id,
            attendanceId: att._id,
            activityType: 'check-in',
            details: `Checked in for ${driver.shiftTime} shift.`,
            location: att.checkInLocation,
            timestamp: checkInTime
          });

          const breakStart = new Date(checkInTime);
          breakStart.setHours(breakStart.getHours() + 4);
          await DriverActivity.create({
            driverId: driver._id,
            attendanceId: att._id,
            activityType: 'break-started',
            details: `Started shift rest break.`,
            location: att.checkInLocation,
            timestamp: breakStart
          });

          const breakEnd = new Date(breakStart);
          breakEnd.setMinutes(breakEnd.getMinutes() + Math.round(breakTime * 60));
          await DriverActivity.create({
            driverId: driver._id,
            attendanceId: att._id,
            activityType: 'break-ended',
            details: `Ended break, resumed duty.`,
            location: att.checkInLocation,
            timestamp: breakEnd
          });

          if (att.checkOut) {
            await DriverActivity.create({
              driverId: driver._id,
              attendanceId: att._id,
              activityType: 'check-out',
              details: `Checked out. Shift completed.`,
              location: att.checkOutLocation,
              timestamp: checkOutTime
            });
          }

          const distanceCovered = Math.round((activeDrivingTime * (18 + Math.random() * 8)) * 10) / 10;
          const routesCompleted = Math.round(activeDrivingTime / 1.6) || 1;
          const wasteCollected = Math.round(activeDrivingTime * (250 + Math.random() * 100));
          
          const safetyScore = Math.max(60, 100 - (Math.random() > 0.85 ? 15 : 0) - (overtime > 1 ? 10 : 0));
          const punctualityScore = isLate ? 70 : 100;
          const routeEfficiency = 85 + Math.floor(Math.random() * 15);
          
          const performanceScore = Math.round(
            (punctualityScore * 0.2) +
            (safetyScore * 0.3) +
            (Math.min(100, (routesCompleted / 3) * 100) * 0.2) +
            (Math.min(100, (wasteCollected / 1500) * 100) * 0.3)
          );

          await DriverPerformance.create({
            driverId: driver._id,
            date: currentDate,
            distanceCovered,
            routesCompleted,
            wasteCollected,
            hoursWorked: totalHours,
            attendanceRate: 100,
            punctualityScore,
            routeEfficiency,
            safetyScore,
            performanceScore
          });
        } else {
          dailyAbsent++;
          
          await Attendance.create({
            driverId: driver._id,
            date: dateString,
            checkIn: currentDate,
            checkOut: currentDate,
            checkInLocation: { lat: 0, lng: 0 },
            checkOutLocation: { lat: 0, lng: 0 },
            status: 'Absent',
            totalHours: 0,
            overtime: 0
          });
        }
      }

      const attendanceRate = Math.round((dailyPresent / drivers.length) * 100);
      const avgHours = dailyPresent > 0 ? Math.round((dailyTotalHours / dailyPresent) * 10) / 10 : 0;

      const routesCount = vehicles.length;
      const predictedWorkforceNeeded = Math.ceil(routesCount * 1.15);
      const predictedAbsenteeism = 10;
      const predictedOvertimeNeeded = Math.round(vehicles.length * 0.15 * 2);

      await WorkforceAnalytics.create({
        date: currentDate,
        totalDrivers: drivers.length,
        presentDrivers: dailyPresent,
        absentDrivers: dailyAbsent,
        activeDrivers: Math.round(dailyPresent * 0.82),
        onBreakDrivers: Math.round(dailyPresent * 0.18),
        overtimeDrivers: dailyOvertime,
        attendanceRate,
        averageHoursPerDriver: avgHours,
        totalHoursWorked: Math.round(dailyTotalHours * 10) / 10,
        predictions: {
          predictedAbsenteeism,
          predictedWorkforceNeeded,
          predictedOvertimeNeeded,
          confidenceScore: 85,
          insights: [
            `Workforce requirements predicted based on active routes.`,
            `Potential traffic delays near Kurnool Bus Stand might affect afternoon shift durations.`
          ]
        }
      });
    }
    console.log('⏰ Attendance, activities, and performance logs successfully seeded!');

    console.log('\n✅ Kurnool Municipal Corporation database seeded successfully!');
    console.log('🏛️  Admin login: admin@kmc.gov.in / admin123');
    console.log('👷 Supervisor login: supervisor@kmc.gov.in / user123');
    console.log('🚛 Driver login: <driver_name_without_spaces>@kmc.gov.in / driver123');
    console.log('   Example: rameshreddy@kmc.gov.in / driver123\n');

  } catch (error) {
    console.error('❌ Seed error:', error.message);
    throw error;
  }
};

module.exports = { seedDatabase };
