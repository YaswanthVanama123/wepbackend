// index.js
require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const router = require("./router");

// Use /api as the base route for your API endpoints
app.use("/api", router);

// A simple health-check route
app.get("/", (req, res) => {
  res.send("getNearbyWorker API is running!");
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
