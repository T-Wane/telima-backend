import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnyStaff } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { AdminStaffService } from './admin-staff.service';
import { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto';

// Comptes du dashboard et leurs droits. Hors /admin/me, tout est reserve a l'acces total
// (aucun module declare : voir RolesGuard).
@ApiTags('Admin — Comptes du dashboard')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('admin')
export class AdminStaffController {
  constructor(private readonly staff: AdminStaffService) {}

  @AnyStaff()
  @Get('me')
  @ApiOperation({ summary: 'Mon compte et mes droits (tout compte du dashboard)' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.me(user.id);
  }

  @Get('staff')
  @ApiOperation({ summary: 'Lister les comptes du dashboard' })
  list() {
    return this.staff.list();
  }

  @Post('staff')
  @ApiOperation({ summary: 'Creer un compte employe avec ses droits' })
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Patch('staff/:id')
  @ApiOperation({ summary: "Modifier un compte (droits, activation, mot de passe...)" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(user.id, id, dto);
  }

  @Delete('staff/:id')
  @ApiOperation({ summary: 'Supprimer un compte du dashboard' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.remove(user.id, id);
  }
}
