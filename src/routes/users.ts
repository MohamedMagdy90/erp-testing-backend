import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database/init';
import { authenticateToken, requireAdmin, type AuthRequest } from '../middleware/auth';

const router = Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const users = db.prepare(
      'SELECT id, email, name, role, is_active, created_at FROM users ORDER BY name'
    ).all();

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare(
      'SELECT id, email, name, role, is_active, created_at FROM users WHERE id = ?'
    ).get(req.user?.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get single user
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare(
      'SELECT id, email, name, role, is_active, created_at FROM users WHERE id = ?'
    ).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new user (admin only)
router.post('/', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role = 'tester' } = req.body;

    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (email, password, name, role)
      VALUES (?, ?, ?, ?)
    `).run(email, hashedPassword, name, role);

    res.status(201).json({
      success: true,
      user_id: result.lastInsertRowid,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { name, email, role, is_active, password } = req.body;

    // Only admins can update other users
    if (req.user?.id !== Number.parseInt(userId) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }

    if (role !== undefined && req.user?.role === 'admin') {
      updates.push('role = ?');
      values.push(role);
    }

    if (is_active !== undefined && req.user?.role === 'admin') {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    const result = db.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).run(...values);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare(
      'UPDATE users SET is_active = 0 WHERE id = ?'
    ).run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
