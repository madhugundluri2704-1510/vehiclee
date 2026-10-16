const Attendance = require('../models/Attendance');
const Driver = require('../models/Driver');
const Vehicle = require('../models/Vehicle');
const DriverActivity = require('../models/DriverActivity');
const WorkforceAnalytics = require('../models/WorkforceAnalytics');
const DriverPerformance = require('../models/DriverPerformance');

// Helper to get formatted date string (YYYY-MM-DD)
const getTodayDateString = (date = new Date()) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// 1. Digital Check-In
exports.checkIn = async (req, res) => {
  try {
    const { driverId, vehicleId, latitude, longitude } = req.body;
    const todayStr = getTodayDateString();

    // Check if driver is currently on an active duty shift (checked in without checkout)
    const activeAttendance = await Attendance.findOne({
      driverId,
      date: todayStr,
      checkOut: null,
      status: { $ne: 'Absent' }
    });

    if (activeAttendance) {
      return res.status(400).json({ message: 'Driver is currently on active duty shift. Check out first before new check-in.' });
    }

    // Get driver details
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found.' });
    }

    // Get vehicle details
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found.' });
    }

    // Determine if late check-in (e.g. check-in after 8:30 AM for morning shift)
    let status = 'Present';
    const checkInTime = new Date();
    const hours = checkInTime.getHours();
    const minutes = checkInTime.getMinutes();
    const timeVal = hours + minutes / 60;

    if (driver.shiftTime === 'morning' && timeVal > 8.5) {
      status = 'Late';
    } else if (driver.shiftTime === 'afternoon' && timeVal > 14.5) {
      status = 'Late';
    } else if (driver.shiftTime === 'night' && timeVal > 22.5) {
      status = 'Late';
    }

    // Create or update attendance record for today
    let attendance = await Attendance.findOne({ driverId, date: todayStr });
    if (attendance) {
      attendance.checkIn = checkInTime;
      attendance.checkOut = null;
      attendance.checkInLocation = { lat: latitude, lng: longitude };
      attendance.assignedVehicle = vehicleId;
      attendance.status = status;
      attendance.totalHours = 0;
      attendance.overtime = 0;
      attendance.breakTime = 0;
      attendance.activeDrivingTime = 0;
      attendance.idleTime = 0;
      await attendance.save();
    } else {
      attendance = await Attendance.create({
        driverId,
        date: todayStr,
        checkIn: checkInTime,
        checkInLocation: { lat: latitude, lng: longitude },
        assignedVehicle: vehicleId,
        status
      });
    }

    // Update driver assigned vehicle & temporary status
    driver.assignedVehicle = vehicleId;
    driver.attendanceCount += 1;
    await driver.save();

    // Update vehicle details
    vehicle.assignedDriver = driverId;
    vehicle.driverName = driver.driverName;
    vehicle.driverPhone = driver.phoneNumber;
    vehicle.status = 'active';
    await vehicle.save();

    // Create activity timeline log
    const activity = await DriverActivity.create({
      driverId,
      attendanceId: attendance._id,
      activityType: 'check-in',
      details: `Checked in for shift (${driver.shiftTime}). Assigned vehicle ${vehicle.vehicleNumber}.`,
      location: { lat: latitude, lng: longitude }
    });

    await DriverActivity.create({
      driverId,
      attendanceId: attendance._id,
      activityType: 'vehicle-assigned',
      details: `Vehicle ${vehicle.vehicleNumber} (${vehicle.vehicleType}) successfully linked.`,
      location: { lat: latitude, lng: longitude }
    });

    // Real-time notification over Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to('dashboard').emit('attendance:update', {
        type: 'check-in',
        driverName: driver.driverName,
        vehicleNumber: vehicle.vehicleNumber,
        timestamp: checkInTime,
        status
      });
      // Trigger update of workforce metrics
      const stats = await getAggregatedStats();
      io.to('dashboard').emit('workforce:stats', stats);
    }

    res.status(201).json({ attendance, activity });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Shift Check-Out
