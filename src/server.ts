import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import authRoutes from './routes/auth';
import featureRoutes from './routes/features';
import bugRoutes from './routes/bugs';
import versionRoutes from './routes/versions';
import moduleRoutes from './routes/modules';
import userRoutes from './routes/users';
import testRoutes from './routes/tests';
import sessionRoutes from './routes/sessions';
import statisticsRoutes from './routes/statistics';

// Initialize database
import { initDatabase } from './database/init';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? true // Accept any origin in production
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database on startup
initDatabase();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/features', featureRoutes);
app.use('/api/bugs', bugRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/custom-tests', testRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/test-results', testRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Database initialized and ready`);
  console.log(`🔗 API endpoints available at /api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
