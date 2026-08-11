import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { SenderRole } from '@prisma/client';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('trips/:tripId/messages')
  @ApiOperation({ summary: "Historique des messages d'une course" })
  @ApiResponse({ status: 200, description: 'Liste des messages (ordre chronologique)' })
  @ApiResponse({ status: 403, description: 'Ne participe pas à cette course' })
  getMessages(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.getMessages(tripId, user.id);
  }

  // Fallback REST de WS message:send (API_CONTRACT.md : REST pour fiabilite, WS pour
  // temps reel). Meme logique de persistance + broadcast que le handler WS.
  @Post('trips/:tripId/messages')
  @ApiOperation({ summary: 'Envoyer un message (fallback REST de WS message:send)' })
  @ApiResponse({ status: 201, description: 'Message créé et diffusé via WS' })
  @ApiResponse({ status: 400, description: 'content ou audioUrl requis' })
  @ApiResponse({ status: 403, description: 'Ne participe pas à cette course' })
  sendMessage(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMessageDto,
  ) {
    const senderRole = user.role === 'driver' ? SenderRole.driver : SenderRole.client;
    return this.chatService.createMessage(tripId, user.id, senderRole, dto.content, dto.audioUrl);
  }

  @Post('chat/upload-audio')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'audio/mpeg',
          'audio/mp4',
          'audio/m4a',
          'audio/x-m4a',
          'audio/aac',
          'audio/wav',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Format audio non autorisé'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Uploader un fichier audio pour le chat' })
  @ApiResponse({ status: 201, description: 'URL du fichier audio uploadé' })
  async uploadAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    return this.chatService.uploadAudio(file);
  }
}
