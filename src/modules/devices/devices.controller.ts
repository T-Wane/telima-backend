import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('register')
  @ApiOperation({ summary: 'Enregistrer un token d’appareil pour les notifications push' })
  @ApiResponse({ status: 201, description: 'Token enregistré' })
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(user.id, dto);
  }

  @Delete(':token')
  @ApiOperation({ summary: 'Supprimer un token d’appareil (logout / désinstallation)' })
  @ApiResponse({ status: 200, description: 'Token supprimé' })
  unregister(@Param('token') token: string) {
    return this.devicesService.unregister(token);
  }
}
