const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/database");

const router = express.Router();

//Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed!"), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, //10MB limit
});

//UPLOAD - POST /api/documents/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { originalname, filename, size, path: filepath } = req.file;
    const { title } = req.body;
    const result = await db.query(
      "INSERT INTO documents (filename, filepath, filesize, title) VALUES ($1, $2, $3, $4) RETURNING *",
      [originalname, filepath, size, title || originalname]
    );

    res.status(201).json({
      message: "File uploaded successfully",
      document: result.rows[0],
    });
  } catch (error) {
    //Delete file if database insert fails
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

//LIST ALL - GET /api/documents
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM documents ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//DOWNLOAD - GET /api/documents/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM documents WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const document = result.rows[0];
    const filepath = path.join(__dirname, "../../", document.filepath);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    //Set headers to display in browser instead of download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="' + document.filename + '"'
    );

    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//DELETE - DELETE /api/documents/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM documents WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const document = result.rows[0];
    const filepath = path.join(__dirname, "../../", document.filepath);

    //Delete file from disk
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    //Delete from database
    await db.query("DELETE FROM documents WHERE id = $1", [id]);

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
