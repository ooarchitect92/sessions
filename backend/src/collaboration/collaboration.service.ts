import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ChatChannel,
  PollStatus,
  PollType,
  Prisma,
  QuestionStatus,
  SessionKind,
  SessionStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from "../common/auth/principal";
import { TenantDatabaseService } from "../database/tenant-database.service";
import { RealtimeEventsService } from "../infrastructure/realtime-events.service";
import { OutboxService } from "../outbox/outbox.service";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { CreatePollDto } from "./dto/create-poll.dto";
import { CreateQuestionDto } from "./dto/create-question.dto";
import { ModerateQuestionDto } from "./dto/moderate-question.dto";
import { SendReactionDto } from "./dto/send-reaction.dto";
import { SetHandRaiseDto } from "./dto/set-hand-raise.dto";
import { SubmitPollAnswerDto } from "./dto/submit-poll-answer.dto";

const ACTIVE_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.DRAFT,
  SessionStatus.SCHEDULED,
  SessionStatus.LIVE,
];

const CHOICE_POLL_TYPES: PollType[] = [
  PollType.SINGLE_CHOICE,
  PollType.MULTIPLE_CHOICE,
  PollType.NPS,
];
const SINGLE_ANSWER_POLL_TYPES: PollType[] = [
  PollType.SINGLE_CHOICE,
  PollType.NPS,
];
const TEXT_RESPONSE_POLL_TYPES: PollType[] = [
  PollType.OPEN_TEXT,
  PollType.WORD_CLOUD,
];
const VOTABLE_QUESTION_STATUSES: QuestionStatus[] = [
  QuestionStatus.APPROVED,
  QuestionStatus.ANSWERED,
];

