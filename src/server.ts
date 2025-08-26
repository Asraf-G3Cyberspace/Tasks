import express, { Application } from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app: Application = express();
app.use(express.json());

// Serve static frontend
app.use(express.static(path.resolve("public")));

// Routes
import authRoutes from "./routes/auth";
app.use("/api/auth", authRoutes);

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
