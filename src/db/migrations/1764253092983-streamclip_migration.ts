import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764253092983 implements MigrationInterface {
    name = 'StreamclipMigration1764253092983'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clip" ALTER COLUMN "thumbnailUrl" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clip" ALTER COLUMN "thumbnailUrl" SET NOT NULL`);
    }

}
