import { Router, type Response } from 'express';
import db from '../database/init';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get all features with filters
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    let query = 'SELECT * FROM features WHERE is_deleted = 0';
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

    if (req.query.module_id && req.query.module_id !== 'all') {
      query += ' AND module_id = ?';
      params.push(req.query.module_id);
    }

    if (req.query.version_id && req.query.version_id !== 'all') {
      query += ' AND version_id = ?';
      params.push(req.query.version_id);
    }

    if (req.query.feature_type && req.query.feature_type !== 'all') {
      query += ' AND feature_type = ?';
      params.push(req.query.feature_type);
    }

    if (req.query.risk_level && req.query.risk_level !== 'all') {
      query += ' AND risk_level = ?';
      params.push(req.query.risk_level);
    }

    if (req.query.search) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    const features = db.prepare(query).all(...params);

    // Parse JSON fields
    const parsedFeatures = features.map((feature: any) => ({
      ...feature,
      dependencies: feature.dependencies ? JSON.parse(feature.dependencies) : [],
      dependent_features: feature.dependent_features ? JSON.parse(feature.dependent_features) : [],
      blocking_features: feature.blocking_features ? JSON.parse(feature.blocking_features) : [],
      tags: feature.tags ? JSON.parse(feature.tags) : [],
      api_changes: Boolean(feature.api_changes),
      database_changes: Boolean(feature.database_changes),
      breaking_changes: Boolean(feature.breaking_changes),
      is_active: Boolean(feature.is_active),
      is_deleted: Boolean(feature.is_deleted)
    }));

    res.json(parsedFeatures);
  } catch (error) {
    console.error('Error fetching features:', error);
    res.status(500).json({ error: 'Failed to fetch features' });
  }
});

// Get single feature
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const feature = db.prepare('SELECT * FROM features WHERE feature_id = ?').get(req.params.id);

    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    res.json(feature);
  } catch (error) {
    console.error('Error fetching feature:', error);
    res.status(500).json({ error: 'Failed to fetch feature' });
  }
});

// Create new feature
router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const feature_id = `FEAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const {
      title,
      description,
      release_date,
      version_id,
      module_id,
      status = 'Planned',
      priority = 'P3',
      feature_type = 'New Feature',
      business_impact,
      target_users,
      success_metrics,
      technical_spec,
      dependencies = [],
      api_changes = false,
      database_changes = false,
      breaking_changes = false,
      risk_level = 'Medium',
      risk_mitigation,
      rollback_plan,
      progress_percentage = 0,
      development_start_date,
      development_end_date,
      testing_start_date,
      testing_end_date,
      feature_owner,
      technical_lead,
      qa_lead,
      tags = []
    } = req.body;

    const result = db.prepare(`
      INSERT INTO features (
        feature_id, title, description, release_date, version_id, module_id,
        status, priority, feature_type, business_impact, target_users,
        success_metrics, technical_spec, dependencies, api_changes,
        database_changes, breaking_changes, risk_level, risk_mitigation,
        rollback_plan, progress_percentage, development_start_date,
        development_end_date, testing_start_date, testing_end_date,
        feature_owner, technical_lead, qa_lead, tags, created_by
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      feature_id, title, description, release_date, version_id, module_id,
      status, priority, feature_type, business_impact, target_users,
      success_metrics, technical_spec, JSON.stringify(dependencies),
      api_changes ? 1 : 0, database_changes ? 1 : 0, breaking_changes ? 1 : 0,
      risk_level, risk_mitigation, rollback_plan, progress_percentage,
      development_start_date, development_end_date, testing_start_date,
      testing_end_date, feature_owner, technical_lead, qa_lead,
      JSON.stringify(tags), req.user?.email || 'System'
    );

    res.status(201).json({
      success: true,
      feature_id,
      message: 'Feature created successfully'
    });
  } catch (error) {
    console.error('Error creating feature:', error);
    res.status(500).json({ error: 'Failed to create feature' });
  }
});