@Injectable()
export class CollaborationService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async listChat(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const host = hasAnyRole(principal, HOST_ROLES);
      return transaction.chatMessage.findMany({
        where: {
          sessionId,
          deletedAt: null,
          OR: [
            { channel: ChatChannel.EVERYONE },
            ...(host ? [{ channel: ChatChannel.HOSTS }] : []),
            {
              channel: ChatChannel.PRIVATE,
              OR: [
                { authorUserId: principal.userId },
                { recipientUserId: principal.userId },
              ],
            },
          ],
        },
        include: {
          author: { select: { displayName: true, avatarUrl: true } },
          recipient: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
    });
  }

  async createChat(
    principal: Principal,
    sessionId: string,
    input: CreateChatMessageDto,
  ) {
    if (
      input.channel === ChatChannel.HOSTS &&
      !hasAnyRole(principal, HOST_ROLES)
    ) {
      throw new ForbiddenException(
        "Only hosts can send messages to the host channel",
      );
    }
    if (input.channel === ChatChannel.PRIVATE && !input.recipientUserId) {
      throw new BadRequestException(
        "Private messages require a recipient",
      );
    }
    if (
      input.channel !== ChatChannel.PRIVATE &&
      input.recipientUserId !== undefined
    ) {
      throw new BadRequestException(
        "Recipients are supported only for private messages",
      );
    }
    if (
      input.channel === ChatChannel.PRIVATE &&
      input.recipientUserId === principal.userId
    ) {
      throw new BadRequestException("You cannot send a private message to yourself");
    }

    const result = await this.database.run(principal, async (transaction) => {
      await this.assertSessionActive(transaction, sessionId);
      if (input.channel === ChatChannel.PRIVATE && input.recipientUserId) {
        const recipientMembership = await transaction.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: principal.workspaceId,
              userId: input.recipientUserId,
            },
          },
          select: { userId: true },
        });
        if (!recipientMembership) {
          throw new NotFoundException(
            "Private message recipient is not a member of this workspace",
          );
        }
      }

      const created = await transaction.chatMessage.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          authorUserId: principal.userId,
          recipientUserId:
            input.channel === ChatChannel.PRIVATE
              ? input.recipientUserId
              : null,
          channel: input.channel,
          body: input.body.trim(),
        },
        include: {
          author: { select: { displayName: true, avatarUrl: true } },
          recipient: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "chat_message",
        aggregateId: created.id,
        eventType: "chat.message.created",
        payload: this.toJson(created),
      });
      const hostUserIds =
        input.channel === ChatChannel.HOSTS
          ? (
              await transaction.workspaceMembership.findMany({
                where: {
                  workspaceId: principal.workspaceId,
                  role: { in: HOST_ROLES },
                },
                select: { userId: true },
              })
            ).map((membership) => membership.userId)
          : [];

      return { created, hostUserIds };
    });

    if (input.channel === ChatChannel.EVERYONE) {
      this.realtime.publishSessionEvent({
        sessionId,
        eventName: "chat.message.created",
        payload: result.created,
      });
    } else if (input.channel === ChatChannel.HOSTS) {
      for (const userId of result.hostUserIds) {
        this.realtime.publishUserEvent({
          userId,
          eventName: "chat.message.created",
          payload: result.created,
        });
      }
    } else {
      const recipientUserId = result.created.recipientUserId;
      for (const userId of new Set(
        [principal.userId, recipientUserId].filter(
          (value): value is string => Boolean(value),
        ),
      )) {
        this.realtime.publishUserEvent({
          userId,
          eventName: "chat.message.created",
          payload: result.created,
        });
      }
    }
    return result.created;
  }

  async sendReaction(
    principal: Principal,
    sessionId: string,
    input: SendReactionDto,
  ) {
    await this.database.run(principal, async (transaction) => {
      await this.assertSessionActive(transaction, sessionId);
    });
    const payload = {
      sessionId,
      userId: principal.userId,
      displayName: principal.displayName,
      reaction: input.reaction,
      occurredAt: new Date().toISOString(),
    };
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "session.reaction",
      payload,
    });
    return payload;
  }

  async setHandRaise(
    principal: Principal,
    sessionId: string,
    input: SetHandRaiseDto,
  ) {
    await this.database.run(principal, async (transaction) => {
      await this.assertSessionActive(transaction, sessionId);
    });
    const payload = {
      sessionId,
      userId: principal.userId,
      displayName: principal.displayName,
      raised: input.raised,
      occurredAt: new Date().toISOString(),
    };
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "session.hand_raise",
      payload,
    });
    return payload;
  }

  async listPolls(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      return transaction.poll.findMany({
        where: { sessionId },
        include: {
          options: { orderBy: { position: "asc" } },
          _count: { select: { answers: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    });
  }

  async createPoll(
    principal: Principal,
    sessionId: string,
    input: CreatePollDto,
  ) {
    this.assertHost(principal);
    const choicePoll = CHOICE_POLL_TYPES.includes(input.type);
    const options = input.options
      .map((option) => option.trim())
      .filter(Boolean);
    if (choicePoll && options.length < 2) {
      throw new BadRequestException(
        "Choice polls require at least two options",
      );
    }
    if (
      !choicePoll &&
      input.type !== PollType.WORD_CLOUD &&
      options.length > 0
    ) {
      throw new BadRequestException(
        "Open text polls do not accept predefined options",
      );
    }

    const poll = await this.database.run(principal, async (transaction) => {
      await this.assertSessionActive(transaction, sessionId);
      const created = await transaction.poll.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          createdById: principal.userId,
          question: input.question.trim(),
          type: input.type,
          anonymous: input.anonymous,
          options: {
            create: options.map((label, position) => ({
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              label,
              position,
            })),
          },
        },
        include: { options: { orderBy: { position: "asc" } } },
      });
      await this.audit.record(transaction, principal, {
        action: "poll.created",
        resourceType: "poll",
        resourceId: created.id,
        metadata: { sessionId, type: created.type },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "poll",
        aggregateId: created.id,
        eventType: "poll.created",
        payload: this.toJson(created),
      });
      return created;
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "poll.created",
      payload: poll,
    });
    return poll;
  }

  async launchPoll(principal: Principal, sessionId: string, pollId: string) {
    this.assertHost(principal);
    const poll = await this.database.run(principal, async (transaction) => {
      await this.assertSessionActive(transaction, sessionId);
      const existingLive = await transaction.poll.findFirst({
        where: { sessionId, status: PollStatus.LIVE, id: { not: pollId } },
        select: { id: true },
      });
      if (existingLive)
        throw new ConflictException("Close the current live poll first");
      const result = await transaction.poll.updateMany({
        where: { id: pollId, sessionId, status: PollStatus.DRAFT },
        data: { status: PollStatus.LIVE, launchedAt: new Date() },
      });
      if (result.count === 0)
        throw new ConflictException("Only a draft poll can be launched");
      const launched = await transaction.poll.findUniqueOrThrow({
        where: { id: pollId },
        include: { options: { orderBy: { position: "asc" } } },
      });
      await this.audit.record(transaction, principal, {
        action: "poll.launched",
        resourceType: "poll",
        resourceId: pollId,
        metadata: { sessionId },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "poll",
        aggregateId: pollId,
        eventType: "poll.launched",
        payload: this.toJson(launched),
      });
      return launched;
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "poll.launched",
      payload: poll,
    });
    return poll;
  }

  async closePoll(principal: Principal, sessionId: string, pollId: string) {
    this.assertHost(principal);
    const poll = await this.database.run(principal, async (transaction) => {
      const result = await transaction.poll.updateMany({
        where: { id: pollId, sessionId, status: PollStatus.LIVE },
        data: { status: PollStatus.CLOSED, closedAt: new Date() },
      });
      if (result.count === 0)
        throw new ConflictException("Only a live poll can be closed");
      const closed = await transaction.poll.findUniqueOrThrow({
        where: { id: pollId },
        include: { options: { orderBy: { position: "asc" } } },
      });
      await this.audit.record(transaction, principal, {
        action: "poll.closed",
        resourceType: "poll",
        resourceId: pollId,
        metadata: { sessionId },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "poll",
        aggregateId: pollId,
        eventType: "poll.closed",
        payload: this.toJson(closed),
      });
      return closed;
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "poll.closed",
      payload: poll,
    });
    return poll;
  }

  async submitPollAnswer(
    principal: Principal,
    sessionId: string,
    pollId: string,
    input: SubmitPollAnswerDto,
  ) {
    const answer = await this.database.run(principal, async (transaction) => {
      const poll = await transaction.poll.findFirst({
        where: { id: pollId, sessionId },
        include: { options: true },
      });
      if (!poll) throw new NotFoundException("Poll not found");
      if (poll.status !== PollStatus.LIVE) {
        throw new ConflictException("The poll is not accepting answers");
      }
      const validOptionIds = new Set(poll.options.map((option) => option.id));
      if (input.selectedOptionIds.some((id) => !validOptionIds.has(id))) {
        throw new BadRequestException(
          "One or more selected options are invalid",
        );
      }
      if (
        SINGLE_ANSWER_POLL_TYPES.includes(poll.type) &&
        input.selectedOptionIds.length !== 1
      ) {
        throw new BadRequestException("This poll requires exactly one option");
      }
      if (
        poll.type === PollType.MULTIPLE_CHOICE &&
        input.selectedOptionIds.length === 0
      ) {
        throw new BadRequestException("Select at least one option");
      }
      if (
        TEXT_RESPONSE_POLL_TYPES.includes(poll.type) &&
        !input.textAnswer?.trim()
      ) {
        throw new BadRequestException("A text response is required");
      }

      const saved = await transaction.pollAnswer.upsert({
        where: {
          pollId_respondentKey: { pollId, respondentKey: principal.userId },
        },
        update: {
          selectedOptionIds: input.selectedOptionIds,
          textAnswer: input.textAnswer?.trim() || null,
        },
        create: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          pollId,
          respondentKey: principal.userId,
          respondentUserId: principal.userId,
          selectedOptionIds: input.selectedOptionIds,
          textAnswer: input.textAnswer?.trim() || null,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "poll",
        aggregateId: pollId,
        eventType: "poll.answer.recorded",
        payload: { pollId, respondentKey: principal.userId },
      });
      return saved;
    });
    const results = await this.getPollResults(principal, sessionId, pollId);
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "poll.results.updated",
      payload: results,
    });
    return answer;
  }

  async getPollResults(
    principal: Principal,
    sessionId: string,
    pollId: string,
  ) {
    return this.database.run(principal, async (transaction) => {
      const poll = await transaction.poll.findFirst({
        where: { id: pollId, sessionId },
        include: { options: { orderBy: { position: "asc" } }, answers: true },
      });
      if (!poll) throw new NotFoundException("Poll not found");
      const host = hasAnyRole(principal, HOST_ROLES);
      const counts = new Map(poll.options.map((option) => [option.id, 0]));
      for (const answer of poll.answers) {
        const selected = Array.isArray(answer.selectedOptionIds)
          ? answer.selectedOptionIds.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        for (const optionId of selected) {
          if (counts.has(optionId))
            counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
        }
      }
      return {
        pollId,
        status: poll.status,
        responseCount: poll.answers.length,
        options: poll.options.map((option) => ({
          id: option.id,
          label: option.label,
          count: counts.get(option.id) ?? 0,
        })),
        textAnswers: host
          ? poll.answers
              .map((answer) => answer.textAnswer)
              .filter((answer): answer is string => Boolean(answer))
          : undefined,
      };
    });
  }

  async listQuestions(principal: Principal, sessionId: string) {
    return this.database.run(principal, async (transaction) => {
      await this.assertSessionExists(transaction, sessionId);
      const host = hasAnyRole(principal, HOST_ROLES);
      const questions = await transaction.question.findMany({
        where: {
          sessionId,
          ...(!host
            ? {
                status: {
                  in: [QuestionStatus.APPROVED, QuestionStatus.ANSWERED],
                },
              }
            : {}),
        },
        include: { _count: { select: { votes: true } } },
        orderBy: { createdAt: "asc" },
      });
      return questions
        .map((question) => ({
          ...question,
          authorDisplayName: question.isAnonymous
            ? null
            : question.authorDisplayName,
          voteCount: question._count.votes,
          _count: undefined,
        }))
        .sort((left, right) => right.voteCount - left.voteCount);
    });
  }

  async createQuestion(
    principal: Principal,
    sessionId: string,
    input: CreateQuestionDto,
  ) {
    const question = await this.database.run(principal, async (transaction) => {
      const session = await this.assertSessionActive(transaction, sessionId);
      const host = hasAnyRole(principal, HOST_ROLES);
      const status =
        session.kind === SessionKind.WEBINAR && !host
          ? QuestionStatus.PENDING
          : QuestionStatus.APPROVED;
      const created = await transaction.question.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          sessionId,
          authorUserId: principal.userId,
          authorDisplayName: principal.displayName,
          body: input.body.trim(),
          isAnonymous: input.isAnonymous,
          status,
        },
        include: { _count: { select: { votes: true } } },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "question",
        aggregateId: created.id,
        eventType: "question.created",
        payload: this.toJson(created),
      });
      return { ...created, voteCount: created._count.votes, _count: undefined };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "question.created",
      payload: question,
    });
    return question;
  }

  async toggleQuestionVote(
    principal: Principal,
    sessionId: string,
    questionId: string,
  ) {
    const result = await this.database.run(principal, async (transaction) => {
      const question = await transaction.question.findFirst({
        where: { id: questionId, sessionId },
      });
      if (!question) throw new NotFoundException("Question not found");
      if (!VOTABLE_QUESTION_STATUSES.includes(question.status)) {
        throw new ConflictException("This question is not open for voting");
      }
      const existing = await transaction.questionVote.findUnique({
        where: {
          questionId_voterKey: { questionId, voterKey: principal.userId },
        },
      });
      if (existing) {
        await transaction.questionVote.delete({ where: { id: existing.id } });
      } else {
        await transaction.questionVote.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            questionId,
            voterKey: principal.userId,
          },
        });
      }
      const voteCount = await transaction.questionVote.count({
        where: { questionId },
      });
      return { questionId, voted: !existing, voteCount };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "question.votes.updated",
      payload: result,
    });
    return result;
  }

  async moderateQuestion(
    principal: Principal,
    sessionId: string,
    questionId: string,
    input: ModerateQuestionDto,
  ) {
    this.assertHost(principal);
    if (input.status === QuestionStatus.ANSWERED && !input.answerText?.trim()) {
      throw new BadRequestException(
        "An answer is required when marking a question answered",
      );
    }
    const question = await this.database.run(principal, async (transaction) => {
      const existing = await transaction.question.findFirst({
        where: { id: questionId, sessionId },
      });
      if (!existing) throw new NotFoundException("Question not found");
      const updated = await transaction.question.update({
        where: { id: questionId },
        data: {
          status: input.status,
          ...(input.answerText !== undefined
            ? { answerText: input.answerText.trim() }
            : {}),
          answeredAt:
            input.status === QuestionStatus.ANSWERED
              ? (existing.answeredAt ?? new Date())
              : existing.answeredAt,
        },
        include: { _count: { select: { votes: true } } },
      });
      await this.audit.record(transaction, principal, {
        action: "question.moderated",
        resourceType: "question",
        resourceId: questionId,
        metadata: { sessionId, from: existing.status, to: updated.status },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "question",
        aggregateId: questionId,
        eventType: "question.updated",
        payload: this.toJson(updated),
      });
      return { ...updated, voteCount: updated._count.votes, _count: undefined };
    });
    this.realtime.publishSessionEvent({
      sessionId,
      eventName: "question.updated",
      payload: question,
    });
    return question;
  }

  private async assertSessionExists(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await transaction.session.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, kind: true },
    });
    if (!session) throw new NotFoundException("Session not found");
    return session;
  }

  private async assertSessionActive(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await this.assertSessionExists(transaction, sessionId);
    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
      throw new ConflictException(
        `Collaboration is unavailable while session is ${session.status}`,
      );
    }
    return session;
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException("A host role is required");
    }
  }

  private toJson(value: unknown): Prisma.JsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
  }
}
