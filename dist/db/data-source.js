"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const env_1 = require("../env");
const Clip_1 = require("./entities/Clip");
const Channel_1 = require("./entities/Channel");
exports.default = new typeorm_1.DataSource({
    type: "postgres",
    host: env_1.ENV.PG_HOST,
    port: env_1.ENV.PG_PORT,
    username: env_1.ENV.PG_USERNAME,
    password: env_1.ENV.PG_PASSWORD,
    database: env_1.ENV.PG_DATABASE,
    synchronize: env_1.ENV.PG_SYNC,
    logging: true,
    entities: [Clip_1.Clip, Channel_1.Channel],
    migrations: ["src/db/migrations/*.ts"],
    migrationsTableName: "migrations_streamclip",
});
