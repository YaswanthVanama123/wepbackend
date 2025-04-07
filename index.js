// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();
const port = process.env.PORT || 3000;
const router = require("./router");

// --------------------
// Middleware
// --------------------
app.use(helmet()); // Security headers
app.use(morgan("tiny")); // Request logging

// Handle CORS for React web + React Native CLI app
const allowedOrigins = [
  "https://clicksolver.com", // React web frontend (hosted domain)
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------
// Routes
// --------------------
app.use("/api", router);

app.get("/", (req, res) => {
  res.send("✅ ClickSolver API is running in production mode.");
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Internal Server Error:", err);
  res.status(500).json({ message: "Internal server error" });
});

// --------------------
// Start Server
// --------------------
app.listen(port, () => {
  console.log(`🚀 ClickSolver backend running on port ${port}`);
});
