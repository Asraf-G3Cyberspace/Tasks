import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../db";
import { UserRole } from "../types/user";

declare module "express-serve-static-core" {
  interface Request {
    user?: { 
      id: number; 
      username: string; 
      email: string; 
      role: UserRole;
      is_logged_in: boolean 
    };
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
        "SELECT id, username, email, role, access_token_expires_at, is_logged_in FROM users WHERE id = $1 AND access_token = $2 AND access_token_expires_at > NOW()",
        [decoded.id, token]
      );

      if (userResult.rows.length === 0) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }
      const user = userResult.rows[0];
      req.user = user as { id: number; username: string; email: string; role: UserRole; is_logged_in: boolean };
      next();
    } catch (dbErr) {
      console.error((dbErr as Error).message);
      return res.status(500).send("Server error");
    }
  });
};

// Middleware to check user roles
export const requireRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    next();
  };
};

// Middleware to check if user is admin
export const requireAdmin = requireRole(['admin']);

// Middleware to check if user is admin or moderator
export const requireAdminOrModerator = requireRole(['admin', 'moderator']);
