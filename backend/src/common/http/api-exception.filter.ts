import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const incomingRequestId = request.headers['x-request-id'];
    const requestId =
      typeof incomingRequestId === 'string' && incomingRequestId.length <= 128
        ? incomingRequestId
        : randomUUID();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException
        ? (exception.getResponse() as string | HttpExceptionBody)
        : undefined;
    const rawMessage =
      typeof body === 'string'
        ? body
        : body?.message ??
          (status >= 500 ? 'An unexpected error occurred' : 'The request could not be completed');
    const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage;
    const validationErrors =
      typeof body !== 'string' && Array.isArray(body?.message) ? body.message : undefined;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed (${requestId})`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    reply.header('x-request-id', requestId);
    void reply.status(status).send({
      error: {
        code: this.codeFor(status, exception),
        message,
        ...(validationErrors ? { details: { validationErrors } } : {}),
        requestId,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }

  private codeFor(status: number, exception: unknown): string {
    if (exception instanceof HttpException) {
      const name = exception.constructor.name
        .replace(/Exception$/, '')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase();
      if (name) return name;
    }
    return status >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`;
  }
}
