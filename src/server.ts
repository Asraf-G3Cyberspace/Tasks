import express, { Application } from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app: Application = express();
app.use(express.json());

// Serve static frontend
app.use(express.static(path.resolve("public")));

// Routes
import authRoutes, { authenticateToken } from "./routes/auth";
app.use("/api/auth", authRoutes);

// Example of a protected route
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "This is a protected route", user: req.user });
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
