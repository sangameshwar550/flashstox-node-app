const http = require("http");

const PORT = process.env.PORT || 8081;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello World from Google Cloud Run!\n");
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
