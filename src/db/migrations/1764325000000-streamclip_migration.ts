import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764325000000 implements MigrationInterface {
    name = "StreamclipMigration1764325000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clip" ADD "source" character varying NOT NULL DEFAULT 'nightbot'`);
        await queryRunner.query(`ALTER TABLE "linked_account" ADD "accessToken" character varying`);
        await queryRunner.query(`ALTER TABLE "linked_account" ADD "refreshToken" character varying`);
        await queryRunner.query(`ALTER TABLE "linked_account" ADD "tokenExpiresAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linked_account" DROP COLUMN "tokenExpiresAt"`);
        await queryRunner.query(`ALTER TABLE "linked_account" DROP COLUMN "refreshToken"`);
        await queryRunner.query(`ALTER TABLE "linked_account" DROP COLUMN "accessToken"`);
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "source"`);
    }
}
