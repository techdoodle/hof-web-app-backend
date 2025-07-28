import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Match } from '../matches/matches.entity';
import { User } from '../user/user.entity';
import { MatchParticipant } from '../match-participants/match-participants.entity';

@Entity('match_participant_stats')
export class MatchParticipantStats {
  @PrimaryGeneratedColumn('increment', { name: 'match_stats_id' })
  matchStatsId: number;

  @ManyToOne(() => Match, { nullable: false })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'player_id' })
  player: User;

  @ManyToOne(() => MatchParticipant, { nullable: false })
  @JoinColumn({ name: 'match_participant_id' })
  matchParticipant: MatchParticipant;

  // Passing
  @Column({ name: 'total_passing_actions', type: 'int', nullable: true })
  totalPassingActions: number;

  @Column({ name: 'total_complete_passing_actions', type: 'int', nullable: true })
  totalCompletePassingActions: number;

  @Column({ name: 'total_incomplete_passing_actions', type: 'int', nullable: true })
  totalIncompletePassingActions: number;

  @Column({ name: 'total_passing_accuracy', type: 'numeric', precision: 5, scale: 2, nullable: true })
  totalPassingAccuracy: number;

  @Column({ name: 'total_open_play_passing_actions', type: 'int', nullable: true })
  totalOpenPlayPassingActions: number;

  @Column({ name: 'total_open_play_complete_passing_actions', type: 'int', nullable: true })
  totalOpenPlayCompletePassingActions: number;

  @Column({ name: 'total_open_play_incomplete_passing_actions', type: 'int', nullable: true })
  totalOpenPlayIncompletePassingActions: number;

  @Column({ name: 'open_play_passing_accuracy', type: 'numeric', precision: 5, scale: 2, nullable: true })
  openPlayPassingAccuracy: number;

  @Column({ name: 'total_pass', type: 'int', nullable: true })
  totalPass: number;

  @Column({ name: 'total_complete_pass', type: 'int', nullable: true })
  totalCompletePass: number;

  @Column({ name: 'total_incomplete_pass', type: 'int', nullable: true })
  totalIncompletePass: number;

  @Column({ name: 'total_through_ball', type: 'int', nullable: true })
  totalThroughBall: number;

  @Column({ name: 'total_complete_through_ball', type: 'int', nullable: true })
  totalCompleteThroughBall: number;

  @Column({ name: 'total_incomplete_through_ball', type: 'int', nullable: true })
  totalIncompleteThroughBall: number;

  @Column({ name: 'total_long_pass', type: 'int', nullable: true })
  totalLongPass: number;

  @Column({ name: 'total_complete_long_pass', type: 'int', nullable: true })
  totalCompleteLongPass: number;

  @Column({ name: 'total_incomplete_long_pass', type: 'int', nullable: true })
  totalIncompleteLongPass: number;

  @Column({ name: 'total_cross', type: 'int', nullable: true })
  totalCross: number;

  @Column({ name: 'total_complete_cross', type: 'int', nullable: true })
  totalCompleteCross: number;

  @Column({ name: 'total_incomplete_cross', type: 'int', nullable: true })
  totalIncompleteCross: number;

  @Column({ name: 'open_play_complete_pass', type: 'int', nullable: true })
  openPlayCompletePass: number;

  @Column({ name: 'open_play_incomplete_pass', type: 'int', nullable: true })
  openPlayIncompletePass: number;

  @Column({ name: 'open_play_complete_through_ball', type: 'int', nullable: true })
  openPlayCompleteThroughBall: number;

  @Column({ name: 'open_play_incomplete_through_ball', type: 'int', nullable: true })
  openPlayIncompleteThroughBall: number;

  @Column({ name: 'open_play_complete_long_pass', type: 'int', nullable: true })
  openPlayCompleteLongPass: number;

  @Column({ name: 'open_play_incomplete_long_pass', type: 'int', nullable: true })
  openPlayIncompleteLongPass: number;

  @Column({ name: 'open_play_complete_cross', type: 'int', nullable: true })
  openPlayCompleteCross: number;

  @Column({ name: 'open_play_incomplete_cross', type: 'int', nullable: true })
  openPlayIncompleteCross: number;

  // Shooting
  @Column({ name: 'total_shot', type: 'int', nullable: true })
  totalShot: number;

  @Column({ name: 'total_on_target_shot', type: 'int', nullable: true })
  totalOnTargetShot: number;

  @Column({ name: 'total_off_target_shot', type: 'int', nullable: true })
  totalOffTargetShot: number;

  @Column({ name: 'total_blocked_shot_taken', type: 'int', nullable: true })
  totalBlockedShotTaken: number;

  @Column({ name: 'total_other_shot', type: 'int', nullable: true })
  totalOtherShot: number;

  @Column({ name: 'shot_accuracy', type: 'numeric', precision: 5, scale: 2, nullable: true })
  shotAccuracy: number;

  // Attack
  @Column({ name: 'total_goal', type: 'int', nullable: true })
  totalGoal: number;

  @Column({ name: 'total_assist', type: 'int', nullable: true })
  totalAssist: number;

  @Column({ name: 'total_key_pass', type: 'int', nullable: true })
  totalKeyPass: number;

  @Column({ name: 'total_dribble_attempt', type: 'int', nullable: true })
  totalDribbleAttempt: number;

  @Column({ name: 'total_successful_dribble', type: 'int', nullable: true })
  totalSuccessfulDribble: number;

  @Column({ name: 'total_unsuccessful_dribble', type: 'int', nullable: true })
  totalUnsuccessfulDribble: number;

  @Column({ name: 'dribble_success_percent', type: 'numeric', precision: 5, scale: 2, nullable: true })
  dribbleSuccessPercent: number;

  @Column({ name: 'total_offensive_actions', type: 'int', nullable: true })
  totalOffensiveActions: number;

  // Defense
  @Column({ name: 'total_defensive_actions', type: 'int', nullable: true })
  totalDefensiveActions: number;

  @Column({ name: 'tackle_in_possession', type: 'int', nullable: true })
  tackleInPossession: number;

  @Column({ name: 'tackle_oob', type: 'int', nullable: true })
  tackleOob: number;

  @Column({ name: 'tackle_turnover', type: 'int', nullable: true })
  tackleTurnover: number;

  @Column({ name: 'tackle_team_possession', type: 'int', nullable: true })
  tackleTeamPossession: number;

  @Column({ name: 'recovery', type: 'int', nullable: true })
  recovery: number;

  @Column({ name: 'recovery_other', type: 'int', nullable: true })
  recoveryOther: number;

  @Column({ name: 'blocked_shot_defensive', type: 'int', nullable: true })
  blockedShotDefensive: number;

  @Column({ name: 'steal', type: 'int', nullable: true })
  steal: number;

  @Column({ name: 'interception_same_team', type: 'int', nullable: true })
  interceptionSameTeam: number;

  @Column({ name: 'deflection_turnover', type: 'int', nullable: true })
  deflectionTurnover: number;

  @Column({ name: 'deflection_oob', type: 'int', nullable: true })
  deflectionOob: number;

  @Column({ name: 'total_clearance', type: 'int', nullable: true })
  totalClearance: number;

  @Column({ name: 'total_save', type: 'int', nullable: true })
  totalSave: number;

  @Column({ name: 'total_catch', type: 'int', nullable: true })
  totalCatch: number;

  @Column({ name: 'total_punch', type: 'int', nullable: true })
  totalPunch: number;

  @Column({ name: 'total_miscontrol', type: 'int', nullable: true })
  totalMiscontrol: number;

  @Column({ name: 'total_woodwork', type: 'int', nullable: true })
  totalWoodwork: number;

  @Column({ name: 'total_own_goals', type: 'int', nullable: true })
  totalOwnGoals: number;

  // Team stats
  @Column({ name: 'team_black_goals', type: 'int', nullable: true })
  teamBlackGoals: number;

  @Column({ name: 'team_white_goals', type: 'int', nullable: true })
  teamWhiteGoals: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
} 