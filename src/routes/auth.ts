import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from 'uuid';
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import pool from "../db";
import { authenticateToken, requireRole, requireAdmin, requireAdminOrModerator } from "../middleware/auth";
import { UserRole, CreateUserRequest, UpdateUserRequest, LoginRequest, LoginResponse, PaginatedUsersResponse } from "../types/user";

dotenv.config();

const router = Router();

/**
 * User Registration with Role Selection
 */
router.post("/register", async (req: Request, res: Response) => {
  const { username, email, password, first_name, last_name, phone_number, date_of_birth, role }: CreateUserRequest = req.body;

  if (!username || !email || !password || !role) {
    return res.status(400).json({ message: "username, email, password, and role are required" });
  }

  // Validate role
  const validRoles: UserRole[] = ['user', 'admin', 'moderator', 'vendor'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid role. Must be one of: user, admin, moderator, vendor" });
  }

  try {
    // Check if email already exists
    const existingEmail = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Check if username already exists
    const existingUser = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `INSERT INTO users (username, email, password, first_name, last_name, phone_number, date_of_birth, role) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, email, role`,
      [username, email, hashedPassword, first_name || null, last_name || null, phone_number || null, date_of_birth || null, role]
    );

    return res.status(201).json({ 
      message: "User registered successfully",
      user: newUser.rows[0]
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * User Login with Improved Concurrent Session Handling
 */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0] as {
      id: number;
      username: string;
      email: string;
      password: string;
      role: UserRole;
      is_logged_in: boolean;
    };

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // If user is already logged in, return a prompt instead of blocking
    if (user.is_logged_in) {
      return res.status(409).json({
        message: "User already logged in on another device. Do you want to continue and logout the other session?",
        action: "confirm_logout",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    }

    // Generate new tokens
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "5m" }
    );

    const refreshToken = uuidv4();
    const accessTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const refreshTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      `UPDATE users 
       SET access_token = $1, access_token_expires_at = $2, refresh_token = $3, refresh_token_expires_at = $4, is_logged_in = TRUE, last_login = NOW()
       WHERE id = $5`,
      [accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, user.id]
    );

    const loginResponse: LoginResponse = {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    };

    return res.json(loginResponse);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * Confirm Logout and Login (Force logout previous session)
 */
router.post("/confirm-logout-login", async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0] as {
      id: number;
      username: string;
      email: string;
      password: string;
      role: UserRole;
      is_logged_in: boolean;
    };

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Force logout previous session and create new session
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "5m" }
    );

    const refreshToken = uuidv4();
    const accessTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const refreshTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      `UPDATE users 
       SET access_token = $1, access_token_expires_at = $2, refresh_token = $3, refresh_token_expires_at = $4, is_logged_in = TRUE, last_login = NOW()
       WHERE id = $5`,
      [accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, user.id]
    );

    const loginResponse: LoginResponse = {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    };

    return res.json({
      ...loginResponse,
      message: "Previous session logged out. New session created."
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * Refresh Token
 */
router.post("/refresh-token", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token is required" });
  }

  try {
    const result = await pool.query(
      "SELECT id, username, email, role, refresh_token_expires_at FROM users WHERE refresh_token = $1 AND refresh_token_expires_at > NOW()",
      [refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: "Invalid or expired refresh token" });
    }

    const user = result.rows[0];

    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "5m" }
    );

    const newRefreshToken = uuidv4();
    const newAccessTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const newRefreshTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      `UPDATE users 
       SET access_token = $1, access_token_expires_at = $2, refresh_token = $3, refresh_token_expires_at = $4 
       WHERE id = $5`,
      [newAccessToken, newAccessTokenExpiresAt, newRefreshToken, newRefreshTokenExpiresAt, user.id]
    );

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * User Logout
 */
