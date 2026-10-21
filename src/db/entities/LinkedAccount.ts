import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { User } from "./User";

export type LinkedProvider = "youtube" | "twitch" | "kick";

@Entity({ name: "linked_account" })
@Unique("UQ_linked_account_provider_external", ["provider", "externalId"])
export class LinkedAccount {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, (user) => user.linkedAccounts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "int" })
  userId!: number;

  @Column({ type: "varchar" })
  provider!: LinkedProvider;

  @Column({ type: "varchar" })
  externalId!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", nullable: true })
  handle?: string | null;

  @Column({ type: "varchar", nullable: true })
  imageUrl?: string | null;

  @Column({ type: "varchar", nullable: true })
  profileUrl?: string | null;

  @Column({ type: "varchar", nullable: true })
  discordWebhookUrl?: string | null;

  @Column({ type: "varchar", nullable: true })
  accessToken?: string | null;

  @Column({ type: "varchar", nullable: true })
  refreshToken?: string | null;

  @Column({ type: "timestamp", nullable: true })
  tokenExpiresAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
