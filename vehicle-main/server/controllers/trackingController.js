const Tracking = require('../models/Tracking');
const Vehicle = require('../models/Vehicle');

const { processVehiclePosition } = require('../utils/stopDetectionEngine');

exports.getTrackingHistory = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { from, to, limit = 500 } = req.query;

    const query = { vehicleId };
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }

    const tracking = await Tracking.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(tracking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getLatestPositions = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({}, 'vehicleNumber vehicleType driverName status currentLocation speed fuelLevel heading currentStop lastGpsUpdate cleaningZone');
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addTrackingPoint = async (req, res) => {
  try {
    const point = await Tracking.create(req.body);
    const io = req.app.get('io');

    const vehicle = await Vehicle.findById(req.body.vehicleId);
    if (vehicle) {
      vehicle.currentLocation = { lat: req.body.latitude, lng: req.body.longitude };
      vehicle.speed = req.body.speed;
      vehicle.fuelLevel = req.body.fuelLevel;
      vehicle.lastGpsUpdate = new Date();

      await processVehiclePosition({
        vehicle,
        lat: req.body.latitude,
        lng: req.body.longitude,
        speed: req.body.speed,
        timestamp: point.timestamp || new Date(),
        io
      });

      await vehicle.save();
    }

    res.status(201).json(point);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