// Update feature
router.put('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body;
    const feature_id = req.params.id;

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];

    Object.keys(updates).forEach(key => {
      if (key !== 'feature_id') {
        updateFields.push(`${key} = ?`);

        // Handle JSON fields
        if (['dependencies', 'dependent_features', 'blocking_features', 'tags'].includes(key)) {
          values.push(JSON.stringify(updates[key]));
        } else if (['api_changes', 'database_changes', 'breaking_changes'].includes(key)) {
          values.push(updates[key] ? 1 : 0);
        } else {
          values.push(updates[key]);
        }
      }
    });

    // Add metadata
    updateFields.push('updated_by = ?', 'updated_at = CURRENT_TIMESTAMP');
    values.push(req.user?.email || 'System', feature_id);

    const query = `UPDATE features SET ${updateFields.join(', ')} WHERE feature_id = ?`;
    const result = db.prepare(query).run(...values);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    res.json({ success: true, message: 'Feature updated successfully' });
  } catch (error) {
    console.error('Error updating feature:', error);
    res.status(500).json({ error: 'Failed to update feature' });
  }
});

// Delete feature (soft delete)
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare(
      'UPDATE features SET is_deleted = 1 WHERE feature_id = ?'
    ).run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    res.json({ success: true, message: 'Feature deleted successfully' });
  } catch (error) {
    console.error('Error deleting feature:', error);
    res.status(500).json({ error: 'Failed to delete feature' });
  }
});

// Get feature comments
router.get('/:id/comments', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const comments = db.prepare(
      'SELECT * FROM feature_comments WHERE feature_id = ? ORDER BY created_at DESC'
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
    const { comment_text, is_internal = false } = req.body;

    const result = db.prepare(`
      INSERT INTO feature_comments (feature_id, comment_text, author_id, author_name, is_internal)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      comment_text,
      req.user?.email || 'System',
      req.user?.name || 'System',
      is_internal ? 1 : 0
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

// Get feature attachments
router.get('/:id/attachments', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const attachments = db.prepare(
      'SELECT * FROM feature_attachments WHERE feature_id = ? ORDER BY uploaded_at DESC'
    ).all(req.params.id);

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Get linked tests
router.get('/:id/tests', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const tests = db.prepare(
      'SELECT * FROM feature_tests WHERE feature_id = ?'
    ).all(req.params.id);

    res.json(tests);
  } catch (error) {
    console.error('Error fetching linked tests:', error);
    res.status(500).json({ error: 'Failed to fetch linked tests' });
  }
});

// Link test to feature
router.post('/:id/tests', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { test_id, test_type = 'Integration', is_mandatory = true } = req.body;

    db.prepare(`
      INSERT OR REPLACE INTO feature_tests (feature_id, test_id, test_type, is_mandatory)
      VALUES (?, ?, ?, ?)
    `).run(req.params.id, test_id, test_type, is_mandatory ? 1 : 0);

    res.json({ success: true, message: 'Test linked successfully' });
  } catch (error) {
    console.error('Error linking test:', error);
    res.status(500).json({ error: 'Failed to link test' });
  }
});

// Update test status
router.put('/:id/tests/:testId', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { test_status } = req.body;

    db.prepare(`
      UPDATE feature_tests
      SET test_status = ?, tested_by = ?, tested_at = CURRENT_TIMESTAMP
      WHERE feature_id = ? AND test_id = ?
    `).run(test_status, req.user?.email, req.params.id, req.params.testId);

    res.json({ success: true, message: 'Test status updated successfully' });
  } catch (error) {
    console.error('Error updating test status:', error);
    res.status(500).json({ error: 'Failed to update test status' });
  }
});

// Get feature history
router.get('/:id/history', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const history = db.prepare(
      'SELECT * FROM feature_history WHERE feature_id = ? ORDER BY changed_at DESC'
    ).all(req.params.id);

    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get feature dependencies
router.get('/:id/dependencies', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const dependencies = db.prepare(
      'SELECT * FROM feature_dependencies WHERE feature_id = ? OR depends_on_feature_id = ?'
    ).all(req.params.id, req.params.id);

    res.json(dependencies);
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    res.status(500).json({ error: 'Failed to fetch dependencies' });
  }
});

// Add dependency
router.post('/:id/dependencies', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { depends_on_feature_id, dependency_type = 'blocks', is_critical = false, notes } = req.body;

    const result = db.prepare(`
      INSERT INTO feature_dependencies (feature_id, depends_on_feature_id, dependency_type, is_critical, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, depends_on_feature_id, dependency_type, is_critical ? 1 : 0, notes);

    res.status(201).json({
      success: true,
      dependency_id: result.lastInsertRowid,
      message: 'Dependency added successfully'
    });
  } catch (error) {
    console.error('Error adding dependency:', error);
    res.status(500).json({ error: 'Failed to add dependency' });
  }
});

export default router;
