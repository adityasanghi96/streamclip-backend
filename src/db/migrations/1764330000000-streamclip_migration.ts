import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764330000000 implements MigrationInterface {
  name = "StreamclipMigration1764330000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "username" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")`);
    await queryRunner.query(`ALTER TABLE "users" ADD "passwordHash" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "passwordHash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_users_username"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
  }
}
