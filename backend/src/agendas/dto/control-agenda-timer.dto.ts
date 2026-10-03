import { IsEnum } from 'class-validator';

export enum AgendaTimerAction {
  START = 'START',
  PAUSE = 'PAUSE',
  RESET = 'RESET',
}

export class ControlAgendaTimerDto {
  @IsEnum(AgendaTimerAction)
  action!: AgendaTimerAction;
}
