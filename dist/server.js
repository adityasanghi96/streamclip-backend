"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata"); // REQUIRED FIRST LINE!!!
const data_source_1 = __importDefault(require("./db/data-source"));
const app_1 = __importDefault(require("./app"));
const env_1 = require("./env");
data_source_1.default.initialize()
    .then(() => {
    console.log("Database connected");
    const server = app_1.default.listen(env_1.ENV.PORT, () => {
        console.log("Server running on port " + env_1.ENV.PORT);
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
