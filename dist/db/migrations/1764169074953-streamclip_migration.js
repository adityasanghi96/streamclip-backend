"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamclipMigration1764169074953 = void 0;
class StreamclipMigration1764169074953 {
    constructor() {
        this.name = 'StreamclipMigration1764169074953';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "clip" ("id" SERIAL NOT NULL, "provider" character varying NOT NULL, "channelId" character varying NOT NULL, "chatId" character varying NOT NULL, "queryStr" character varying NOT NULL, "liveVideoId" character varying NOT NULL, "timestamp" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f0685dac8d4dd056d7255670b75" PRIMARY KEY ("id"))`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE "clip"`);
    }
}
exports.StreamclipMigration1764169074953 = StreamclipMigration1764169074953;
