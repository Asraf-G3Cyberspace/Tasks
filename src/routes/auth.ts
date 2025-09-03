import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from 'uuid';
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import pool from "../db";

dotenv.config();

const router = Router();

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: number; username: string; email: string; is_logged_in: boolean };
  }
}

// Middleware to verify JWT token
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET as string, async (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    try {
      const userResult = await pool.query(
        "SELECT id, username, email, access_token_expires_at, is_logged_in FROM users WHERE id = $1 AND access_token = $2 AND access_token_expires_at > NOW()",
        [decoded.id, token]
      );

      if (userResult.rows.length === 0) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }
      const user = userResult.rows[0];
      req.user = user as { id: number; username: string; email: string; is_logged_in: boolean };
      next();
    } catch (dbErr) {
      console.error((dbErr as Error).message);
      return res.status(500).send("Server error");
    }
  });
};

/**
 * User Registration
 */
router.post("/register", async (req: Request, res: Response) => {
  const { username, email, password, first_name, last_name, phone_number, date_of_birth } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "username, email and password are required" });
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
      `INSERT INTO users (username, email, password, first_name, last_name, phone_number, date_of_birth) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email`,
      [username, email, hashedPassword, first_name || null, last_name || null, phone_number || null, date_of_birth || null]
    );

    return res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

/**
 * User Login
 * (Login with email instead of username)
 */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

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
      is_logged_in: boolean;
    };

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.is_logged_in) {
      return res.status(409).json({
        message: "This account is already in use. Do you want to log out the other session?",
        action: "force_logout",
      });
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
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

    return res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

router.post("/force-logout", async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    await pool.query(
      `UPDATE users 
       SET access_token = NULL, access_token_expires_at = NULL, refresh_token = NULL, refresh_token_expires_at = NULL, is_logged_in = FALSE 
       WHERE email = $1`,
      [email]
    );
    return res.status(200).json({ message: "Previous session logged out successfully" });
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
      "SELECT id, username, email, refresh_token_expires_at FROM users WHERE refresh_token = $1 AND refresh_token_expires_at > NOW()",
      [refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: "Invalid or expired refresh token" });
    }

    const user = result.rows[0];

    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
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

export default router;
