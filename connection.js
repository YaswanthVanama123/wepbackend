const { Client } = require("pg");

const client = new Client({
  host: "clicksolver-db.cj4u8o8yoet2.ap-south-1.rds.amazonaws.com", // RDS endpoint
  user: "postgres",
  port: 5432,
  password: "Yaswanth123", // Use your RDS password
  database: "clicksolver",
  ssl: {
    rejectUnauthorized: false, // For secure connection; set to 'true' if you have a valid CA certificate
  },
});

client
  .connect()
  .then(() => console.log("Connected to Amazon RDS PostgreSQL database"))
  .catch((err) => console.error("PostgreSQL connection error", err));

module.exports = client;

// const { Client } = require("pg");

// const client = new Client({
//   host: "db", // Use 'db' as the hostname, which is the service name in docker-compose.yml
//   user: "postgres",
//   port: 5432,
//   password: "Yaswanth@123",
//   database: "clicksolver",
// });

// client
//   .connect()
//   .then(() => console.log("Connected to PostgreSQL database docker"))
//   .catch((err) => console.error("PostgreSQL connection error", err));

// module.exports = client;
