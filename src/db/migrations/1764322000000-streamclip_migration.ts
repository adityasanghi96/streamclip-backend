import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764322000000 implements MigrationInterface {
    name = "StreamclipMigration1764322000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "linked_account" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "provider" character varying NOT NULL, "externalId" character varying NOT NULL, "name" character varying NOT NULL, "handle" character varying, "imageUrl" character varying, "profileUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_linked_account_provider_external" UNIQUE ("provider", "externalId"), CONSTRAINT "PK_linked_account" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "linked_account" ADD CONSTRAINT "FK_linked_account_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linked_account" DROP CONSTRAINT "FK_linked_account_user"`);
        await queryRunner.query(`DROP TABLE "linked_account"`);
    }
}
