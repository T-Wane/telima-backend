import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const message =
      isHttpException && typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? ((exceptionResponse as Record<string, unknown>).message ?? exception.message)
        : isHttpException
          ? exception.message
          : 'Erreur interne du serveur';

    if (!isHttpException) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    } else if (status >= 400 && status < 500) {
      this.logger.warn(`${request.method} ${request.url} → ${status}: ${message}`);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
