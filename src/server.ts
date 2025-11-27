import "reflect-metadata"; // REQUIRED FIRST LINE!!!
import AppDataSource from "./db/data-source";
import app from "./app";
import { ENV } from "./env";

AppDataSource.initialize()
  .then(() => {
    console.log("Database connected");

    const server = app.listen(ENV.PORT, () => {
      console.log("Server running on port " + ENV.PORT);
    });

    // Debug: keep process alive until we verify
    server.on("error", (err) => console.error("Server error:", err));
  })
  .catch((err) => {
    console.error("DB connection failed:", err);
  });

// Debug: catch silent failures
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);
