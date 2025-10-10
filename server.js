import express from 'express';

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Simple hello route
app.get('/', (req, res) => {
  res.send('Hello, world! 👋 Express is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
