// router.js
const express = require("express");
const router = express.Router();
const {getWorkersNearby} = require("./controller");



// Define your route: /api/getNearbyWorker
router.get("/getNearbyWorker", getWorkersNearby);


module.exports = router;
