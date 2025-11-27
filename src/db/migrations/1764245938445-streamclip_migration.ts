import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764245938445 implements MigrationInterface {
    name = 'StreamclipMigration1764245938445'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "channel" ADD "handle" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "channel" ADD "profileUrl" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "profileUrl"`);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "handle"`);
    }

}
