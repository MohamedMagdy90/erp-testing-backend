# ERP Testing Portal Backend

A Node.js/Express backend API for the DNA ERP Testing Portal with SQLite database.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with role-based access
- **Feature Management**: Complete CRUD operations for features with dependencies
- **Bug Tracking**: Bug reporting and management system
- **Test Management**: Custom test creation and execution tracking
- **Version Control**: Version and module management
- **Real-time Statistics**: Dashboard analytics and reporting

## 📋 Prerequisites

- Node.js 18+ or Bun runtime
- SQLite3

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/MohamedMagdy90/erp-testing-backend.git
cd erp-testing-backend
```

2. Install dependencies:
```bash
bun install
# or
npm install
```

3. Create a `.env` file:
```env
PORT=3001
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=production
DATABASE_PATH=./data/erp_testing.db
```

## 🏃‍♂️ Running the Application

### Development:
```bash
bun run dev
# or
npm run dev
```

### Production:
```bash
bun run start
# or
npm start
```

## 🗄️ Database

The application uses SQLite database with automatic initialization. **Existing data is preserved** during initialization.

### Default Credentials:
- **Email**: admin@dnaerp.com
- **Password**: admin123

⚠️ **Important**: Change the admin password after first login!

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/verify` - Verify token
- `POST /api/auth/logout` - Logout

### Features
- `GET /api/features` - Get all features
- `GET /api/features/:id` - Get single feature
- `POST /api/features` - Create feature
- `PUT /api/features/:id` - Update feature
- `DELETE /api/features/:id` - Delete feature (soft delete)
- `GET /api/features/:id/comments` - Get feature comments
- `POST /api/features/:id/comments` - Add comment
- `GET /api/features/:id/dependencies` - Get dependencies
- `POST /api/features/:id/dependencies` - Add dependency

### Bugs
- `GET /api/bugs` - Get all bugs
- `GET /api/bugs/:id` - Get single bug
- `POST /api/bugs` - Create bug report
- `PUT /api/bugs/:id` - Update bug
- `DELETE /api/bugs/:id` - Delete bug (soft delete)

### Tests
- `GET /api/custom-tests` - Get all tests
- `GET /api/custom-tests/:id` - Get single test
- `POST /api/custom-tests` - Create test
- `PUT /api/custom-tests/:id` - Update test
- `DELETE /api/custom-tests/:id` - Delete test

### Versions & Modules
- `GET /api/versions` - Get all versions
- `GET /api/modules` - Get all modules
- `GET /api/users` - Get all users (admin only)

### Statistics
- `GET /api/statistics` - Get dashboard statistics
- `GET /api/statistics/modules` - Module-wise statistics
- `GET /api/statistics/versions` - Version-wise statistics

## 🚀 Deployment on Render

1. Fork/Clone this repository to your GitHub account

2. Create a new Web Service on Render:
   - Connect your GitHub repository
   - Choose "Node" as the environment
   - Set build command: `bun install` or `npm install`
   - Set start command: `bun run start` or `npm start`

3. Add environment variables:
   ```
   JWT_SECRET=your-secure-secret-key
   NODE_ENV=production
   ```

4. Deploy!

## 🔒 Security

- JWT tokens for authentication
- Password hashing with bcrypt
- SQL injection prevention with parameterized queries
- CORS configuration for specific origins
- Input validation and sanitization

## 📊 Data Preservation

The backend is designed to **preserve all existing data**:
- Tables are created only if they don't exist
- Sample data is inserted only if tables are empty
- All operations use `CREATE TABLE IF NOT EXISTS`
- Soft deletes for data preservation

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 💡 Support

For support, email support@dnaerp.com or open an issue in the repository.

## 🔄 Version History

- **v1.0.0** - Initial release with feature management system
- Includes bug tracking, test management, and analytics
- Full authentication and authorization system
- SQLite database with data preservation
