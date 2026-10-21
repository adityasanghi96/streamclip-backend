import { MigrationInterface, QueryRunner } from "typeorm";

export class StreamclipMigration1764323000000 implements MigrationInterface {
    name = "StreamclipMigration1764323000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linked_account" ADD "discordWebhookUrl" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linked_account" DROP COLUMN "discordWebhookUrl"`);
    }
}
