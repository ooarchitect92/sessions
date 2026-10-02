import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CollaborationService } from './collaboration.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ModerateQuestionDto } from './dto/moderate-question.dto';
import { SubmitPollAnswerDto } from './dto/submit-poll-answer.dto';

@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('sessions/:sessionId')
export class CollaborationController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Get('chat-messages')
  listChat(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.collaboration.listChat(principal, sessionId);
  }

  @Post('chat-messages')
  createChat(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateChatMessageDto,
  ) {
    return this.collaboration.createChat(principal, sessionId, body);
  }

  @Get('polls')
  listPolls(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.collaboration.listPolls(principal, sessionId);
  }

  @Post('polls')
  createPoll(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreatePollDto,
  ) {
    return this.collaboration.createPoll(principal, sessionId, body);
  }

  @Post('polls/:pollId/launch')
  launchPoll(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('pollId', new ParseUUIDPipe({ version: '4' })) pollId: string,
  ) {
    return this.collaboration.launchPoll(principal, sessionId, pollId);
  }

  @Post('polls/:pollId/close')
  closePoll(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('pollId', new ParseUUIDPipe({ version: '4' })) pollId: string,
  ) {
    return this.collaboration.closePoll(principal, sessionId, pollId);
  }

  @Post('polls/:pollId/answers')
  answerPoll(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('pollId', new ParseUUIDPipe({ version: '4' })) pollId: string,
    @Body() body: SubmitPollAnswerDto,
  ) {
    return this.collaboration.submitPollAnswer(principal, sessionId, pollId, body);
  }

  @Get('polls/:pollId/results')
  pollResults(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('pollId', new ParseUUIDPipe({ version: '4' })) pollId: string,
  ) {
    return this.collaboration.getPollResults(principal, sessionId, pollId);
  }

  @Get('questions')
  listQuestions(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.collaboration.listQuestions(principal, sessionId);
  }

  @Post('questions')
  createQuestion(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateQuestionDto,
  ) {
    return this.collaboration.createQuestion(principal, sessionId, body);
  }

  @Post('questions/:questionId/vote')
  toggleQuestionVote(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
  ) {
    return this.collaboration.toggleQuestionVote(principal, sessionId, questionId);
  }

  @Patch('questions/:questionId')
  moderateQuestion(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @Body() body: ModerateQuestionDto,
  ) {
    return this.collaboration.moderateQuestion(
      principal,
      sessionId,
      questionId,
      body,
    );
  }
}
