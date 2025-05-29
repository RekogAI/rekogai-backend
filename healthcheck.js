import http from "http";

const options = {
  host: "localhost",
  port: process.env.PORT || 8080, // Changed from 3000 to 8080
  path: "/health",
  timeout: 2000,
  method: "GET",
};

const request = http.request(options, (res) => {
  console.log(`Health check status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on("error", (err) => {
  console.log("Health check failed:", err.message);
  process.exit(1);
});

request.on("timeout", () => {
  console.log("Health check timeout");
  request.destroy();
  process.exit(1);
});

request.end();
