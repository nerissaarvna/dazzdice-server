import { Table, Model, Column, DataType, ForeignKey, BelongsTo, HasMany, HasOne } from "sequelize-typescript";


@Table({
  defaultScope: {
    attributes: { exclude: ['createdAt', 'updatedAt'] }
  }
})
export class User extends Model {
  @Column({ primaryKey: true })
  declare id: string;

  @Column
  declare name: string;

  @Column
  declare decorator: number

  @HasMany(() => Match)
  declare matchs: Match[];

  @HasMany(() => Challenge)
  declare challenges: Challenge[];

  @HasOne(() => ChallengeLeaderboard)
  declare challengeLeaderboard: ReturnType<() => ChallengeLeaderboard>;

  @HasOne(() => MatchLeaderboard)
  declare matchLeaderboard: ReturnType<() => MatchLeaderboard>;
}


@Table({
  defaultScope: {
    attributes: { exclude: ['createdAt', 'updatedAt'] }
  }
})
export class Match extends Model {
  @Column({ primaryKey: true })
  declare id: string;

  @ForeignKey(() => User)
  @Column
  declare player1Id: string;

  @ForeignKey(() => User)
  @Column
  declare player2Id: string;

  @BelongsTo(() => User, 'player1Id')
  declare player1: User;

  @BelongsTo(() => User, 'player2Id')
  declare player2: User;

  @Column({ defaultValue: 5 })
  declare round: number;

  @HasMany(() => Question)
  declare questions: Question[];

  @Column({ defaultValue: 0 })
  declare score1: number;

  @Column({ defaultValue: 0 })
  declare score2: number;

  @Column
  declare winner: number;

  declare player1Status: string;

  declare player2Status: string;
}

@Table({
  defaultScope: {
    attributes: { exclude: ['createdAt', 'updatedAt'] }
  }
})
export class MatchLeaderboard extends Model {
  @ForeignKey(() => User)
  @Column({ primaryKey: true })
  declare playerId: string;

  @BelongsTo(() => User, 'playerId')
  declare player: User;

  @Column({ defaultValue: 0 })
  declare wins: number;

  @Column({ defaultValue: 0 })
  declare loses: number;

  @Column({ defaultValue: 0 })
  declare draws: number;

  @Column({ defaultValue: 0 })
  declare plays: number;

  @Column({ defaultValue: 1000 })
  declare rating: number;

  declare rank: number;
}

@Table({
  defaultScope: {
    attributes: { exclude: ['createdAt', 'updatedAt'] }
  }
})
export class Challenge extends Model {
  @Column({ primaryKey: true })
  declare id: string;

  @ForeignKey(() => User)
  @Column
  declare playerId: string;

  @BelongsTo(() => User, 'playerId')
  declare player: User;

  @Column({ defaultValue: 0 })
  declare round: number;

  @HasMany(() => Question)
  declare questions: Question[];

  @Column({ defaultValue: 0 })
  declare score: number

  @HasOne(() => ChallengeLeaderboard)
  declare challengeLeaderboard: ReturnType<() => ChallengeLeaderboard>;

  declare rank: number;
}

@Table({
  defaultScope: {
    attributes: { exclude: ['createdAt', 'updatedAt'] }
  }
})
export class ChallengeLeaderboard extends Model {
  @ForeignKey(() => User)
  @Column({ primaryKey: true })
  declare playerId: string;

  @BelongsTo(() => User, 'playerId')
  declare player: User;

  @ForeignKey(() => Challenge)
  @Column
  declare challengeId: string;

  @BelongsTo(() => Challenge, 'challengeId')
  declare challenge: Challenge;

  @Column({ defaultValue: 0 })
  declare plays: number;

  @Column({ defaultValue: 0 })
  declare round: number;

  @Column({ defaultValue: 0 })
  declare score: number;

  declare rank: number;
}

@Table({
  defaultScope: {
    attributes: { exclude: ['createdAt', 'updatedAt', 'qa2', 'score2'] }
  }
})
export class Question extends Model {
  @ForeignKey(() => Challenge)
  @Column
  declare challengeId: string;

  @BelongsTo(() => Challenge, 'challengeId')
  declare challenge: Challenge;

  @ForeignKey(() => Match)
  @Column
  declare matchId: string;

  @BelongsTo(() => Match, 'matchId')
  declare match: Match;

  @Column
  declare difficulty: number;

  @Column
  declare num1: number;

  @Column
  declare op: string;

  @Column
  declare num2: number;

  @Column
  declare answer: number;

  @Column
  declare score: number;

  @Column
  declare score2: number;

  wrong: number[] = [];
}





