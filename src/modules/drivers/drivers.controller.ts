import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { DriverStatus, UserRole } from '@prisma/client';
import { DriversService } from './drivers.service';
import { CommissionsService } from '../commissions/commissions.service';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { SuspendDriverDto } from './dto/suspend-driver.dto';
import { UpdateOnlineStatusDto } from './dto/update-online-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly commissionsService: CommissionsService,
  ) {}

  @Post('upload-document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Type de fichier non autorise (JPEG, PNG, WebP, PDF)'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Uploader un document chauffeur' })
  @ApiResponse({ status: 201, description: 'URL du document uploade' })
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('type') documentType: string,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier recu');
    }
    return this.driversService.uploadDocument(user.id, file, documentType);
  }

  @Post('register')
  @ApiOperation({ summary: 'Creer un profil chauffeur' })
  @ApiResponse({ status: 201, description: 'Profil chauffeur cree' })
  @ApiResponse({ status: 409, description: 'Profil deja existant' })
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDriverDto) {
    return this.driversService.register(user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Recuperer son profil chauffeur' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.driversService.findByUserId(user.id);
  }

  @Patch('me/online-status')
  @ApiOperation({ summary: 'Mettre a jour le statut en ligne' })
  updateOnlineStatus(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOnlineStatusDto) {
    return this.driversService.updateOnlineStatus(user.id, dto.isOnline);
  }

  // Sprint 5 : solde financier du chauffeur (balance, commissionDue, stats semaine/mois).
  @Get('me/finances')
  @ApiOperation({ summary: 'Solde financier du chauffeur (Sprint 5)' })
  @ApiResponse({ status: 200, description: 'Balance, commission due, stats semaine/mois' })
  @ApiResponse({ status: 404, description: 'Profil chauffeur introuvable' })
  getMyFinances(@CurrentUser() user: AuthenticatedUser) {
    return this.commissionsService.getDriverFinances(user.id);
  }

  // Sprint 5 : historique pagine des paiements de commission du chauffeur.
  @Get('me/commissions')
  @ApiOperation({ summary: 'Historique des paiements de commission (Sprint 5)' })
  @ApiResponse({ status: 200, description: 'Liste paginee des paiements' })
  listMyCommissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commissionsService.listCommissionPayments(
      user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Roles(UserRole.admin)
  @Get()
  @ApiOperation({ summary: 'Lister tous les chauffeurs (admin)' })
  findAll(@Query('status') status?: DriverStatus) {
    return this.driversService.findAll(status);
  }

  @Roles(UserRole.admin)
  @Get(':id')
  @ApiOperation({ summary: 'Recuperer un chauffeur par ID (admin)' })
  findOne(@Param('id') id: string) {
    return this.driversService.findById(id);
  }

  @Roles(UserRole.admin)
  @Patch(':id/validate')
  @ApiOperation({ summary: 'Valider un chauffeur (admin)' })
  validate(@Param('id') id: string) {
    return this.driversService.validate(id);
  }

  @Roles(UserRole.admin)
  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspendre un chauffeur (admin)' })
  suspend(@Param('id') id: string, @Body() dto: SuspendDriverDto) {
    return this.driversService.suspend(id, dto.reason);
  }
}
