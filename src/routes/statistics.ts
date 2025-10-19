import { Router, type Response } from 'express';
import db from '../database/init';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get overall statistics
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    // Session statistics
    const totalSessions = db.prepare('SELECT COUNT(*) as count FROM test_sessions').get() as any;
    const activeSessions = db.prepare('SELECT COUNT(*) as count FROM test_sessions WHERE is_active = 1').get() as any;

    // Test statistics
    const totalTests = db.prepare('SELECT COUNT(*) as count FROM custom_tests').get() as any;
    const testResults = db.prepare('SELECT COUNT(*) as count FROM test_results').get() as any;

    // Test status distribution
    const testsByStatus = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM test_results
      GROUP BY status
    `).all();

    // Bug statistics
    const totalBugs = db.prepare('SELECT COUNT(*) as count FROM bugs WHERE is_deleted = 0').get() as any;
    const criticalBugs = db.prepare(
      'SELECT COUNT(*) as count FROM bugs WHERE (priority = ? OR priority = ?) AND is_deleted = 0'
    ).get('Critical', 'P1') as any;

    // Feature statistics
    const totalFeatures = db.prepare('SELECT COUNT(*) as count FROM features WHERE is_deleted = 0').get() as any;
    const releasedFeatures = db.prepare(
      'SELECT COUNT(*) as count FROM features WHERE status = ? AND is_deleted = 0'
    ).get('Released') as any;

    // Recent test activity
    const recentTests = db.prepare(`
      SELECT tr.*, ts.tester_name
      FROM test_results tr
      LEFT JOIN test_sessions ts ON tr.session_id = ts.session_id
      ORDER BY tr.tested_at DESC
      LIMIT 10
    `).all();

    res.json({
      totalSessions: totalSessions.count,
      activeSessions: activeSessions.count,
      totalTests: totalTests.count,
      totalTestResults: testResults.count,
      testsByStatus,
      totalBugs: totalBugs.count,
      criticalBugs: criticalBugs.count,
      totalFeatures: totalFeatures.count,
      releasedFeatures: releasedFeatures.count,
      recentTests
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get module-wise statistics
router.get('/modules', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const moduleStats = db.prepare(`
      SELECT
        m.module_id,
        m.name,
        COUNT(DISTINCT f.feature_id) as feature_count,
        COUNT(DISTINCT b.bug_id) as bug_count,
        COUNT(DISTINCT ct.test_id) as test_count
      FROM modules m
      LEFT JOIN features f ON m.module_id = f.module_id AND f.is_deleted = 0
      LEFT JOIN bugs b ON m.module_id = b.module_id AND b.is_deleted = 0
      LEFT JOIN custom_tests ct ON m.module_id = ct.module_id
      WHERE m.status = 'active'
      GROUP BY m.module_id, m.name
    `).all();

    res.json(moduleStats);
  } catch (error) {
    console.error('Error fetching module statistics:', error);
    res.status(500).json({ error: 'Failed to fetch module statistics' });
  }
});

// Get version-wise statistics
router.get('/versions', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const versionStats = db.prepare(`
      SELECT
        v.version_id,
        v.version_name,
        v.status,
        COUNT(DISTINCT f.feature_id) as feature_count,
        COUNT(DISTINCT b.bug_id) as bug_count,
        COUNT(DISTINCT ts.session_id) as session_count
      FROM versions v
      LEFT JOIN features f ON v.version_id = f.version_id AND f.is_deleted = 0
      LEFT JOIN bugs b ON v.version_id = b.version_id AND b.is_deleted = 0
      LEFT JOIN test_sessions ts ON v.version_id = ts.version_id
      GROUP BY v.version_id, v.version_name, v.status
      ORDER BY v.version_number DESC
    `).all();

    res.json(versionStats);
  } catch (error) {
    console.error('Error fetching version statistics:', error);
    res.status(500).json({ error: 'Failed to fetch version statistics' });
  }
});

// Get user activity statistics (admin only)
router.get('/users', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userStats = db.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        COUNT(DISTINCT ts.session_id) as session_count,
        COUNT(DISTINCT tr.result_id) as test_count,
        COUNT(DISTINCT b.bug_id) as bugs_reported
      FROM users u
      LEFT JOIN test_sessions ts ON u.email = ts.tester_id
      LEFT JOIN test_results tr ON u.email = tr.tested_by
      LEFT JOIN bugs b ON u.email = b.reported_by
      WHERE u.is_active = 1
      GROUP BY u.id, u.name, u.email
    `).all();

    res.json(userStats);
  } catch (error) {
    console.error('Error fetching user statistics:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

export default router;
