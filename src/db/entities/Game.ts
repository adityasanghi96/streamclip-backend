import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column()
  name!: string;

  @Column({ type: "varchar", nullable: true })
  imageUrl?: string | null;

  @Column({ type: "int", default: 0 })
  popularity!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
