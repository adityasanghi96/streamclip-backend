import "reflect-metadata";
import { DataSource } from "typeorm";
import { ENV } from "../env";
import { Clip } from "./entities/Clip";
import { Channel } from "./entities/Channel";

export default new DataSource({
  type: "postgres",
  host: ENV.PG_HOST,
  port: ENV.PG_PORT,
  username: ENV.PG_USERNAME,
  password: ENV.PG_PASSWORD,
  database: ENV.PG_DATABASE,
  synchronize: ENV.PG_SYNC,
  logging: true,
  entities: [Clip, Channel],
  migrations: ["src/db/migrations/*.ts"],
  migrationsTableName: "migrations_streamclip",
});
