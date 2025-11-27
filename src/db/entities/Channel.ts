import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity()
export class Channel {
  @PrimaryGeneratedColumn()
  id!: number; // internal DB ID

  @Column({ unique: true })
  ytChannelId!: string; // YouTube Channel ID

  @Column()
  name!: string;

  @Column()
  imageUrl!: string;

  @Column({ nullable: true })
  discordWebhookUrl?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
