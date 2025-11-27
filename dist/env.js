"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.ENV = {
    PG_HOST: process.env.PG_HOST || "localhost",
    PG_PORT: Number(process.env.PG_PORT || 5432),
    PG_USERNAME: process.env.PG_USERNAME || "postgres",
    PG_PASSWORD: process.env.PG_PASSWORD || "",
    PG_DATABASE: process.env.PG_DATABASE || "stream_clip_local",
    PG_SYNC: process.env.PG_TYPEORM_SYNC === "true",
    YT_API_KEY: process.env.YT_API_KEY,
    PORT: Number(process.env.PORT || 7000)
};
