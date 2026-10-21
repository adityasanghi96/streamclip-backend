import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764326000000 implements MigrationInterface {
  name = "StreamclipMigration1764326000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "game" ("id" SERIAL NOT NULL, "slug" character varying NOT NULL, "name" character varying NOT NULL, "imageUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_game_id" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_game_slug" ON "game" ("slug")`);
    await queryRunner.query(`ALTER TABLE "clip" ADD "gameSlug" character varying`);
    await queryRunner.query(`ALTER TABLE "clip" ADD "gameName" character varying`);
    await queryRunner.query(`CREATE INDEX "IDX_clip_gameSlug" ON "clip" ("gameSlug")`);
    await queryRunner.query(`ALTER TABLE "channel" ADD "followerCount" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "followerCount"`);
    await queryRunner.query(`DROP INDEX "IDX_clip_gameSlug"`);
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "gameName"`);
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "gameSlug"`);
    await queryRunner.query(`DROP INDEX "IDX_game_slug"`);
    await queryRunner.query(`DROP TABLE "game"`);
  }
}
