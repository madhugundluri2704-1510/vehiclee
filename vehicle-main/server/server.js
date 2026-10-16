require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { connectDB } = require('./config/db');
const { initializeSocket } = require('./socket/socketHandler');
const { seedDatabase } = require('./seed/seedData');

// Import routes
const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const routeRoutes = require('./routes/routeRoutes');
const wasteRoutes = require('./routes/wasteRoutes');
const driverRoutes = require('./routes/driverRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const alertRoutes = require('./routes/alertRoutes');
const reportRoutes = require('./routes/reportRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const driverPerformanceRoutes = require('./routes/driverPerformanceRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const stopRoutes = require('./routes/stopRoutes');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000'
];
if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost') || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

const io = new Server(server, {
  cors: corsOptions
});

app.set('io', io);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/waste', wasteRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/performance', driverPerformanceRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/stops', stopRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'KMC SwachthTrack', timestamp: new Date(), uptime: process.uptime() });
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;

const ensureAdminUser = async () => {
  try {
    const User = require('./models/User');
    const adminExists = await User.findOne({ email: 'admin@kmc.gov.in' });
    if (!adminExists) {
      console.log('👤 Admin user not found. Creating default admin...');
      const bcrypt = require('bcryptjs');
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
      console.log('👤 Default admin user created successfully!');
    } else {
      console.log('👤 Default admin user already exists.');
    }
  } catch (error) {
    console.error('❌ Failed to ensure admin user:', error.message);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    await ensureAdminUser();
    
    // Initialize Socket.IO
    initializeSocket(io);

    server.listen(PORT, () => {
      console.log(`\n🏛️  KMC SwachthTrack Server running on port ${PORT}`);
      console.log(`📡 Socket.IO ready for real-time tracking`);
      console.log(`🌐 API: http://localhost:${PORT}/api`);
      console.log(`❤️  Health: http://localhost:${PORT}/api/health\n`);

      // Seed database asynchronously in the background on first run
      const Vehicle = require('./models/Vehicle');
      Vehicle.countDocuments()
        .then(count => {
          if (count === 0) {
            console.log('🌱 Starting Kurnool Municipal Corporation database seed in the background...');
            return seedDatabase();
          }
        })
        .then(() => {
          console.log('✅ Database seeding completed successfully.');
        })
        .catch(error => {
          console.error('❌ Database seeding failed:', error.message);
        });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