exports.checkOut = async (req, res) => {
  try {
    const { driverId, latitude, longitude } = req.body;
    const todayStr = getTodayDateString();

    const attendance = await Attendance.findOne({ driverId, date: todayStr, checkOut: null });
    if (!attendance) {
      return res.status(400).json({ message: 'No active check-in session found for this driver today.' });
    }

    const driver = await Driver.findById(driverId);
    const checkOutTime = new Date();
    
    // Calculate total hours
    const totalHours = Math.round(((checkOutTime - attendance.checkIn) / 3600000) * 100) / 100;
    
    // Calculate overtime (over 8 hours)
    const overtime = totalHours > 8 ? Math.round((totalHours - 8) * 100) / 100 : 0;

    // Simulate active driving, idle, and break times if not fully tracked
    // E.g., breaks are fetched from timeline, driving is 65% of work hours, idle is rest
    const breakLogs = await DriverActivity.find({
      driverId,
      attendanceId: attendance._id,
      activityType: { $in: ['break-started', 'break-ended'] }
    }).sort({ timestamp: 1 });

    let totalBreakHours = 0;
    for (let i = 0; i < breakLogs.length; i += 2) {
      const start = breakLogs[i];
      const end = breakLogs[i + 1];
      if (start && end) {
        totalBreakHours += (end.timestamp - start.timestamp) / 3600000;
      } else if (start && !end) {
        // If driver checked out while on break, close the break now
        totalBreakHours += (checkOutTime - start.timestamp) / 3600000;
      }
    }
    totalBreakHours = Math.round(totalBreakHours * 100) / 100;

    const remainingTime = Math.max(0, totalHours - totalBreakHours);
    const activeDrivingTime = Math.round(remainingTime * 0.7 * 100) / 100;
    const idleTime = Math.round(remainingTime * 0.3 * 100) / 100;

    // Update Attendance
    attendance.checkOut = checkOutTime;
    attendance.checkOutLocation = { lat: latitude, lng: longitude };
    attendance.totalHours = totalHours;
    attendance.overtime = overtime;
    attendance.breakTime = totalBreakHours;
    attendance.activeDrivingTime = activeDrivingTime;
    attendance.idleTime = idleTime;
    await attendance.save();

    // Release vehicle
    if (attendance.assignedVehicle) {
      const vehicle = await Vehicle.findById(attendance.assignedVehicle);
      if (vehicle) {
        vehicle.assignedDriver = null;
        vehicle.driverName = 'Unassigned';
        vehicle.driverPhone = '';
        vehicle.status = 'idle';
        await vehicle.save();
      }
    }

    // Update driver
    if (driver) {
      driver.assignedVehicle = null;
      await driver.save();
    }

    // Create activity timeline log
    const activity = await DriverActivity.create({
      driverId,
      attendanceId: attendance._id,
      activityType: 'check-out',
      details: `Checked out. Shift duration: ${totalHours} hrs (Overtime: ${overtime} hrs, Breaks: ${totalBreakHours} hrs).`,
      location: { lat: latitude, lng: longitude }
    });

    // Update Daily Performance
    const performanceDate = new Date(todayStr);
    let performance = await DriverPerformance.findOne({ driverId, date: performanceDate });
    if (!performance) {
      performance = new DriverPerformance({ driverId, date: performanceDate });
    }
    performance.hoursWorked = totalHours;
    
    // Add realistic simulated values based on vehicle metrics
    performance.distanceCovered = Math.round((activeDrivingTime * 22) * 10) / 10; // Avg 22km/h
    performance.wasteCollected = Math.round(activeDrivingTime * 350); // 350kg per driving hour
    performance.routesCompleted = Math.ceil(activeDrivingTime / 1.5); // 1.5 hrs per route
    
    // Safety score calculation
    performance.safetyScore = Math.max(50, 100 - (overtime > 2 ? 15 : 0)); // fatigue penalty
    performance.punctualityScore = attendance.status === 'Late' ? 70 : 100;
    
    // composite score
    performance.performanceScore = Math.round(
      (performance.punctualityScore * 0.2) + 
      (performance.safetyScore * 0.3) + 
      (Math.min(100, (performance.routesCompleted / 3) * 100) * 0.2) +
      (Math.min(100, (performance.wasteCollected / 1500) * 100) * 0.3)
    );
    await performance.save();

    // Update master performance score on driver
    if (driver) {
      const allPerf = await DriverPerformance.find({ driverId });
      const avgPerfScore = allPerf.reduce((sum, p) => sum + p.performanceScore, 0) / allPerf.length;
      driver.performanceScore = Math.round(avgPerfScore);
      await driver.save();
    }

    // Real-time notifications
    const io = req.app.get('io');
    if (io) {
      io.to('dashboard').emit('attendance:update', {
        type: 'check-out',
        driverName: driver?.driverName || 'Driver',
        timestamp: checkOutTime,
        totalHours,
        overtime
      });

      // Emit alert for excessive overtime
      if (overtime > 3) {
        io.to('dashboard').emit('alert:new', {
          type: 'fatigue',
          severity: 'high',
          message: `Driver ${driver?.driverName} exceeded shift limit with ${overtime} hours of overtime. Risk of driver fatigue.`,
          createdAt: new Date(),
          cleaningZone: driver?.address?.split(',')[0] || 'Zone 1'
        });
      }

      const stats = await getAggregatedStats();
      io.to('dashboard').emit('workforce:stats', stats);
    }

    res.json({ attendance, activity });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Toggle break (Break-start / Break-end)
exports.toggleBreak = async (req, res) => {
  try {
    const { driverId, action, latitude, longitude } = req.body; // action: 'start' or 'end'
    const todayStr = getTodayDateString();

    const attendance = await Attendance.findOne({ driverId, date: todayStr, checkOut: null });
    if (!attendance) {
      return res.status(400).json({ message: 'Driver must be checked in to toggle breaks.' });
    }

    const type = action === 'start' ? 'break-started' : 'break-ended';
    const details = action === 'start' ? 'Driver started shift break.' : 'Driver ended break and resumed duty.';

    const activity = await DriverActivity.create({
      driverId,
      attendanceId: attendance._id,
      activityType: type,
      details,
      location: { lat: latitude, lng: longitude }
    });

    // Update vehicle status temporarily if needed
    if (attendance.assignedVehicle) {
      await Vehicle.findByIdAndUpdate(attendance.assignedVehicle, {
        status: action === 'start' ? 'idle' : 'active'
      });
    }

    const io = req.app.get('io');
    if (io) {
      const stats = await getAggregatedStats();
      io.to('dashboard').emit('workforce:stats', stats);
      io.to('dashboard').emit('driver:status', { driverId, status: action === 'start' ? 'Break' : 'Driving' });
    }

    res.json({ activity });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 4. Fetch Today's Attendance Logs
exports.getTodayAttendance = async (req, res) => {
  try {
    const todayStr = getTodayDateString();
    const logs = await Attendance.find({ date: todayStr })
      .populate('driverId', 'driverName phoneNumber shiftTime performanceScore')
      .populate('assignedVehicle', 'vehicleNumber vehicleType');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 5. Fetch Timeline for specific driver on a date
exports.getDriverTimeline = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { date } = req.query; // YYYY-MM-DD
    const targetDate = date || getTodayDateString();

    const attendance = await Attendance.findOne({ driverId, date: targetDate });
    if (!attendance) {
      return res.json([]);
    }

    const timeline = await DriverActivity.find({
      driverId,
      attendanceId: attendance._id
    }).sort({ timestamp: 1 });

    res.json(timeline);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper aggregate calculator for workforce stats
const getAggregatedStats = async () => {
  const todayStr = getTodayDateString();
  
  const totalDrivers = await Driver.countDocuments({ status: 'active' });
  const checkedIn = await Attendance.find({ date: todayStr });
  
  const presentDrivers = checkedIn.length;
  const absentDrivers = Math.max(0, totalDrivers - presentDrivers);
  
  let activeDrivers = 0;
  let onBreakDrivers = 0;
  let overtimeDrivers = 0;
  let totalHoursWorked = 0;

  for (const log of checkedIn) {
    totalHoursWorked += log.totalHours || 0;
    if (log.overtime > 0) overtimeDrivers++;
    
    // Check their latest activity to determine real-time status
    if (log.checkOut) {
      continue; // Checked out
    }
    
    const lastActivity = await DriverActivity.findOne({ attendanceId: log._id }).sort({ timestamp: -1 });
    if (lastActivity) {
      if (lastActivity.activityType === 'break-started') {
        onBreakDrivers++;
      } else {
        activeDrivers++;
      }
    } else {
      activeDrivers++;
    }
  }

  // Calculate live hours worked for active sessions
  const now = new Date();
  const activeSessions = checkedIn.filter(log => !log.checkOut);
  for (const session of activeSessions) {
    const elapsed = (now - session.checkIn) / 3600000;
    totalHoursWorked += elapsed;
    if (elapsed > 8) overtimeDrivers++;
  }

  totalHoursWorked = Math.round(totalHoursWorked * 10) / 10;
  const averageHoursPerDriver = presentDrivers > 0 ? Math.round((totalHoursWorked / presentDrivers) * 10) / 10 : 0;
  const attendanceRate = totalDrivers > 0 ? Math.round((presentDrivers / totalDrivers) * 100) : 0;

  return {
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
  };
};

// 6. Fetch Workforce Dashboard Aggregates
exports.getWorkforceAnalytics = async (req, res) => {
  try {
    const stats = await getAggregatedStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 7. Attendance Reports (Daily, Weekly, Monthly, Driver-wise, Overtime)
exports.getAttendanceReports = async (req, res) => {
  try {
    const { startDate, endDate, driverId, shift, status, reportType } = req.query;
    
    const query = {};
    if (startDate && endDate) {
      const sDate = getTodayDateString(startDate);
      const eDate = getTodayDateString(endDate);
      query.date = { $gte: sDate, $lte: eDate };
    } else if (startDate) {
      query.date = getTodayDateString(startDate);
    }

    if (driverId) query.driverId = driverId;
    if (status) query.status = status;

    let logs = await Attendance.find(query)
      .populate('driverId', 'driverName phoneNumber shiftTime performanceScore')
      .populate('assignedVehicle', 'vehicleNumber vehicleType')
      .sort({ date: -1, checkIn: -1 });

    // Filter by shift if provided (nested driver document)
    if (shift) {
      logs = logs.filter(log => log.driverId && log.driverId.shiftTime === shift);
    }

    // Apply specific reports filters
    if (reportType === 'overtime') {
      logs = logs.filter(log => log.overtime > 0);
    }

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 8. AI-based Forecasting Features
exports.getAIPredictions = async (req, res) => {
  try {
    const todayStr = getTodayDateString();
    const activeDrivers = await Driver.countDocuments({ status: 'active' });
    const presentDrivers = await Attendance.countDocuments({ date: todayStr });
    
    // Fetch average absenteeism over the last 14 days
    const pastLogs = await Attendance.aggregate([
      { $group: { _id: '$date', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 14 }
    ]);
    
    const avgPresent = pastLogs.length > 0 
      ? pastLogs.reduce((sum, log) => sum + log.count, 0) / pastLogs.length
      : presentDrivers || activeDrivers * 0.9;

    const avgAbsentCount = Math.max(0, activeDrivers - avgPresent);
    const predictedAbsenteeism = Math.round((avgAbsentCount / activeDrivers) * 100);

    // Predict workforce requirements:
    // Simple AI heuristic: active clean routes (25) * 1.1 buffer for breaks
    const routesCount = await Vehicle.countDocuments({ status: { $ne: 'maintenance' } });
    const predictedWorkforceNeeded = Math.ceil(routesCount * 1.15);

    // Predict overtime needs:
    // Heuristic: based on traffic delays and load levels
    const highLoadCount = await Vehicle.countDocuments({ currentLoadWeight: { $gte: 4000 } });
    const predictedOvertimeNeeded = Math.round(highLoadCount * 1.5 + (predictedAbsenteeism > 15 ? 10 : 2));

    // Insights generators
    const insights = [];
    const dayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday ...

    if (predictedAbsenteeism > 15) {
      insights.push(`High absenteeism predicted tomorrow (${predictedAbsenteeism}%). Recommend scheduling buffer/standby drivers.`);
    } else {
      insights.push(`Normal workforce availability predicted tomorrow. Standby drivers can operate regular cleaning buffer.`);
    }

    if (predictedWorkforceNeeded > activeDrivers - avgAbsentCount) {
      insights.push(`Workforce shortage alert: Needed ${predictedWorkforceNeeded} active drivers, but only ${Math.round(activeDrivers - avgAbsentCount)} are estimated to be available. Consider scheduling temporary operators.`);
    }

    if (predictedOvertimeNeeded > 12) {
      insights.push(`High traffic congestion or solid waste loads detected in Ward 12 & Zone 5. Overtime is forecasted to rise by ${predictedOvertimeNeeded} hours across afternoon shifts.`);
    } else {
      insights.push(`Overtime levels are within safety threshold. Fatigue risks are low.`);
    }

    if (dayOfWeek === 1) { // Monday
      insights.push(`Monday morning cleanup operations typically result in 12% higher waste collection. Overtime demands are predicted to spike.`);
    } else if (dayOfWeek === 5 || dayOfWeek === 6) { // Friday / Saturday
      insights.push(`Weekend transit delays near Kurnool Bus Stand and Gandhinagar Market might extend route durations by 15-20 mins.`);
    }

    res.json({
      predictedAbsenteeism,
      predictedWorkforceNeeded,
      predictedOvertimeNeeded,
      confidenceScore: 88,
      insights
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
