import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SenderRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage-provider.interface';
import { BroadcastService } from '../events/services/broadcast.service';
import { WsEvents } from '../events/events.constants';
import { DomainEvents } from '../domain-events/domain-events.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ChatMessageSentEvent } from '../domain-events/events/domain-events';

// Module Chat (Sprint 3) : messagerie 1:1 client<->chauffeur, contextuelle a une course
// active (trip_id). Persistee en base + transport temps reel via Socket.io. Ne depend
// d'aucun autre module metier (TripsModule/DispatchModule) : verifie l'appartenance a la
// course directement via PrismaService (global), evitant toute dependance circulaire.
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly broadcast: BroadcastService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getMessages(tripId: string, userId: string) {
    await this.assertParticipant(tripId, userId);
    return this.prisma.chatMessage.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async uploadAudio(file: { buffer: Buffer; originalname: string; mimetype: string }) {
    return this.storageProvider.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'chat/audio',
    });
  }

  async createMessage(
    tripId: string,
    senderId: string,
    senderRole: SenderRole,
    content?: string,
    audioUrl?: string,
  ) {
    if (!content && !audioUrl) {
      throw new BadRequestException('content ou audioUrl requis');
    }
    await this.assertParticipant(tripId, senderId);

    const message = await this.prisma.chatMessage.create({
      data: { tripId, senderId, senderRole, content, audioUrl },
    });

    this.broadcast.emitToTrip(tripId, WsEvents.MessageReceived, message);

    const event: ChatMessageSentEvent = {
      messageId: message.id,
      tripId,
      senderId,
      senderRole: senderRole === SenderRole.driver ? 'driver' : 'client',
    };
    this.eventEmitter.emit(DomainEvents.ChatMessageSent, event);

    return message;
  }

  private async assertParticipant(tripId: string, userId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { clientId: true, driver: { select: { userId: true } } },
    });
    if (!trip) {
      throw new BadRequestException('Course introuvable');
    }
    const isParticipant = trip.clientId === userId || trip.driver?.userId === userId;
    if (!isParticipant) {
      throw new ForbiddenException('Vous ne participez pas à cette course');
    }
  }
}
