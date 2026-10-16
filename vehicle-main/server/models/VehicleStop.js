const mongoose = require('mongoose');

const vehicleStopSchema = new mongoose.Schema({
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    index: true
  },
  vehicleNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null
  },
  driverName: {
    type: String,
    default: 'Unassigned',
    trim: true
  },
  driverPhone: {
    type: String,
    default: '',
    trim: true
  },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: 'Kurnool Municipal Area' }
  },
  cleaningZone: {
    type: String,
    default: 'Zone 1'
  },
  wardNumber: {
    type: Number,
    default: 1
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  endTime: {
    type: Date,
    default: null
  },
  durationMinutes: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active',
    index: true
  },
  alertTriggered: {
    type: Boolean,
    default: false,
    index: true
  },
  alertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alert',
    default: null
  },
  explanation: {
    reason: {
      type: String,
      enum: ['garbage collection', 'traffic', 'vehicle breakdown', 'fuel refill', 'maintenance', 'other', null],
      default: null
    },
    details: {
      type: String,
      default: '',
      trim: true
    },
    submittedAt: {
      type: Date,
      default: null
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    driverName: {
      type: String,
      default: ''
    }
  },
  review: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedByName: {
      type: String,
      default: ''
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    remarks: {
      type: String,
      default: '',
      trim: true
    }
  }
}, {
  timestamps: true
});

vehicleStopSchema.index({ vehicleId: 1, startTime: -1 });

module.exports = mongoose.model('VehicleStop', vehicleStopSchema);
