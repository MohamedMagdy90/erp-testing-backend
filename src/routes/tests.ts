import { Router, type Response } from 'express';
import db from '../database/init';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get all custom tests
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const tests = db.prepare(`
      SELECT ct.*, m.name as module_name
      FROM custom_tests ct
      LEFT JOIN modules m ON ct.module_id = m.module_id
      ORDER BY ct.created_at DESC
    `).all();

    // Parse JSON fields
    const parsedTests = tests.map((test: any) => ({
      ...test,
      steps: test.steps ? JSON.parse(test.steps) : [],
      prerequisites: test.prerequisites ? JSON.parse(test.prerequisites) : []
    }));

    res.json(parsedTests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: 'Failed to fetch tests' });
  }
});

// Get single test
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const test = db.prepare(`
      SELECT ct.*, m.name as module_name
      FROM custom_tests ct
      LEFT JOIN modules m ON ct.module_id = m.module_id
      WHERE ct.test_id = ?
    `).get(req.params.id);

    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    res.json(test);
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({ error: 'Failed to fetch test' });
  }
});

// Create new test
router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const test_id = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const {
      test_name,
      module_id,
      category,
      priority = 'Medium',
      description,
      steps = [],
      expected_result,
      prerequisites = []
    } = req.body;

    const result = db.prepare(`
      INSERT INTO custom_tests (
        test_id, test_name, module_id, category, priority,
        description, steps, expected_result, prerequisites, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      test_id, test_name, module_id, category, priority,
      description, JSON.stringify(steps), expected_result,
      JSON.stringify(prerequisites), req.user?.email || 'System'
    );

    res.status(201).json({
      success: true,
      test_id,
      message: 'Test created successfully'
    });
  } catch (error) {
    console.error('Error creating test:', error);
    res.status(500).json({ error: 'Failed to create test' });
  }
});

// Update test
router.put('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const {
      test_name,
      module_id,
      category,
      priority,
      description,
      steps,
      expected_result,
      prerequisites
    } = req.body;

    const result = db.prepare(`
      UPDATE custom_tests
      SET test_name = ?, module_id = ?, category = ?, priority = ?,
          description = ?, steps = ?, expected_result = ?, prerequisites = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE test_id = ?
    `).run(
      test_name, module_id, category, priority,
      description, JSON.stringify(steps), expected_result,
      JSON.stringify(prerequisites), req.params.id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }

    res.json({ success: true, message: 'Test updated successfully' });
  } catch (error) {
    console.error('Error updating test:', error);
    res.status(500).json({ error: 'Failed to update test' });
  }
});

// Delete test
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM custom_tests WHERE test_id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }

    res.json({ success: true, message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ error: 'Failed to delete test' });
  }
});

export default router;
