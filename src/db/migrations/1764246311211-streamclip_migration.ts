import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764246311211 implements MigrationInterface {
    name = 'StreamclipMigration1764246311211'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "channel" ("id" SERIAL NOT NULL, "ytChannelId" character varying NOT NULL, "name" character varying NOT NULL, "imageUrl" character varying NOT NULL, "handle" character varying, "profileUrl" character varying, "discordWebhookUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b75ca3b2e8d31938657a04e744e" UNIQUE ("ytChannelId"), CONSTRAINT "PK_590f33ee6ee7d76437acf362e39" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "clip" ("id" SERIAL NOT NULL, "channelId" integer NOT NULL, "provider" character varying NOT NULL, "chatId" character varying NOT NULL, "clipName" character varying NOT NULL, "liveVideoId" character varying NOT NULL, "offsetSeconds" character varying NOT NULL, "clippedBy" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f0685dac8d4dd056d7255670b75" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "clip" ADD CONSTRAINT "FK_d8360ca691e303434546bc86166" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clip" DROP CONSTRAINT "FK_d8360ca691e303434546bc86166"`);
        await queryRunner.query(`DROP TABLE "clip"`);
        await queryRunner.query(`DROP TABLE "channel"`);
    }

}
