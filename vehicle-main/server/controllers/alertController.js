const Alert = require('../models/Alert');

exports.getAlerts = async (req, res) => {
  try {
    const { type, severity, acknowledged, limit = 100 } = req.query;
    const query = {};
    if (type) query.type = type;
    if (severity) query.severity = severity;
    if (acknowledged !== undefined) query.acknowledged = acknowledged === 'true';

    const alerts = await Alert.find(query)
      .populate('vehicleId', 'vehicleNumber driverName vehicleType')
      .populate({
        path: 'stopId',
        select: 'durationMinutes startTime endTime status explanation review location'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const unacknowledgedCount = await Alert.countDocuments({ acknowledged: false });

    res.json({ alerts, unacknowledgedCount });
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
      .populate('vehicleId', 'vehicleNumber')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ typeStats: stats, severityStats, recentAlerts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
