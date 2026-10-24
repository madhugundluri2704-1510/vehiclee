const Vehicle = require('../models/Vehicle');
const Alert = require('../models/Alert');
const Tracking = require('../models/Tracking');
const Driver = require('../models/Driver');
const Attendance = require('../models/Attendance');
const DriverActivity = require('../models/DriverActivity');
const Complaint = require('../models/Complaint');
const { assignNearestVehicle, optimizeReturnRoute, getDistance } = require('../utils/assignmentEngine');
const { processVehiclePosition, checkDisconnectedVehicles } = require('../utils/stopDetectionEngine');

const cleaningZones = ['Zone 1','Zone 2','Zone 3','Zone 4','Zone 5','Zone 6','Zone 7','Zone 8','Zone 9','Zone 10'];
let simulationInterval = null;
let simulationTicks = 0;

const initializeSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    socket.on('join:dashboard', () => { socket.join('dashboard'); });
    socket.on('join:driver', (driverId) => {
      socket.join(`driver:${driverId}`);
      console.log(`👷 Driver socket joined room: driver:${driverId}`);
    });
    socket.on('track:vehicle', (vid) => { socket.join(`vehicle:${vid}`); });
    socket.on('untrack:vehicle', (vid) => { socket.leave(`vehicle:${vid}`); });
    socket.on('disconnect', () => { console.log(`❌ Disconnected: ${socket.id}`); });
  });
  if (!simulationInterval) startSimulation(io);
};

