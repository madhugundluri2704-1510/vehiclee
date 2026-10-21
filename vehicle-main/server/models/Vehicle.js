const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  vehicleType: {
    type: String,
    enum: ['garbage-truck', 'mini-truck', 'auto-tipper', 'compactor', 'road-sweeper', 'water-tanker'],
    required: true
  },
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null
  },
  driverName: {
    type: String,
    required: true,
    trim: true
  },
  driverPhone: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'idle', 'maintenance', 'offline', 'returning'],
    default: 'active'
  },
  cleaningZone: {
    type: String,
    trim: true,
    default: 'Zone 1'
  },
  wardNumber: {
    type: Number,
    min: 1,
    max: 50,
    default: 1
  },
  currentLocation: {
    lat: { type: Number, default: 15.8281 },
    lng: { type: Number, default: 78.0373 }
  },
  fuelLevel: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  speed: {
    type: Number,
    min: 0,
    default: 0
  },
  loadCapacity: {
    type: Number, // kg
    default: 5000
  },
  currentLoadWeight: {
    type: Number, // kg
    default: 0
  },
  wasteType: {
    type: String,
    enum: ['wet', 'dry', 'mixed', 'hazardous', 'construction'],
    default: 'mixed'
  },
  containerType: {
    type: String,
    enum: ['240L-bin', '660L-bin', 'dumpster', 'open-container', 'compactor-bin'],
    default: 'dumpster'
  },
  mileage: {
    type: Number,
    default: 0
  },
  lastMaintenance: {
    type: Date,
    default: Date.now
  },
  nextMaintenanceDue: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 86400000)
  },
  assignedRoute: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    default: null
  },
  heading: {
    type: Number,
    default: 0
  },
  engineTemp: {
    type: Number,
    default: 85
  },
  idleTime: {
    type: Number, // minutes
    default: 0
  },
  registrationYear: {
    type: Number,
    default: 2022
  },
  currentTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    default: null
  },
  currentStop: {
    stopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleStop',
      default: null
    },
    stoppedAt: {
      type: Date,
      default: null
    },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    durationMinutes: {
      type: Number,
      default: 0
    },
    alertTriggered: {
      type: Boolean,
      default: false
    },
    explanationRequired: {
      type: Boolean,
      default: false
    },
    explanationStatus: {
      type: String,
      enum: ['not_required', 'pending_submission', 'submitted', 'approved', 'rejected'],
      default: 'not_required'
    },
    timerStopped: {
      type: Boolean,
      default: false
    },
    timerStoppedAt: {
      type: Date,
      default: null
    }
  },
  lastGpsUpdate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Vehicle', vehicleSchema);
