const express = require("express");
const extractionController = require("../controllers/extractionController");

const router = express.Router();

// Poll extraction job status + logs
router.get("/jobs/:jobId", extractionController.getExtractionJob);

module.exports = router;

