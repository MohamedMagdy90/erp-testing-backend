import { Router, type Response } from 'express';
import db from '../database/init';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get all versions
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const versions = db.prepare('SELECT * FROM versions ORDER BY version_number DESC').all();
    res.json(versions);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// Get single version
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const version = db.prepare('SELECT * FROM versions WHERE version_id = ?').get(req.params.id);

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(version);
  } catch (error) {
    console.error('Error fetching version:', error);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// Create new version
router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { version_number, version_name, release_date, status = 'planned', description } = req.body;
    const version_id = `v${version_number}`;

    const result = db.prepare(`
      INSERT INTO versions (version_id, version_number, version_name, release_date, status, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(version_id, version_number, version_name, release_date, status, description);

    res.status(201).json({
      success: true,
      version_id,
      message: 'Version created successfully'
    });
  } catch (error) {
    console.error('Error creating version:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// Update version
router.put('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { version_name, release_date, status, description } = req.body;

    const result = db.prepare(`
      UPDATE versions
      SET version_name = ?, release_date = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE version_id = ?
    `).run(version_name, release_date, status, description, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({ success: true, message: 'Version updated successfully' });
  } catch (error) {
    console.error('Error updating version:', error);
    res.status(500).json({ error: 'Failed to update version' });
  }
});

// Delete version
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM versions WHERE version_id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({ success: true, message: 'Version deleted successfully' });
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({ error: 'Failed to delete version' });
  }
});

export default router;
