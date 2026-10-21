import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Channel } from "./Channel";
import { Game } from "./Game";

@Entity()
export class Clip {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Channel, { eager: true })
  @JoinColumn({ name: "channelId" })
  channel!: Channel;

  @Column()
  channelId!: number; // numeric FK

  @Column()
  provider!: string;

  @Column()
  chatId!: string;

  @Column()
  clipName!: string;

  @Column()
  liveVideoId!: string;

  @Column()
  offsetSeconds!: string;

  @Column()
  clippedBy!: string;

  @Column({ nullable: true })
  thumbnailUrl?: string;

  @Column({ type: "varchar", default: "nightbot" })
  source!: "native" | "nightbot";

  @ManyToOne(() => Game, { nullable: true, eager: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "gameId" })
  game?: Game | null;

  @Column({ type: "int", nullable: true })
  gameId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
