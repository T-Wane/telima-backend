import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DispatchService } from './dispatch.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Dispatch')
@ApiBearerAuth()
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  // Rattrapage : le chauffeur ouvre l'appli via la notification push alors que
  // l'evenement WS trip:new_request a ete perdu (socket coupe / appli tuee).
  @Get('pending')
  @ApiOperation({
    summary: 'Demande de course en attente pour le chauffeur connecte',
  })
  @ApiResponse({ status: 200, description: 'Payload trip:new_request ou null' })
  async getPending(@CurrentUser() user: AuthenticatedUser) {
    const request = await this.dispatchService.getPendingRequestForDriver(user.id);
    return { request };
  }
}
