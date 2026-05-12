const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors()); // Critical for separate frontend/backend communication

// Default page for the Backend URL
app.get('/', (req, res) => {
    res.send("<h1>Backend Development Branch API is Running</h1><p>Use /health for data.</p>");
});

app.get('/health', (req, res) => {
    res.json({ status: 'UP', uptime: process.uptime(), source: 'Jenkins-ECS-Backend' });
});

app.listen(3000, '0.0.0.0', () => {
    console.log('Backend running on port 3000');
});