const startSimulation = (io) => {
  console.log('🚛 Starting Kurnool cleaning vehicle simulation...');
  simulationInterval = setInterval(async () => {
    try {
      simulationTicks++;
      if (simulationTicks % 10 === 0) {
        await checkDisconnectedVehicles(io);
      }

      const vehicles = await Vehicle.find({
        $or: [{ status: 'active' }, { 'currentStop.stopId': { $ne: null } }]
      });

      for (const vehicle of vehicles) {
        // If vehicle has an active stop, keep stationary with realistic GPS jitter
        if (vehicle.currentStop?.stopId) {
          const baseLat = vehicle.currentStop.lat || vehicle.currentLocation.lat || 15.8281;
          const baseLng = vehicle.currentStop.lng || vehicle.currentLocation.lng || 78.0373;
          const jitterLat = baseLat + (Math.random() - 0.5) * 0.00004;
          const jitterLng = baseLng + (Math.random() - 0.5) * 0.00004;

          await processVehiclePosition({
            vehicle,
            lat: jitterLat,
            lng: jitterLng,
            speed: 0,
            timestamp: new Date(),
            io
          });

          await Vehicle.findByIdAndUpdate(vehicle._id, {
            currentLocation: { lat: jitterLat, lng: jitterLng },
            speed: 0,
            status: vehicle.status || 'idle',
            currentStop: vehicle.currentStop,
            lastGpsUpdate: new Date()
          });

          io.to('dashboard').emit('vehicle:update', {
            _id: vehicle._id,
            vehicleNumber: vehicle.vehicleNumber,
            currentLocation: { lat: jitterLat, lng: jitterLng },
            speed: 0,
            fuelLevel: vehicle.fuelLevel,
            heading: vehicle.heading,
            status: vehicle.status || 'idle',
            currentLoadWeight: vehicle.currentLoadWeight,
            cleaningZone: vehicle.cleaningZone,
            wasteType: vehicle.wasteType,
            currentStop: vehicle.currentStop
          });

          io.to(`vehicle:${vehicle._id}`).emit('tracking:live', {
            latitude: jitterLat,
            longitude: jitterLng,
            speed: 0,
            fuelLevel: vehicle.fuelLevel,
            wasteWeight: vehicle.currentLoadWeight,
            timestamp: new Date()
          });
          continue;
        }

        const speed = 10 + Math.random() * 25;
        const heading = vehicle.heading + (Math.random() - 0.5) * 30;
        const dist = (speed / 3600) * 3;
        const latC = (dist / 111) * Math.cos(heading * Math.PI / 180) * (Math.random() > 0.5 ? 1 : -1) * 0.008;
        const lngC = (dist / 111) * Math.sin(heading * Math.PI / 180) * (Math.random() > 0.5 ? 1 : -1) * 0.008;
        const newLat = Math.max(15.78, Math.min(15.86, vehicle.currentLocation.lat + latC));
        const newLng = Math.max(77.99, Math.min(78.09, vehicle.currentLocation.lng + lngC));
        const fuelDrop = (speed / 1000) * 0.04;
        const newFuel = Math.max(0, vehicle.fuelLevel - fuelDrop);
        const wastePickup = Math.random() > 0.7 ? Math.floor(Math.random() * 50) : 0;
        const newLoad = Math.min(vehicle.loadCapacity, vehicle.currentLoadWeight + wastePickup);

        await Vehicle.findByIdAndUpdate(vehicle._id, {
          currentLocation: { lat: newLat, lng: newLng }, speed: Math.round(speed),
          fuelLevel: Math.round(newFuel * 10) / 10, heading: heading % 360,
          mileage: vehicle.mileage + dist, currentLoadWeight: newLoad,
          lastGpsUpdate: new Date()
        });
        await Tracking.create({
          vehicleId: vehicle._id, latitude: newLat, longitude: newLng,
          speed: Math.round(speed), heading: heading % 360, fuelLevel: newFuel,
          wasteWeight: newLoad, cleaningZone: vehicle.cleaningZone,
          eventType: wastePickup > 0 ? 'collection' : 'position'
        });

        await processVehiclePosition({
          vehicle,
          lat: newLat,
          lng: newLng,
          speed: Math.round(speed),
          timestamp: new Date(),
          io
        });

        // Try to optimize return route if returning
        if (vehicle.status === 'returning') {
          await optimizeReturnRoute(vehicle, io);
        }

        // Auto-complete assigned tasks simulation
        if (vehicle.currentTask) {
          const complaint = await Complaint.findById(vehicle.currentTask);
          if (complaint && (complaint.status === 'Assigned' || complaint.status === 'In Progress')) {
            const distance = getDistance(
              vehicle.currentLocation.lat, vehicle.currentLocation.lng,
              complaint.location.lat, complaint.location.lng
            );
            // If vehicle is within 0.5km OR just randomly complete it (10% chance)
            if (distance < 0.5 || Math.random() > 0.9) {
              complaint.status = 'Completed';
              complaint.resolvedAt = new Date();
              await complaint.save();
              
              await Vehicle.findByIdAndUpdate(vehicle._id, { currentTask: null });
              
              io.to('dashboard').emit('complaint_updated', complaint);
            }
          }
        }

        // Alerts: capture current valid GPS coordinates and location address
        if (speed > 35) {
          const ex = await Alert.findOne({ vehicleId: vehicle._id, type: 'overspeed', acknowledged: false, createdAt: { $gte: new Date(Date.now() - 60000) } });
          if (!ex) {
            const a = await Alert.create({
              vehicleId: vehicle._id,
              vehicleNumber: vehicle.vehicleNumber,
              driverName: vehicle.driverName,
              type: 'overspeed',
              severity: speed > 45 ? 'critical' : 'high',
              message: `${vehicle.vehicleNumber} speeding at ${Math.round(speed)} km/h in ${vehicle.cleaningZone}`,
              location: { lat: newLat, lng: newLng, address: vehicle.cleaningZone || 'Kurnool Municipal Area' },
              address: vehicle.cleaningZone || 'Kurnool Municipal Area',
              cleaningZone: vehicle.cleaningZone
            });
            io.to('dashboard').emit('alert:new', a);
          }
        }
        if (newFuel < 15) {
          const ex = await Alert.findOne({ vehicleId: vehicle._id, type: 'fuel-low', acknowledged: false, createdAt: { $gte: new Date(Date.now() - 300000) } });
          if (!ex) {
            const a = await Alert.create({
              vehicleId: vehicle._id,
              vehicleNumber: vehicle.vehicleNumber,
              driverName: vehicle.driverName,
              type: 'fuel-low',
              severity: newFuel < 5 ? 'critical' : 'medium',
              message: `${vehicle.vehicleNumber} fuel low at ${Math.round(newFuel)}%`,
              location: { lat: newLat, lng: newLng, address: vehicle.cleaningZone || 'Kurnool Municipal Area' },
              address: vehicle.cleaningZone || 'Kurnool Municipal Area',
              cleaningZone: vehicle.cleaningZone
            });
            io.to('dashboard').emit('alert:new', a);
          }
        }
        if (newLoad > vehicle.loadCapacity * 0.9) {
          const ex = await Alert.findOne({ vehicleId: vehicle._id, type: 'overload', acknowledged: false, createdAt: { $gte: new Date(Date.now() - 300000) } });
          if (!ex) {
            const a = await Alert.create({
              vehicleId: vehicle._id,
              vehicleNumber: vehicle.vehicleNumber,
              driverName: vehicle.driverName,
              type: 'overload',
              severity: newLoad >= vehicle.loadCapacity ? 'critical' : 'high',
              message: `${vehicle.vehicleNumber} load ${newLoad}kg / ${vehicle.loadCapacity}kg`,
              location: { lat: newLat, lng: newLng, address: vehicle.cleaningZone || 'Kurnool Municipal Area' },
              address: vehicle.cleaningZone || 'Kurnool Municipal Area',
              cleaningZone: vehicle.cleaningZone
            });
            io.to('dashboard').emit('alert:new', a);
          }
        }
        // Simulated Route Deviation alert with location
        if (vehicle.status === 'active' && Math.random() < 0.02) {
          const ex = await Alert.findOne({ vehicleId: vehicle._id, type: 'route-deviation', acknowledged: false, createdAt: { $gte: new Date(Date.now() - 300000) } });
          if (!ex) {
            const a = await Alert.create({
              vehicleId: vehicle._id,
              vehicleNumber: vehicle.vehicleNumber,
              driverName: vehicle.driverName,
              type: 'route-deviation',
              severity: 'high',
              message: `${vehicle.vehicleNumber} deviated from assigned cleaning route in ${vehicle.cleaningZone}`,
              location: { lat: newLat, lng: newLng, address: `${vehicle.cleaningZone}, Kurnool` },
              address: `${vehicle.cleaningZone}, Kurnool`,
              cleaningZone: vehicle.cleaningZone
            });
            io.to('dashboard').emit('alert:new', a);
          }
        }

        io.to('dashboard').emit('vehicle:update', {
          _id: vehicle._id, vehicleNumber: vehicle.vehicleNumber,
          currentLocation: { lat: newLat, lng: newLng }, speed: Math.round(speed),
          fuelLevel: Math.round(newFuel * 10) / 10, heading: heading % 360,
          status: vehicle.status, currentLoadWeight: newLoad,
          cleaningZone: vehicle.cleaningZone, wasteType: vehicle.wasteType,
          currentStop: vehicle.currentStop
        });
        io.to(`vehicle:${vehicle._id}`).emit('tracking:live', {
          latitude: newLat, longitude: newLng, speed: Math.round(speed),
          fuelLevel: newFuel, wasteWeight: newLoad, timestamp: new Date()
        });
      }

      const totalV = await Vehicle.countDocuments();
      const activeV = await Vehicle.countDocuments({ status: 'active' });
      const unack = await Alert.countDocuments({ acknowledged: false });
      const wl = await Vehicle.aggregate([{ $match: { status: 'active' } }, { $group: { _id: null, total: { $sum: '$currentLoadWeight' } } }]);
      io.to('dashboard').emit('dashboard:stats', { totalVehicles: totalV, activeVehicles: activeV, unacknowledgedAlerts: unack, totalWasteLoad: wl[0]?.total || 0, timestamp: new Date() });

      // Live Workforce Statistics Aggregation & Real-time Alerts simulation
      const todayStr = new Date().toISOString().split('T')[0];
      const totalDrivers = await Driver.countDocuments({ status: 'active' });
      const checkedIn = await Attendance.find({ date: todayStr });
      const presentDrivers = checkedIn.length;
      const absentDrivers = Math.max(0, totalDrivers - presentDrivers);
      
      let activeDrivers = 0;
      let onBreakDrivers = 0;
      let overtimeDrivers = 0;
      let totalHoursWorked = 0;
      const now = new Date();

      for (const log of checkedIn) {
        const elapsed = log.checkOut ? log.totalHours : (now - log.checkIn) / 3600000;
        totalHoursWorked += elapsed;
        if (elapsed > 8) overtimeDrivers++;

        if (!log.checkOut) {
          // If driving > 10 hours, simulate fatigue/overtime alert
          if (elapsed > 10) {
            const exFatigue = await Alert.findOne({
              vehicleId: log.assignedVehicle,
              type: 'fatigue',
              acknowledged: false,
              createdAt: { $gte: new Date(Date.now() - 300000) } // last 5 mins
            });
            if (!exFatigue && log.assignedVehicle) {
              const driverObj = await Driver.findById(log.driverId);
              const assignedVeh = await Vehicle.findById(log.assignedVehicle);
              const vLat = assignedVeh?.currentLocation?.lat;
              const vLng = assignedVeh?.currentLocation?.lng;
              const alt = await Alert.create({
                vehicleId: log.assignedVehicle,
                vehicleNumber: assignedVeh?.vehicleNumber || 'Unknown Vehicle',
                driverName: driverObj?.driverName || assignedVeh?.driverName || 'Operator',
                type: 'fatigue',
                severity: 'critical',
                message: `Fatigue Warning: Driver ${driverObj?.driverName || 'Operator'} is working overtime (${Math.round(elapsed)} hrs) without check-out.`,
                location: (vLat != null && vLng != null) ? { lat: vLat, lng: vLng, address: assignedVeh?.cleaningZone || driverObj?.address || 'Kurnool Municipal Area' } : { lat: null, lng: null, address: assignedVeh?.cleaningZone || 'Kurnool Area' },
                address: assignedVeh?.cleaningZone || driverObj?.address || 'Zone 1',
                cleaningZone: assignedVeh?.cleaningZone || driverObj?.address?.split(',')[0] || 'Zone 1'
              });
              io.to('dashboard').emit('alert:new', alt);
            }
          }

          const lastActivity = await DriverActivity.findOne({ attendanceId: log._id }).sort({ timestamp: -1 });
          if (lastActivity && lastActivity.activityType === 'break-started') {
            onBreakDrivers++;
          } else {
            activeDrivers++;
          }
        }
      }

      totalHoursWorked = Math.round(totalHoursWorked * 10) / 10;
      const averageHoursPerDriver = presentDrivers > 0 ? Math.round((totalHoursWorked / presentDrivers) * 10) / 10 : 0;
      const attendanceRate = totalDrivers > 0 ? Math.round((presentDrivers / totalDrivers) * 100) : 0;

      io.to('dashboard').emit('workforce:stats', {
        totalDrivers,
        presentDrivers,
        absentDrivers,
        activeDrivers,
        onBreakDrivers,
        overtimeDrivers,
        totalHoursWorked,
        averageHoursPerDriver,
        attendanceRate,
        timestamp: new Date()
      });

      // CCTV Alert Simulation (~15% chance per tick to keep demo lively)
      if (Math.random() < 0.15) {
        const count = await Complaint.countDocuments();
        const cctvComp = await Complaint.create({
          complaintId: `CCTV${1000 + count + 1}`,
          source: 'CCTV',
          location: { lat: 15.82 + (Math.random() - 0.5) * 0.05, lng: 78.03 + (Math.random() - 0.5) * 0.05 },
          ward: Math.floor(Math.random() * 50) + 1,
          zone: `Zone ${Math.floor(Math.random() * 10) + 1}`,
          priority: 'High',
          description: 'CCTV detected overflowing garbage bin'
        });
        io.to('dashboard').emit('new_complaint', cctvComp);
        await assignNearestVehicle(cctvComp._id, io);
      }

    } catch (error) { console.error('Simulation error:', error.message); }
  }, 3000);
};

module.exports = { initializeSocket };
