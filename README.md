# ERP Testing Portal Backend

## Features

### Core Testing Features
- Test session management
- Test results tracking
- Module management
- Version control
- Custom test creation
- User authentication

### Bug Tracking System (Phase 2)
- Complete bug lifecycle management
- File attachments with drag-and-drop
- Comment system for collaboration
- History tracking and audit trail
- Test generation from bugs
- Status workflow management
- Priority and severity classification

## Tech Stack
- Node.js + Express
- SQLite database
- Multer for file uploads
- CORS enabled for cross-origin requests

## Database Tables
- `test_sessions` - Testing session data
- `test_results` - Individual test results
- `test_feedback` - Test feedback and issues
- `modules` - Module management
- `versions` - Version tracking
- `custom_tests` - Custom test cases
- `users` - User authentication
- `bugs` - Bug reports
- `bug_comments` - Bug discussions
- `bug_history` - Change tracking
- `bug_attachments` - File attachments

## API Endpoints

### Bug Tracking Endpoints
- `POST /api/bugs` - Create new bug
- `GET /api/bugs` - List bugs with filters
- `GET /api/bugs/:id` - Get bug details
- `PUT /api/bugs/:id` - Update bug
- `POST /api/bugs/:id/status` - Update bug status
- `POST /api/bugs/:id/comments` - Add comment
- `GET /api/bugs/:id/comments` - Get comments
- `GET /api/bugs/:id/history` - Get history
- `POST /api/bugs/:id/attachments` - Upload files
- `GET /api/bugs/:id/attachments` - Get attachments
- `DELETE /api/bugs/:id/attachments/:id` - Delete attachment
- `POST /api/bugs/:id/create-test` - Generate test from bug
- `GET /api/bugs/:id/tests` - Get linked tests

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3001`

## Deployment on Render.com

### Prerequisites
1. Create a Render account
2. Create a new Web Service
3. Connect this GitHub repository

### Environment Setup

#### Required Render Settings:
1. **Build Command**: `npm install`
2. **Start Command**: `npm start`
3. **Environment**: Node
4. **Plan**: Choose plan with persistent disk

#### Persistent Disk Configuration:
**IMPORTANT**: You need persistent disk for both database and file uploads

1. Add a persistent disk to your Render service:
   - Mount path: `/var/data`
   - Size: At least 1GB (adjust based on expected file uploads)

2. The application automatically detects Render environment:
   ```javascript
   // Database storage
   const dbPath = fs.existsSync('/var/data')
     ? '/var/data/testing_feedback.db'  // Render
     : './testing_feedback.db';          // Local

   // File uploads storage
   const uploadsDir = fs.existsSync('/var/data')
     ? '/var/data/uploads'               // Render
     : './uploads';                       // Local
   ```

#### Environment Variables:
Set these in Render Dashboard:
- `PORT` - (Optional, Render provides this)
- `NODE_ENV` - Set to `production`
- `FRONTEND_URL` - Your frontend URL for CORS

### File Upload Limits
- Max file size: 10MB per file
- Max files per upload: 5
- Allowed types: Images, PDFs, Documents, Videos, Archives

### Database Migrations
The database tables are automatically created on first run. Existing data is preserved.

## Important Notes

### For Production:
1. **Backup Strategy**: Implement regular backups of `/var/data`
2. **File Storage**: Consider migrating to cloud storage (S3) for large-scale deployments
3. **Security**: Add rate limiting and authentication middleware
4. **Monitoring**: Set up logging and monitoring

### File Persistence:
- Files are stored in `/var/data/uploads` on Render
- Database is stored in `/var/data/testing_feedback.db`
- Both require persistent disk to survive deployments

## Support
For issues or questions, please open an issue in this repository.

## License
Proprietary - DNA ERP
