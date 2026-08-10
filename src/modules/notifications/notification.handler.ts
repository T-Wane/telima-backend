import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_PROVIDER, PushProvider } from '../providers/push/push-provider.interface';
import { DomainEvents } from '../domain-events/domain-events.constants';
import type {
  TripAcceptedEvent,
  TripStartedEvent,
  TripCompletedEvent,
  TripCancelledEvent,
  TripArrivedEvent,
  ChatMessageSentEvent,
} from '../domain-events/events/domain-events';

// Notification handler : ecoute les domain events et envoie des notifications push
// via le PushProvider (mock ou FCM). Recupere les tokens d'appareil du destinataire
// depuis la base et envoie un push par token.
@Injectable()
export class NotificationHandler {
  private readonly logger = new Logger(NotificationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: PushProvider,
  ) {}

  @OnEvent(DomainEvents.TripAccepted)
  async handleTripAccepted(event: TripAcceptedEvent): Promise<void> {
    await this.sendToUser(event.clientId, {
      title: 'Chauffeur en route',
      body: 'Votre chauffeur a accepté la course et se dirige vers vous.',
      data: { tripId: event.tripId, type: 'trip_accepted' },
      priority: 'high',
    });
  }

  @OnEvent(DomainEvents.TripArrived)
  async handleTripArrived(event: TripArrivedEvent): Promise<void> {
    await this.sendToUser(event.clientId, {
      title: 'Chauffeur arrivé',
      body: 'Votre chauffeur est arrivé sur le lieu de prise en charge.',
      data: { tripId: event.tripId, type: 'trip_arrived' },
      priority: 'high',
    });
  }

  @OnEvent(DomainEvents.TripStarted)
  async handleTripStarted(event: TripStartedEvent): Promise<void> {
    await this.sendToUser(event.clientId, {
      title: 'Course en cours',
      body: 'Votre course a démarré. Bon trajet !',
      data: { tripId: event.tripId, type: 'trip_started' },
    });
  }

  @OnEvent(DomainEvents.TripCompleted)
  async handleTripCompleted(event: TripCompletedEvent): Promise<void> {
    await this.sendToUser(event.clientId, {
      title: 'Course terminée',
      body: `Votre course est terminée. Prix: ${event.finalPrice} FCFA. N'oubliez pas de noter votre chauffeur.`,
      data: { tripId: event.tripId, type: 'trip_completed', finalPrice: String(event.finalPrice) },
    });
  }

  @OnEvent(DomainEvents.TripCancelled)
  async handleTripCancelled(event: TripCancelledEvent): Promise<void> {
    // Notifier l'autre partie (si client annule -> chauffeur, si chauffeur annule -> client)
    const trip = await this.prisma.trip.findUnique({
      where: { id: event.tripId },
      select: { clientId: true, driver: { select: { userId: true } } },
    });
    if (!trip) return;

    const targetUserId =
      event.cancelledBy === trip.clientId
        ? trip.driver?.userId
        : trip.clientId;

    if (targetUserId) {
      await this.sendToUser(targetUserId, {
        title: 'Course annulée',
        body: `La course a été annulée. Raison: ${event.reason || 'non précisée'}`,
        data: { tripId: event.tripId, type: 'trip_cancelled' },
      });
    }
  }

  @OnEvent(DomainEvents.ChatMessageSent)
  async handleChatMessageSent(event: ChatMessageSentEvent): Promise<void> {
    // Notifier le destinataire (si client envoie -> chauffeur, si chauffeur envoie -> client)
    const trip = await this.prisma.trip.findUnique({
      where: { id: event.tripId },
      select: { clientId: true, driver: { select: { userId: true } } },
    });
    if (!trip) return;

    const targetUserId =
      event.senderRole === 'client'
        ? trip.driver?.userId
        : trip.clientId;

    if (targetUserId) {
      await this.sendToUser(targetUserId, {
        title: 'Nouveau message',
        body: 'Vous avez reçu un nouveau message.',
        data: { tripId: event.tripId, type: 'chat_message' },
      });
    }
  }

  private async sendToUser(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, string>; priority?: 'high' | 'normal' },
  ): Promise<void> {
    try {
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });

      if (tokens.length === 0) return;

      const notifications = tokens.map((t) => ({
        token: t.token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        priority: notification.priority ?? 'normal',
      }));

      await this.pushProvider.sendMulticast(notifications);
    } catch (err) {
      this.logger.warn(
        `Failed to send push notification to user ${userId}: ${(err as Error).message}`,
      );
    }
  }
}
