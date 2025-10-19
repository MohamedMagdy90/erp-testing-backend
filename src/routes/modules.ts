import { Router, type Response } from 'express';
import db from '../database/init';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get all modules
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const modules = db.prepare('SELECT * FROM modules WHERE status = ? ORDER BY name').all('active');
    res.json(modules);
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Get single module
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const module = db.prepare('SELECT * FROM modules WHERE module_id = ?').get(req.params.id);

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json(module);
  } catch (error) {
    console.error('Error fetching module:', error);
    res.status(500).json({ error: 'Failed to fetch module' });
  }
});

// Create new module
router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { module_id, name, description, status = 'active' } = req.body;

    const result = db.prepare(`
      INSERT INTO modules (module_id, name, description, status)
      VALUES (?, ?, ?, ?)
    `).run(module_id, name, description, status);

    res.status(201).json({
      success: true,
      module_id,
      message: 'Module created successfully'
    });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ error: 'Failed to create module' });
  }
});

// Update module
router.put('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { name, description, status } = req.body;

    const result = db.prepare(`
      UPDATE modules
      SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE module_id = ?
    `).run(name, description, status, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json({ success: true, message: 'Module updated successfully' });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ error: 'Failed to update module' });
  }
});

// Delete module (soft delete by setting status to inactive)
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare(
      'UPDATE modules SET status = ? WHERE module_id = ?'
    ).run('inactive', req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json({ success: true, message: 'Module deleted successfully' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

export default router;
