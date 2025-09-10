import express, { Application } from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app: Application = express();
app.use(express.json());

// Serve static frontend from React build directory
app.use(express.static(path.join(__dirname, "../../frontend/build")));

// Routes
import authRoutes from "./routes/auth";
import { authenticateToken } from "./middleware/auth";
app.use("/api/auth", authRoutes);

// Example of a protected route (already exists, but good to keep in mind for API calls)
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "This is a protected route", user: req.user });
});

// All other GET requests not handled by previous routes will return the React app
// Use a RegExp that excludes /api paths to avoid interfering with APIs
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/build/index.html"));
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
