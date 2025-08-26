import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pool from "../db";

const router = Router();

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

    await pool.query(
      `INSERT INTO users (username, email, password, first_name, last_name, phone_number, date_of_birth) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
    };

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    // update last_login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);

    return res.json({ token });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

export default router;
