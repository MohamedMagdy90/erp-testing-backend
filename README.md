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
1. Create a Render account at https://render.com
2. Fork or connect this GitHub repository

### Render Deployment Guide

#### Step 1: Create Web Service
1. Go to Render Dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure as follows:

#### Step 2: Basic Configuration
- **Name**: `erp-testing-backend` (or your choice)
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free tier works, but consider paid for persistent disk

#### Step 3: Persistent Disk Setup (OPTIONAL but RECOMMENDED)
**Note**: The app now works WITHOUT persistent disk but data won't persist across deployments

If you want persistent data storage:
1. In your Render service settings, go to "Disks"
2. Click "Add Disk"
3. Configure:
   - **Name**: `data`
   - **Mount Path**: `/var/data`
   - **Size**: 1GB minimum (adjust as needed)
4. Save and redeploy

Without persistent disk:
- Database and uploads are stored locally
- Data is lost on each deployment
- Suitable for testing only

#### Step 4: Environment Variables
In Render Dashboard → Environment:
- `NODE_ENV` = `production`
- `FRONTEND_URL` = Your frontend URL (e.g., `https://your-app.netlify.app`)
- `PORT` = (Leave empty, Render provides this automatically)

#### Step 5: Deploy
1. Render will automatically deploy when you push to GitHub
2. Check deployment logs for any errors
3. Visit the health endpoint: `https://your-service.onrender.com/health`

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

## Troubleshooting Render Deployment

### Common Issues and Solutions

1. **Deployment fails with "Cause of failure could not be determined"**
   - Check the health endpoint once deployed: `/health`
   - Review logs in Render Dashboard
   - Ensure Node version is >=18.0.0

2. **Database not persisting**
   - You need to configure persistent disk (see Step 3 above)
   - Check logs for "Using local database" warning
   - Without persistent disk, data resets on each deployment

3. **File uploads not working**
   - Check if persistent disk is configured
   - Verify write permissions in logs
   - Look for "Using local uploads directory" in logs

4. **CORS errors from frontend**
   - Set `FRONTEND_URL` environment variable correctly
   - Include protocol (https://) in the URL
   - Don't add trailing slash

### Health Check
Once deployed, verify your service is running:
```
curl https://your-service.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-...",
  "environment": "production",
  "database": "connected",
  "uploads": "available"
}
```

### Monitoring
- Render provides logs in the Dashboard
- Use the `/health` endpoint for monitoring
- Check "Events" tab for deployment history

## Development vs Production

| Feature | Development | Production (without disk) | Production (with disk) |
|---------|-------------|---------------------------|------------------------|
| Database | Local file | Memory/temp | Persistent at `/var/data` |
| Uploads | Local folder | Memory/temp | Persistent at `/var/data/uploads` |
| Data persistence | Until deleted | Lost on deploy | Permanent |
| Performance | Good | Good | Best |
| Cost | Free | Free | Paid (for disk) |

## Support
For issues or questions, please open an issue in this repository.

## License
Proprietary - DNA ERP
