// ===================== server.js - FIXED VERSION =====================
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');

// -------------------- Load backend .env --------------------
dotenv.config({ path: path.join(__dirname, ".env") });

// -------------------- Initialize Express --------------------
const app = express();

// -------------------- MongoDB Connection --------------------
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 5000;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is undefined. Check backend/.env file.");
  process.exit(1);
}

// Recommended Mongoose settings
mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);

function buildDirectMongoUriFromSrv(srvUri, hostsCsv) {
  if (!srvUri || typeof srvUri !== 'string') return null;
  if (!srvUri.startsWith('mongodb+srv://')) return null;
  if (!hostsCsv || typeof hostsCsv !== 'string' || !hostsCsv.trim()) return null;

  // mongodb+srv://user:pass@cluster0.x.mongodb.net/db?opts
  // => mongodb://user:pass@host1,host2,host3/db?opts&tls=true
  const withoutScheme = srvUri.replace(/^mongodb\+srv:\/\//, '');
  const atIndex = withoutScheme.indexOf('@');
  if (atIndex === -1) return null;

  const creds = withoutScheme.slice(0, atIndex); // user:pass
  const rest = withoutScheme.slice(atIndex + 1); // clusterHost/db?query

  const slashIndex = rest.indexOf('/');
  if (slashIndex === -1) return null;

  const pathAndQuery = rest.slice(slashIndex); // /db?query
  const hosts = hostsCsv.split(',').map(h => h.trim()).filter(Boolean).join(',');
  if (!hosts) return null;

  const hasQuery = pathAndQuery.includes('?');
  const lower = pathAndQuery.toLowerCase();
  const needsAuthSource = !lower.includes('authsource=');
  const uri =
    `mongodb://${creds}@${hosts}${pathAndQuery}` +
    `${hasQuery ? '&' : '?'}tls=true` +
    `${needsAuthSource ? '&authSource=admin' : ''}`;
  return uri;
}

async function connectMongoWithFallback() {
  const options = { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 };
  try {
    await mongoose.connect(MONGO_URI, options);
    return { uri: MONGO_URI, usedFallback: false };
  } catch (err) {
    const msg = String(err?.message || '');
    const isSrvDnsError =
      msg.includes('querySrv') ||
      msg.includes('_mongodb._tcp') ||
      err?.code === 'ECONNREFUSED';

    const directUri = buildDirectMongoUriFromSrv(MONGO_URI, process.env.MONGO_HOSTS);
    if (isSrvDnsError && directUri) {
      console.warn('⚠️  SRV DNS lookup failed. Retrying with direct host seed list...');
      await mongoose.connect(directUri, options);
      return { uri: directUri, usedFallback: true };
    }
    throw err;
  }
}

// Connect to MongoDB first
connectMongoWithFallback()
  .then(({ usedFallback }) => {
    console.log("✅ MongoDB connected successfully");
    if (usedFallback) {
      console.log("ℹ️  Connected using direct host seed list (SRV fallback).");
    }

    // ==================== MIDDLEWARE (CRITICAL ORDER!) ====================

    // ✅ Step 1: CORS - Allow cross-origin requests
    app.use(cors());
    console.log('✅ CORS enabled');

    // ✅ Step 2: Body Parsers - MUST come BEFORE routes!
    // This is CRITICAL - without this, req.body will be undefined
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));
    console.log('✅ Body parsers configured');

    // ✅ Step 3: Request logging (for debugging)
    app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`📡 [${timestamp}] ${req.method} ${req.path}`);
      // Log if body is present (helps debug)
      if (req.body && Object.keys(req.body).length > 0) {
        console.log(`   📦 Body keys: ${Object.keys(req.body).join(', ')}`);
      }
      next();
    });

    // ==================== LOAD AND MOUNT ROUTES ====================
    // ✅ Routes must come AFTER body parsers!

    console.log('📋 Loading routes...');

    const courseRoutes = require('./routes/courseRoutes');
    console.log('   ✅ courseRoutes loaded');
    const assessmentRoutes = require('./routes/assessmentRoutes');
    console.log('   ✅ assessmentRoutes loaded');
    const submissionRoutes = require('./routes/submissionRoutes');
    console.log('   ✅ submissionRoutes loaded');
    const uploadRoutes = require('./routes/uploadRoutes');
    console.log('   ✅ uploadRoutes loaded');
    const automarkRoutes = require('./routes/automarkRoutes');
    console.log('   ✅ automarkRoutes loaded');
    const extractionRoutes = require('./routes/extractionRoutes');
    console.log('   ✅ extractionRoutes loaded');

    // Mount routes
    app.use('/api/courses', courseRoutes);
    console.log('   ✅ courseRoutes mounted');
    app.use('/api/assessments', assessmentRoutes);
    console.log('   ✅ assessmentRoutes mounted');
    app.use('/api/submissions', submissionRoutes);
    console.log('   ✅ submissionRoutes mounted');
    app.use('/api/uploads', uploadRoutes);
    console.log('   ✅ uploadRoutes mounted');
    app.use('/api/automark', automarkRoutes);
    console.log('   ✅ automarkRoutes mounted');
    app.use('/api/extract', extractionRoutes);
    console.log('   ✅ extractionRoutes mounted');

    console.log('✅ Routes mounted:');
    console.log('   - /api/courses/*');
    console.log('   - /api/assessments/*');
    console.log('   - /api/submissions/*');
    console.log('   - /api/uploads/*');
    console.log('   - /api/automark/*');
    console.log('   - /api/extract/*');

    // ==================== STATIC FILES ====================
    // Serve uploaded files (PDFs, etc.)
    const uploadsDir = path.join(__dirname, 'uploads');
    app.use('/uploads', express.static(uploadsDir));
    console.log('✅ Static files served from /uploads');

    // Serve PDF files
    const pdfsDir = path.join(__dirname, 'pdfs');
    app.use('/pdfs', express.static(pdfsDir));
    console.log('✅ PDF files served from /pdfs');

    // Serve favicon.ico to prevent 404 errors
    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // ==================== HEALTH CHECK ====================
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        routes: {
          courses: 'mounted',
          assessments: 'mounted',
          submissions: 'mounted',
          uploads: 'mounted'
        }
      });
    });

    // ==================== API INFO ENDPOINT ====================
    app.get('/api', (req, res) => {
      res.json({
        message: 'InteliMark Assessment API',
        version: '1.0.0',
        endpoints: {
          health: 'GET /health',
          assessments: {
            create: 'POST /api/assessments/create',
            getByCourse: 'GET /api/assessments/course/:courseId',
            getByTeacher: 'GET /api/assessments/teacher/:teacherId',
            updateStatus: 'PATCH /api/assessments/:assessmentId/status'
          },
          courses: {
            getAll: 'GET /api/courses/:teacherId',
            getCLOs: 'GET /api/courses/:courseId/clos',
            uploadSyllabus: 'POST /api/courses/upload-syllabus',
            reExtractCLOs: 'POST /api/courses/:courseId/re-extract-clos'
          }
        }
      });
    });

    // ==================== ERROR HANDLERS (MUST BE LAST!) ====================

    // 404 Handler - Catches all unmatched routes
    app.use((req, res) => {
      console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path,
        method: req.method,
        message: `Cannot ${req.method} ${req.path}`,
        availableRoutes: [
          'POST /api/assessments/create',
          'GET /api/assessments/course/:courseId',
          'GET /api/courses/:teacherId',
          'GET /health'
        ]
      });
    });

    // Global Error Handler - Catches all errors
    app.use((err, req, res, next) => {
      console.error('❌ Server Error:', err);
      console.error('   Path:', req.path);
      console.error('   Method:', req.method);
      console.error('   Stack:', err.stack);

      res.status(err.status || 500).json({
        success: false,
        error: 'Internal server error',
        message: err.message,
        path: req.path,
        // Only show stack trace in development
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });

    // ==================== START SERVER ====================
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(70));
      console.log('🚀 INTELIMARK SERVER STARTED SUCCESSFULLY');
      console.log('='.repeat(70));
      console.log(`📡 Server running at: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
      console.log(`📋 API info: http://localhost:${PORT}/api`);
      console.log('\n📋 AVAILABLE ROUTES:');
      console.log('\n   Assessments:');
      console.log(`   • POST   http://localhost:${PORT}/api/assessments/create`);
      console.log(`   • GET    http://localhost:${PORT}/api/assessments/course/:courseId`);
      console.log(`   • GET    http://localhost:${PORT}/api/assessments/teacher/:teacherId`);
      console.log(`   • PATCH  http://localhost:${PORT}/api/assessments/:assessmentId/status`);
      console.log('\n   Courses:');
      console.log(`   • GET    http://localhost:${PORT}/api/courses/:teacherId`);
      console.log(`   • GET    http://localhost:${PORT}/api/courses/:courseId/clos`);
      console.log(`   • POST   http://localhost:${PORT}/api/courses/upload-syllabus`);
      console.log(`   • POST   http://localhost:${PORT}/api/courses/:courseId/re-extract-clos`);
      console.log('\n   Utilities:');
      console.log(`   • GET    http://localhost:${PORT}/health`);
      console.log(`   • GET    http://localhost:${PORT}/api`);
      console.log('='.repeat(70));
      console.log('✅ All systems ready. Waiting for requests...\n');
    });

  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    console.error("   Full error:", err);
    process.exit(1);
  });

// ==================== CONNECTION EVENT HANDLERS ====================
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected! Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

// ==================== GRACEFUL SHUTDOWN ====================
const gracefulShutdown = async (signal) => {
  console.log(`\n👋 ${signal} received. Shutting down gracefully...`);

  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    console.log('👋 Server shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ==================== UNHANDLED REJECTIONS ====================
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('   Reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('   Stack:', error.stack);
  process.exit(1);
});

module.exports = app;