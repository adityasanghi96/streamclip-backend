import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764328000000 implements MigrationInterface {
  name = "StreamclipMigration1764328000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clip" ADD "gameId" integer`);
    await queryRunner.query(`
      UPDATE "clip" SET "gameId" = "game"."id"
      FROM "game"
      WHERE "clip"."gameSlug" = "game"."slug"
        AND "clip"."gameSlug" IS NOT NULL
        AND "clip"."gameSlug" <> ''
    `);
    await queryRunner.query(`CREATE INDEX "IDX_clip_gameId" ON "clip" ("gameId")`);
    await queryRunner.query(
      `ALTER TABLE "clip" ADD CONSTRAINT "FK_clip_gameId" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(`DROP INDEX "IDX_clip_gameSlug"`);
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "gameName"`);
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "gameSlug"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clip" ADD "gameSlug" character varying`);
    await queryRunner.query(`ALTER TABLE "clip" ADD "gameName" character varying`);
    await queryRunner.query(`
      UPDATE "clip" SET "gameSlug" = "game"."slug", "gameName" = "game"."name"
      FROM "game"
      WHERE "clip"."gameId" = "game"."id"
    `);
    await queryRunner.query(`CREATE INDEX "IDX_clip_gameSlug" ON "clip" ("gameSlug")`);
    await queryRunner.query(`ALTER TABLE "clip" DROP CONSTRAINT "FK_clip_gameId"`);
    await queryRunner.query(`DROP INDEX "IDX_clip_gameId"`);
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "gameId"`);
  }
}
