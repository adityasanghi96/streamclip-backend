import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

@Entity()
export class Channel {
  @PrimaryGeneratedColumn()
  id!: number; // internal DB ID

  @Column({ unique: true })
  ytChannelId!: string; // platform channel id (YouTube, Twitch, …)

  @Column({ type: "varchar", default: "youtube" })
  provider!: string;

  @Column()
  name!: string;

  @Column()
  imageUrl!: string;

  @Column({ nullable: true })
  handle?: string;

  @Column({ nullable: true })
  profileUrl?: string;

  @Column({ type: "varchar", nullable: true })
  discordWebhookUrl?: string | null;

  @ManyToOne(() => User, (user) => user.channels, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ownerId" })
  owner?: User | null;

  @Column({ type: "int", nullable: true })
  ownerId?: number | null;

  @Column({ type: "int", nullable: true })
  followerCount?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
