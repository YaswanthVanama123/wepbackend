// router.js
const express = require("express");
const router = express.Router();
const {getWorkersNearby} = require("./controller");
const { authenticateToken } = require("./authMiddleware");



// Define your route: /api/getNearbyWorker
router.post("/workers-nearby", authenticateToken, getWorkersNearby);


module.exports = router;
