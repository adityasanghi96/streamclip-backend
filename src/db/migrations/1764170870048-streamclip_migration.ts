import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764170870048 implements MigrationInterface {
    name = 'StreamclipMigration1764170870048'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "channel" ("id" SERIAL NOT NULL, "ytChannelId" character varying NOT NULL, "name" character varying NOT NULL, "imageUrl" character varying NOT NULL, "discordWebhookUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b75ca3b2e8d31938657a04e744e" UNIQUE ("ytChannelId"), CONSTRAINT "PK_590f33ee6ee7d76437acf362e39" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "queryStr"`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "timestamp"`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "clipName" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "offsetSeconds" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "clippedBy" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "channelId"`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "channelId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "clip" ADD CONSTRAINT "FK_d8360ca691e303434546bc86166" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clip" DROP CONSTRAINT "FK_d8360ca691e303434546bc86166"`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "channelId"`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "channelId" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "clippedBy"`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "offsetSeconds"`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "clipName"`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "timestamp" character varying`);
        await queryRunner.query(`ALTER TABLE "clip" ADD "queryStr" character varying NOT NULL`);
        await queryRunner.query(`DROP TABLE "channel"`);
    }

}
