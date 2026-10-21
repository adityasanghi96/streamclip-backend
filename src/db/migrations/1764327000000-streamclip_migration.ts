import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764327000000 implements MigrationInterface {
  name = "StreamclipMigration1764327000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "game" ADD "popularity" integer NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "game" DROP COLUMN "popularity"`);
  }
}
