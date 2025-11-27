import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764253034863 implements MigrationInterface {
    name = 'StreamclipMigration1764253034863'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clip" ADD "thumbnailUrl" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "thumbnailUrl"`);
    }

}
