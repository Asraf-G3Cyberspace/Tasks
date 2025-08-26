import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pool from "../db";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ message: "username and password are required" });
  }

  try {
    const existing = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, hashedPassword]);

    return res.status(201).json({ message: "User registered" });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0] as { id: number; username: string; password: string };

    const validPassword = await bcrypt.compare(password ?? "", user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET as string, { expiresIn: "1h" });

    return res.json({ token });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send("Server error");
  }
});

export default router;