router.post("/logout", authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    await pool.query(
      `UPDATE users 
       SET access_token = NULL, access_token_expires_at = NULL, refresh_token = NULL, refresh_token_expires_at = NULL, is_logged_in = FALSE 
       WHERE id = $1`,
      [req.user.id]
    );

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

router.get("/test-protected", authenticateToken, (req: Request, res: Response) => {
  if (req.user) {
    return res.status(200).json({ message: `Welcome, ${req.user.username}! You have access to protected data.` });
  }
  return res.status(401).json({ message: "User not authenticated." });
});

/**
 * Get User Profile
 */
router.get("/profile", authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const userResult = await pool.query(
      "SELECT id, username, email, first_name, last_name, phone_number, date_of_birth, role, created_at, last_login FROM users WHERE id = $1",
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const userProfile = userResult.rows[0];
    return res.status(200).json(userProfile);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * Update User Profile
 */
router.post("/update-profile", authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const { first_name, last_name, phone_number, date_of_birth } = req.body;

    await pool.query(
      `UPDATE users 
       SET first_name = COALESCE($1, first_name), 
           last_name = COALESCE($2, last_name), 
           phone_number = COALESCE($3, phone_number), 
           date_of_birth = COALESCE($4, date_of_birth)
       WHERE id = $5`,
      [first_name || null, last_name || null, phone_number || null, date_of_birth || null, req.user.id]
    );

    return res.status(200).json({ message: "Profile updated successfully." });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

// ========== USER MANAGEMENT CRUD OPERATIONS ==========

/**
 * Get All Users (Admin/Moderator only)
 */
router.get("/users", authenticateToken, requireAdminOrModerator, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT id, username, email, first_name, last_name, phone_number, date_of_birth, role, created_at, last_login, is_logged_in
      FROM users
    `;
    let countQuery = `SELECT COUNT(*) FROM users`;
    const params: any[] = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      const searchCondition = `WHERE username ILIKE $${paramCount} OR email ILIKE $${paramCount} OR first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount}`;
      query += ` ${searchCondition}`;
      countQuery += ` ${searchCondition}`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(Number(limit), offset);

    const [usersResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, search ? [params[0]] : [])
    ]);

    const totalUsers = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalUsers / Number(limit));

    const response: PaginatedUsersResponse = {
      users: usersResult.rows,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalUsers,
        hasNext: Number(page) < totalPages,
        hasPrev: Number(page) > 1
      }
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * Get User by ID (Admin/Moderator only)
 */
router.get("/users/:id", authenticateToken, requireAdminOrModerator, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const userResult = await pool.query(
      "SELECT id, username, email, first_name, last_name, phone_number, date_of_birth, role, created_at, last_login, is_logged_in FROM users WHERE id = $1",
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json(userResult.rows[0]);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * Create User (Admin only)
 */
router.post("/users", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, email, password, first_name, last_name, phone_number, date_of_birth, role }: CreateUserRequest = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: "username, email, password, and role are required" });
    }

    // Validate role
    const validRoles: UserRole[] = ['user', 'admin', 'moderator', 'vendor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be one of: user, admin, moderator, vendor" });
    }

    // Check if email already exists
    const existingEmail = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Check if username already exists
    const existingUser = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `INSERT INTO users (username, email, password, first_name, last_name, phone_number, date_of_birth, role) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, email, first_name, last_name, phone_number, date_of_birth, role, created_at`,
      [username, email, hashedPassword, first_name || null, last_name || null, phone_number || null, date_of_birth || null, role]
    );

    return res.status(201).json({ 
      message: "User created successfully",
      user: newUser.rows[0]
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * Update User (Admin only)
 */
router.put("/users/:id", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, email, password, first_name, last_name, phone_number, date_of_birth, role }: UpdateUserRequest = req.body;

    // Check if user exists
    const existingUser = await pool.query("SELECT id FROM users WHERE id = $1", [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if email is being changed and if it already exists
    if (email) {
      const emailCheck = await pool.query("SELECT id FROM users WHERE email = $1 AND id != $2", [email, id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ message: "Email already exists." });
      }
    }

    // Check if username is being changed and if it already exists
    if (username) {
      const usernameCheck = await pool.query("SELECT id FROM users WHERE username = $1 AND id != $2", [username, id]);
      if (usernameCheck.rows.length > 0) {
        return res.status(409).json({ message: "Username already exists." });
      }
    }

    // Validate role if provided
    if (role) {
      const validRoles: UserRole[] = ['user', 'admin', 'moderator', 'vendor'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be one of: user, admin, moderator, vendor" });
      }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (username) {
      paramCount++;
      updateFields.push(`username = $${paramCount}`);
      values.push(username);
    }
    if (email) {
      paramCount++;
      updateFields.push(`email = $${paramCount}`);
      values.push(email);
    }
    if (password) {
      paramCount++;
      updateFields.push(`password = $${paramCount}`);
      values.push(await bcrypt.hash(password, 10));
    }
    if (first_name !== undefined) {
      paramCount++;
      updateFields.push(`first_name = $${paramCount}`);
      values.push(first_name);
    }
    if (last_name !== undefined) {
      paramCount++;
      updateFields.push(`last_name = $${paramCount}`);
      values.push(last_name);
    }
    if (phone_number !== undefined) {
      paramCount++;
      updateFields.push(`phone_number = $${paramCount}`);
      values.push(phone_number);
    }
    if (date_of_birth !== undefined) {
      paramCount++;
      updateFields.push(`date_of_birth = $${paramCount}`);
      values.push(date_of_birth);
    }
    if (role) {
      paramCount++;
      updateFields.push(`role = $${paramCount}`);
      values.push(role);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No fields to update." });
    }

    paramCount++;
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, username, email, first_name, last_name, phone_number, date_of_birth, role, created_at, updated_at`;

    const result = await pool.query(query, values);

    return res.status(200).json({ 
      message: "User updated successfully",
      user: result.rows[0]
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * Delete User (Admin only)
 */
router.delete("/users/:id", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await pool.query("SELECT id, username FROM users WHERE id = $1", [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    // Prevent admin from deleting themselves
    if (req.user && req.user.id === parseInt(id)) {
      return res.status(400).json({ message: "You cannot delete your own account." });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [id]);

    return res.status(200).json({ 
      message: `User ${existingUser.rows[0].username} deleted successfully`
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

export default router;
