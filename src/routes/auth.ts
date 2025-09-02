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
    user?: { id: number; username: string; email: string };
  }
}

// Middleware to verify JWT token
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET as string, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user as { id: number; username: string; email: string };
    next();
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

    const accessToken = jwt.sign(
      { id: newUser.rows[0].id, username, email },
      process.env.JWT_SECRET as string,
      { expiresIn: "15m" }
    );

    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const deviceInfo = req.headers["user-agent"];
    const ipAddress = req.ip;

    await pool.query(
      "INSERT INTO user_sessions (user_id, refresh_token, device_info, ip_address, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [newUser.rows[0].id, refreshToken, deviceInfo, ipAddress, expiresAt]
    );

    return res.status(201).json({ message: "User registered successfully", accessToken, refreshToken });
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
    };

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "15m" }
    );

    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const deviceInfo = req.headers["user-agent"];
    const ipAddress = req.ip;

    await pool.query(
      "INSERT INTO user_sessions (user_id, refresh_token, device_info, ip_address, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [user.id, refreshToken, deviceInfo, ipAddress, expiresAt]
    );

    // update last_login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);

    return res.json({ accessToken, refreshToken });
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
      "SELECT * FROM user_sessions WHERE refresh_token = $1 AND expires_at > NOW()",
      [refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: "Invalid or expired refresh token" });
    }

    const session = result.rows[0];

    // Fetch user details to create a new access token
    const userResult = await pool.query("SELECT id, username, email FROM users WHERE id = $1", [session.user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const user = userResult.rows[0];

    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "15m" }
    );

    // Optionally, rotate refresh token (issue a new one and invalidate the old one)
    const newRefreshToken = uuidv4();
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      "UPDATE user_sessions SET refresh_token = $1, expires_at = $2 WHERE id = $3",
      [newRefreshToken, newExpiresAt, session.id]
    );

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

export default router;
