import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764321000000 implements MigrationInterface {
    name = "StreamclipMigration1764321000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "googleId" character varying NOT NULL, "email" character varying NOT NULL, "name" character varying NOT NULL, "picture" character varying, "googleYoutubeChannels" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_users_googleId" UNIQUE ("googleId"), CONSTRAINT "PK_users" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "channel" ADD "ownerId" integer`);
        await queryRunner.query(`ALTER TABLE "channel" ADD CONSTRAINT "FK_channel_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "channel" DROP CONSTRAINT "FK_channel_owner"`);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "ownerId"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }
}
