import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { UpdatePositionDto } from './dto/update-position.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('position')
  @ApiOperation({
    summary: 'Remonter la position GPS (chauffeur) — fallback REST de WS driver:position',
  })
  @ApiResponse({ status: 201, description: 'Position enregistrée et diffusée si course en cours' })
  @ApiResponse({ status: 404, description: 'Profil chauffeur introuvable' })
  updatePosition(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePositionDto) {
    return this.trackingService.updatePosition(user.id, dto);
  }
}
