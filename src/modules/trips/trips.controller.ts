import { Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripStatusDto } from './dto/update-trip-status.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { PaymentReceivedDto } from './dto/payment-received.dto';
import { DeclineTripDto } from './dto/decline-trip.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Idempotent } from '../../common/interceptors/idempotency.interceptor';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @Idempotent()
  @ApiOperation({ summary: 'Créer une nouvelle course' })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      "Clé d'idempotence (UUID). Si fournie, une requête dupliquée retourne la réponse initiale.",
  })
  @ApiResponse({ status: 201, description: 'Course créée' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 404, description: 'Type de véhicule introuvable' })
  @ApiResponse({ status: 409, description: 'Idempotency-Key en cours de traitement' })
  createTrip(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTripDto) {
    return this.tripsService.createTrip(user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Lister mes courses (client ou chauffeur)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Liste paginée des courses' })
  listMyTrips(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.tripsService.listMyTrips(
      user.id,
      user.role,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une course par ID' })
  @ApiResponse({ status: 200, description: 'Détails de la course' })
  @ApiResponse({ status: 404, description: 'Course introuvable' })
  getTrip(@Param('id', ParseUUIDPipe) id: string) {
    return this.tripsService.getTrip(id);
  }

  @Patch(':id/status')
  @Idempotent()
  @ApiOperation({ summary: "Mettre à jour le statut d'une course" })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      "Clé d'idempotence (UUID). Si fournie, une requête dupliquée retourne la réponse initiale.",
  })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 400, description: 'Transition invalide' })
  @ApiResponse({ status: 403, description: 'Action non autorisée pour ce rôle' })
  @ApiResponse({ status: 404, description: 'Course introuvable' })
  @ApiResponse({ status: 409, description: 'Idempotency-Key en cours de traitement' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTripStatusDto,
  ) {
    return this.tripsService.updateStatus(id, user.id, user.role, dto);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accepter une course (chauffeur) — équivalent REST de WS trip:accept' })
  @ApiResponse({ status: 200, description: 'Course acceptée' })
  @ApiResponse({ status: 400, description: 'Transition invalide' })
  @ApiResponse({ status: 403, description: 'Course non assignée à ce chauffeur (dispatch)' })
  @ApiResponse({ status: 404, description: 'Course introuvable' })
  acceptTrip(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.acceptTrip(id, user.id);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Refuser une course (chauffeur) — équivalent REST de WS trip:decline' })
  @ApiResponse({ status: 200, description: 'Course refusée, dispatch relancé' })
  @ApiResponse({ status: 403, description: 'Course non assignée à ce chauffeur (dispatch)' })
  @ApiResponse({ status: 404, description: 'Course introuvable' })
  declineTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeclineTripDto,
  ) {
    return this.tripsService.declineTrip(id, user.id, dto.reason);
  }

  @Post(':id/payment-received')
  @ApiOperation({ summary: 'Confirmer la réception du paiement cash (chauffeur)' })
  @ApiResponse({ status: 200, description: 'Paiement confirmé' })
  @ApiResponse({ status: 400, description: 'Statut de course invalide pour cette action' })
  @ApiResponse({ status: 403, description: "Ce n'est pas votre course" })
  @ApiResponse({ status: 404, description: 'Course introuvable' })
  confirmPaymentReceived(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PaymentReceivedDto,
  ) {
    return this.tripsService.confirmPaymentReceived(id, user.id, user.role, dto);
  }

  @Post(':id/rating')
  @ApiOperation({ summary: 'Noter la course (client ou chauffeur)' })
  @ApiResponse({ status: 201, description: 'Note enregistrée' })
  @ApiResponse({ status: 400, description: 'La course doit être terminée' })
  @ApiResponse({ status: 403, description: "Ce n'est pas votre course" })
  @ApiResponse({ status: 409, description: 'Course déjà notée par cet utilisateur' })
  rateTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRatingDto,
  ) {
    return this.tripsService.rateTrip(id, user.id, user.role, dto);
  }
}
