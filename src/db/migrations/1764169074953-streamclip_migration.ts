import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764169074953 implements MigrationInterface {
    name = 'StreamclipMigration1764169074953'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "clip" ("id" SERIAL NOT NULL, "provider" character varying NOT NULL, "channelId" character varying NOT NULL, "chatId" character varying NOT NULL, "queryStr" character varying NOT NULL, "liveVideoId" character varying NOT NULL, "timestamp" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f0685dac8d4dd056d7255670b75" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "clip"`);
    }

}
