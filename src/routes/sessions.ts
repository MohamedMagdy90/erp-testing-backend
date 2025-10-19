import { Router, type Response } from 'express';
import db from '../database/init';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get all sessions
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const sessions = db.prepare(`
      SELECT s.*, v.version_name
      FROM test_sessions s
      LEFT JOIN versions v ON s.version_id = v.version_id
      ORDER BY s.start_time DESC
    `).all();

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get single session with details
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const session = db.prepare(`
      SELECT s.*, v.version_name
      FROM test_sessions s
      LEFT JOIN versions v ON s.version_id = v.version_id
      WHERE s.session_id = ?
    `).get(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get test results for this session
    const results = db.prepare(`
      SELECT * FROM test_results
      WHERE session_id = ?
      ORDER BY tested_at DESC
    `).all(req.params.id);

    res.json({
      session,
      results
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Create new session
router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const session_id = `SESSION-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { version_id } = req.body;

    const result = db.prepare(`
      INSERT INTO test_sessions (session_id, version_id, tester_id, tester_name, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      session_id,
      version_id,
      req.user?.email || 'System',
      req.user?.name || 'System',
      'active'
    );

    res.status(201).json({
      success: true,
      session_id,
      message: 'Session created successfully'
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// End session
router.put('/:id/end', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare(`
      UPDATE test_sessions
      SET status = 'completed', end_time = CURRENT_TIMESTAMP, is_active = 0
      WHERE session_id = ?
    `).run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, message: 'Session ended successfully' });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Add test result to session
router.post('/:id/results', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const {
      test_id,
      test_case_id,
      module_name,
      test_case_title,
      test_name,
      status,
      priority,
      category,
      bugs_found = 0,
      notes
    } = req.body;

    const result = db.prepare(`
      INSERT INTO test_results (
        session_id, test_id, test_case_id, module_name,
        test_case_title, test_name, status, priority,
        category, bugs_found, tested_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, test_id, test_case_id, module_name,
      test_case_title, test_name, status, priority,
      category, bugs_found, req.user?.email || 'System', notes
    );

    res.status(201).json({
      success: true,
      result_id: result.lastInsertRowid,
      message: 'Test result added successfully'
    });
  } catch (error) {
    console.error('Error adding test result:', error);
    res.status(500).json({ error: 'Failed to add test result' });
  }
});

export default router;
