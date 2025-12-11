require('dotenv').config();
const express = require('express');
const cors = require("cors");
const db = require('./config/database');

const documentRoutes = require('./routes/documentRoutes')


const app = express();                    
const PORT = process.env.PORT || 5000;   

app.use(cors());
app.use(express.json());

app.get('/api', (req, res) => {
  res.json({ message: 'Medical Documents API is running' });
});

// health check route 

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT NOW()');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: error.message });
  }
});


app.use('/api/documents', documentRoutes);

app.listen(PORT, () => {                   // CHANGE prompt TO PORT
    console.log(`server is running on port ${PORT}`);
});