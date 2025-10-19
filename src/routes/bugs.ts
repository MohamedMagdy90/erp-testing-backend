import { Router, type Response } from 'express';
import db from '../database/init';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get all bugs with filters
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    let query = 'SELECT * FROM bugs WHERE 1=1';
    const params: any[] = [];

    // Apply filters
    if (req.query.status && req.query.status !== 'all') {
      query += ' AND status = ?';
      params.push(req.query.status);
    }

    if (req.query.priority && req.query.priority !== 'all') {
      query += ' AND priority = ?';
      params.push(req.query.priority);
    }

    if (req.query.severity && req.query.severity !== 'all') {
      query += ' AND severity = ?';
      params.push(req.query.severity);
    }

    if (req.query.module_id && req.query.module_id !== 'all') {
      query += ' AND module_id = ?';
      params.push(req.query.module_id);
    }

    if (req.query.show_deleted === 'false') {
      query += ' AND is_deleted = 0';
    } else if (req.query.show_deleted === 'true') {
      query += ' AND is_deleted = 1';
    }

    if (req.query.show_rejected === 'false') {
      query += ' AND is_rejected = 0';
    }

    query += ' ORDER BY created_at DESC';

    const bugs = db.prepare(query).all(...params);

    // Parse JSON fields
    const parsedBugs = bugs.map((bug: any) => ({
      ...bug,
      steps_to_reproduce: bug.steps_to_reproduce ? JSON.parse(bug.steps_to_reproduce) : [],
      attachments: bug.attachments ? JSON.parse(bug.attachments) : [],
      is_deleted: Boolean(bug.is_deleted),
      is_rejected: Boolean(bug.is_rejected)
    }));

    res.json(parsedBugs);
  } catch (error) {
    console.error('Error fetching bugs:', error);
    res.status(500).json({ error: 'Failed to fetch bugs' });
  }
});

// Get single bug
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const bug = db.prepare('SELECT * FROM bugs WHERE bug_id = ?').get(req.params.id);

    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    res.json(bug);
  } catch (error) {
    console.error('Error fetching bug:', error);
    res.status(500).json({ error: 'Failed to fetch bug' });
  }
});

// Create new bug
router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const bug_id = `BUG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const {
      title,
      description,
      status = 'New',
      priority = 'Medium',
      severity = 'Medium',
      module_id,
      version_id,
      assigned_to,
      steps_to_reproduce = [],
      expected_behavior,
      actual_behavior,
      environment,
      attachments = []
    } = req.body;

    const result = db.prepare(`
      INSERT INTO bugs (
        bug_id, title, description, status, priority, severity,
        module_id, version_id, assigned_to, reported_by,
        steps_to_reproduce, expected_behavior, actual_behavior,
        environment, attachments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bug_id, title, description, status, priority, severity,
      module_id, version_id, assigned_to, req.user?.email || 'System',
      JSON.stringify(steps_to_reproduce), expected_behavior,
      actual_behavior, environment, JSON.stringify(attachments)
    );

    res.status(201).json({
      success: true,
      bug_id,
      message: 'Bug reported successfully'
    });
  } catch (error) {
    console.error('Error creating bug:', error);
    res.status(500).json({ error: 'Failed to create bug' });
  }
});

// Update bug
router.put('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body;
    const bug_id = req.params.id;

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];

    Object.keys(updates).forEach(key => {
      if (key !== 'bug_id') {
        updateFields.push(`${key} = ?`);

        // Handle JSON fields
        if (['steps_to_reproduce', 'attachments'].includes(key)) {
          values.push(JSON.stringify(updates[key]));
        } else if (['is_deleted', 'is_rejected'].includes(key)) {
          values.push(updates[key] ? 1 : 0);
        } else {
          values.push(updates[key]);
        }
      }
    });

    // Add metadata
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(bug_id);

    const query = `UPDATE bugs SET ${updateFields.join(', ')} WHERE bug_id = ?`;
    const result = db.prepare(query).run(...values);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    res.json({ success: true, message: 'Bug updated successfully' });
  } catch (error) {
    console.error('Error updating bug:', error);
    res.status(500).json({ error: 'Failed to update bug' });
  }
});

// Delete bug (soft delete)
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare(
      'UPDATE bugs SET is_deleted = 1 WHERE bug_id = ?'
    ).run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    res.json({ success: true, message: 'Bug deleted successfully' });
  } catch (error) {
    console.error('Error deleting bug:', error);
    res.status(500).json({ error: 'Failed to delete bug' });
  }
});

// Get bug comments
router.get('/:id/comments', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const comments = db.prepare(
      'SELECT * FROM bug_comments WHERE bug_id = ? ORDER BY created_at DESC'
    ).all(req.params.id);

    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add comment
router.post('/:id/comments', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { comment_text } = req.body;

    const result = db.prepare(`
      INSERT INTO bug_comments (bug_id, comment_text, author_id, author_name)
      VALUES (?, ?, ?, ?)
    `).run(
      req.params.id,
      comment_text,
      req.user?.email || 'System',
      req.user?.name || 'System'
    );

    res.status(201).json({
      success: true,
      comment_id: result.lastInsertRowid,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

export default router;
