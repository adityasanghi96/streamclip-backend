import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764324000000 implements MigrationInterface {
    name = "StreamclipMigration1764324000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "channel" ADD "provider" character varying NOT NULL DEFAULT 'youtube'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "provider"`);
    }
}
