import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764246118081 implements MigrationInterface {
    name = 'StreamclipMigration1764246118081'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "channel" ADD "handle" character varying`);
        await queryRunner.query(`ALTER TABLE "channel" ADD "profileUrl" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "profileUrl"`);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "handle"`);
    }

}
