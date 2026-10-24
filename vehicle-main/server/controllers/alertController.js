const Alert = require('../models/Alert');
const Vehicle = require('../models/Vehicle');

exports.getAlerts = async (req, res) => {
  try {
    const { type, severity, acknowledged, limit = 100 } = req.query;
    const query = {};
    if (type) query.type = type;
    if (severity) query.severity = severity;
    if (acknowledged !== undefined) query.acknowledged = acknowledged === 'true';

    const alerts = await Alert.find(query)
      .populate('vehicleId', 'vehicleNumber driverName vehicleType status currentLocation cleaningZone')
      .populate({
        path: 'stopId',
        select: 'durationMinutes startTime endTime status explanation review location address'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const unacknowledgedCount = await Alert.countDocuments({ acknowledged: false });

    res.json({ alerts, unacknowledgedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate('vehicleId', 'vehicleNumber driverName vehicleType status currentLocation cleaningZone')
      .populate({
        path: 'stopId',
        select: 'durationMinutes startTime endTime status explanation review location address'
      });
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    res.json(alert);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAlert = async (req, res) => {
  try {
    const {
      vehicleId,
      type,
      severity = 'medium',
      message,
      location,
      address,
      stopId,
      stopDuration,
      stopStartTime
    } = req.body;

    let vehicleNumber = req.body.vehicleNumber || '';
    let driverName = req.body.driverName || '';
    let cleaningZone = req.body.cleaningZone || '';
    let alertAddress = address || location?.address || '';
    let lat = location?.lat != null ? Number(location.lat) : null;
    let lng = location?.lng != null ? Number(location.lng) : null;

    if (vehicleId) {
      const vehicle = await Vehicle.findById(vehicleId);
      if (vehicle) {
        if (!vehicleNumber) vehicleNumber = vehicle.vehicleNumber;
        if (!driverName) driverName = vehicle.driverName;
        if (!cleaningZone) cleaningZone = vehicle.cleaningZone;
        if (lat == null && vehicle.currentLocation?.lat != null && !isNaN(vehicle.currentLocation.lat)) {
          lat = vehicle.currentLocation.lat;
          lng = vehicle.currentLocation.lng;
        }
        if (!alertAddress) {
          alertAddress = vehicle.cleaningZone || 'Kurnool Municipal Area';
        }
      }
    }

    const alert = await Alert.create({
      vehicleId,
      vehicleNumber,
      driverName,
      type,
      severity,
      message,
      location: (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) ? { lat, lng, address: alertAddress } : { lat: null, lng: null, address: alertAddress },
      address: alertAddress,
      cleaningZone,
      stopId: stopId || null,
      stopDuration: stopDuration || 0,
      stopStartTime: stopStartTime || null,
      acknowledged: false
    });

    const populatedAlert = await Alert.findById(alert._id)
      .populate('vehicleId', 'vehicleNumber driverName vehicleType status currentLocation cleaningZone')
      .populate('stopId');

    const io = req.app.get('io');
    if (io) {
      io.to('dashboard').emit('alert:new', populatedAlert);
    }

    res.status(201).json(populatedAlert);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.acknowledgeAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { acknowledged: true, acknowledgedBy: req.user._id, resolvedAt: new Date() },
      { new: true }
    );
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    res.json(alert);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAlertStats = async (req, res) => {
  try {
    const stats = await Alert.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const severityStats = await Alert.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);

    const recentAlerts = await Alert.find({ acknowledged: false })
      .populate('vehicleId', 'vehicleNumber driverName currentLocation')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ typeStats: stats, severityStats, recentAlerts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
