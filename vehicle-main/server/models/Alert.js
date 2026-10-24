const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  type: {
    type: String,
    enum: [
      'overspeed',
      'overload',
      'route-deviation',
      'missed-area',
      'delayed-collection',
      'vehicle-breakdown',
      'fuel-low',
      'vehicle-offline',
      'overweight',
      'zone-boundary-breach',
      'maintenance-due',
      'fatigue',
      'prolonged-stop'
    ],
    required: true
  },
  vehicleNumber: { type: String, default: '' },
  driverName: { type: String, default: '' },
  stopDuration: { type: Number, default: 0 },
  stopStartTime: { type: Date, default: null },
  address: { type: String, default: '' },
  stopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleStop',
    default: null
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  message: {
    type: String,
    required: true
  },
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    address: { type: String, default: '' }
  },
  cleaningZone: {
    type: String,
    default: ''
  },
  acknowledged: {
    type: Boolean,
    default: false
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Auto-fill vehicle metadata and latest valid GPS coordinates if omitted
alertSchema.pre('save', async function() {
  if (this.vehicleId && (!this.vehicleNumber || this.location?.lat === undefined || !this.address)) {
    try {
      const Vehicle = mongoose.model('Vehicle');
      const veh = await Vehicle.findById(this.vehicleId).select('vehicleNumber driverName currentLocation cleaningZone');
      if (veh) {
        if (!this.vehicleNumber && veh.vehicleNumber) {
          this.vehicleNumber = veh.vehicleNumber;
        }
        if (!this.driverName && veh.driverName) {
          this.driverName = veh.driverName;
        }
        if (!this.cleaningZone && veh.cleaningZone) {
          this.cleaningZone = veh.cleaningZone;
        }
        const defaultAddress = this.address || veh.cleaningZone || 'Kurnool Municipal Area';
        // Only auto-fill if GPS location was completely omitted (undefined)
        if (this.location?.lat === undefined && veh.currentLocation?.lat != null && !isNaN(veh.currentLocation.lat)) {
          this.location = {
            lat: veh.currentLocation.lat,
            lng: veh.currentLocation.lng,
            address: defaultAddress
          };
        }
        if (!this.address) {
          this.address = defaultAddress;
        }
      }
    } catch (e) {
      // Continue even if lookup fails
    }
  }
});

module.exports = mongoose.model('Alert', alertSchema);
