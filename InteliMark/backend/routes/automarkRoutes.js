const express = require("express");
const automarkController = require("../controllers/automarkController");

const router = express.Router();

// Poll job status + logs
router.get("/jobs/:jobId", automarkController.getAutomarkJob);

module.exports = router;

